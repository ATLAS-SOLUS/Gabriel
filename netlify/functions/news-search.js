// netlify/functions/news-search.js
// Gabriel PWA — busca gratuita de notícias via Google News RSS com fallback GDELT.

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function clean(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? clean(m[1]) : '';
}

function parseGoogleNews(xml, count) {
  const items = String(xml || '').match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, count).map(item => {
    const rawTitle = tag(item, 'title');
    const parts = rawTitle.split(' - ');
    const source = parts.length > 1 ? parts.pop() : 'Google News';
    const title = parts.join(' - ') || rawTitle;
    return {
      title,
      snippet: tag(item, 'description'),
      url: tag(item, 'link'),
      publishedAt: tag(item, 'pubDate'),
      source,
      provider: 'Google News RSS'
    };
  }).filter(r => r.title && r.url);
}

async function googleNews(query, count) {
  const url = 'https://news.google.com/rss/search?' + new URLSearchParams({
    q: query,
    hl: 'pt-BR',
    gl: 'BR',
    ceid: 'BR:pt-419'
  }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': 'GabrielPWA/1.0' } });
  if (!res.ok) return [];
  return parseGoogleNews(await res.text(), count);
}

async function gdelt(query, count) {
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(Math.min(count, 20)),
    sort: 'datedesc'
  }).toString();
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.articles || []).slice(0, count).map(a => ({
    title: clean(a.title),
    snippet: clean(a.seendate || a.domain || ''),
    url: a.url,
    publishedAt: a.seendate || '',
    source: a.domain || 'GDELT',
    provider: 'GDELT'
  })).filter(r => r.title && r.url);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok:false, error:'Método não permitido' });

  try {
    const { query, count = 8 } = JSON.parse(event.body || '{}');
    if (!query) return json(400, headers, { ok:false, error:'Query ausente' });
    let results = await googleNews(query, count).catch(() => []);
    if (!results.length) results = await gdelt(query, count).catch(() => []);
    return json(200, headers, { ok:true, query, count: results.length, results });
  } catch (err) {
    return json(500, headers, { ok:false, error: err.message });
  }
};
