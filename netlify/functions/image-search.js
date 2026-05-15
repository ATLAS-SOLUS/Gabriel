// netlify/functions/image-search.js
// Gabriel PWA — busca visual barata/grátis
// Fontes: Wikimedia Commons sem chave; Openverse anônimo quando disponível;
// opcionais: PEXELS_API_KEY e UNSPLASH_ACCESS_KEY nas variáveis do Netlify.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok:false, error:'Método não permitido' }) };

  const clean = v => String(v || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const uniq = (items) => {
    const seen = new Set();
    return items.filter(item => {
      const key = String(item.image || item.thumb || item.url || item.title || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  async function wikimedia(query, count) {
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: String(Math.min(count, 12)),
      prop: 'imageinfo',
      iiprop: 'url|mime|size|extmetadata',
      iiurlwidth: '640',
      format: 'json',
      origin: '*'
    }).toString();
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});
    return pages.map(p => {
      const info = p.imageinfo?.[0] || {};
      const meta = info.extmetadata || {};
      const title = clean(meta.ObjectName?.value || p.title || '').replace(/^File:/i, '');
      const desc = clean(meta.ImageDescription?.value || meta.Caption?.value || '');
      const author = clean(meta.Artist?.value || meta.Credit?.value || '');
      return {
        title,
        description: desc.slice(0, 240),
        author: author.slice(0, 120),
        image: info.thumburl || info.url || '',
        full: info.url || info.thumburl || '',
        url: p.title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` : (info.descriptionurl || ''),
        source: 'Wikimedia Commons',
        license: clean(meta.LicenseShortName?.value || '')
      };
    }).filter(x => x.image);
  }

  async function openverse(query, count) {
    try {
      const url = 'https://api.openverse.org/v1/images/?' + new URLSearchParams({
        q: query,
        page_size: String(Math.min(count, 10)),
        mature: 'false'
      }).toString();
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map(x => ({
        title: clean(x.title || query),
        description: clean(x.description || ''),
        author: clean(x.creator || ''),
        image: x.thumbnail || x.url || '',
        full: x.url || x.thumbnail || '',
        url: x.foreign_landing_url || x.url || '',
        source: 'Openverse',
        license: clean(x.license || '')
      })).filter(x => x.image);
    } catch(e) { return []; }
  }

  async function pexels(query, count) {
    const key = process.env.PEXELS_API_KEY;
    if (!key) return [];
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(count, 10)}&locale=pt-BR`, {
      headers: { Authorization: key, Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.photos || []).map(p => ({
      title: clean(p.alt || query),
      description: clean(p.alt || ''),
      author: clean(p.photographer || ''),
      image: p.src?.medium || p.src?.large || p.src?.original || '',
      full: p.src?.original || p.src?.large2x || p.src?.large || '',
      url: p.url || '',
      source: 'Pexels',
      license: 'Pexels'
    })).filter(x => x.image);
  }

  async function unsplash(query, count) {
    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return [];
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${Math.min(count, 10)}&lang=pt`, {
      headers: { Authorization: `Client-ID ${key}`, Accept: 'application/json' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(p => ({
      title: clean(p.alt_description || p.description || query),
      description: clean(p.description || p.alt_description || ''),
      author: clean(p.user?.name || ''),
      image: p.urls?.small || p.urls?.regular || '',
      full: p.urls?.full || p.urls?.regular || '',
      url: p.links?.html || '',
      source: 'Unsplash',
      license: 'Unsplash'
    })).filter(x => x.image);
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const query = clean(body.query || '');
    const count = Math.max(1, Math.min(Number(body.count || 8), 12));
    if (!query) return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:'Query ausente' }) };

    const settled = await Promise.allSettled([
      wikimedia(query, count),
      openverse(query, count),
      pexels(query, count),
      unsplash(query, count)
    ]);

    const results = uniq(settled.flatMap(r => r.status === 'fulfilled' ? r.value : [])).slice(0, count);
    return { statusCode: 200, headers, body: JSON.stringify({ ok:true, query, count: results.length, results }) };
  } catch(err) {
    console.error('[image-search]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
