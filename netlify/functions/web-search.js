// netlify/functions/web-search.js
// Proxy para Brave Search API — sem CORS, seguro
// Configure BRAVE_SEARCH_API_KEY nas variáveis de ambiente do Netlify

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  'https://atlasgabriel.netlify.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  try {
    const { query, count = 5 } = JSON.parse(event.body || '{}');
    if (!query) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query ausente' }) };

    const API_KEY = process.env.BRAVE_SEARCH_API_KEY;

    // Se não tiver chave Brave, usa fallback DuckDuckGo
    if (!API_KEY) {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
      const ddgRes = await fetch(ddgUrl);
      const ddgData = await ddgRes.json();

      const results = [];
      if (ddgData.AbstractText) {
        results.push({ title: ddgData.Heading, snippet: ddgData.AbstractText, url: ddgData.AbstractURL });
      }
      (ddgData.RelatedTopics || []).slice(0, 4).forEach(t => {
        if (t.Text) results.push({ title: t.Text.split(' - ')[0], snippet: t.Text, url: t.FirstURL });
      });

      return { statusCode: 200, headers, body: JSON.stringify({ results, source: 'duckduckgo' }) };
    }

    // Brave Search API
    const braveRes = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&search_lang=pt&country=BR&text_decorations=false`,
      { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': API_KEY } }
    );

    if (!braveRes.ok) {
      throw new Error(`Brave API erro: ${braveRes.status}`);
    }

    const braveData = await braveRes.json();
    const results = (braveData.web?.results || []).slice(0, count).map(r => ({
      title:   r.title,
      snippet: r.description || r.extra_snippets?.[0] || '',
      url:     r.url,
      age:     r.age || ''
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ results, source: 'brave' }) };

  } catch (err) {
    console.error('[web-search]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
