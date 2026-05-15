// netlify/functions/entertainment-search.js
// Pesquisa gratuita/sem chave para séries via TVMaze e fallback para filmes via Wikipedia/DuckDuckGo.
// Opcional: configure TMDB_API_KEY para melhorar busca de filmes.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  const stripHtml = (html = '') => String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const yearFromDate = d => d ? String(d).slice(0, 4) : '';

  async function tvmaze(query) {
    const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).slice(0, 8).map(item => {
      const s = item.show || {};
      return {
        type: 'serie',
        title: s.name || '',
        year: yearFromDate(s.premiered),
        status: s.status || '',
        genres: s.genres || [],
        rating: s.rating?.average || null,
        language: s.language || '',
        network: s.network?.name || s.webChannel?.name || '',
        summary: stripHtml(s.summary || ''),
        image: s.image?.medium || s.image?.original || '',
        poster: s.image?.original || s.image?.medium || '',
        imageUrl: s.image?.original || s.image?.medium || '',
        url: s.url || '',
        source: 'TVMaze'
      };
    }).filter(r => r.title);
  }

  async function tmdbMovie(query) {
    const key = process.env.TMDB_API_KEY;
    if (!key) return [];
    const isBearer = String(key).startsWith('ey');
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&language=pt-BR&include_adult=false${isBearer ? '' : '&api_key=' + encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: isBearer ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 8).map(m => ({
      type: 'filme',
      title: m.title || m.name || '',
      originalTitle: m.original_title || '',
      year: yearFromDate(m.release_date),
      rating: m.vote_average || null,
      summary: m.overview || '',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : '',
      image: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : '',
      imageUrl: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : '',
      url: m.id ? `https://www.themoviedb.org/movie/${m.id}` : '',
      source: 'TMDB'
    })).filter(r => r.title);
  }

  async function wikipedia(query) {
    const searchUrl = `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' filme série')}&format=json&origin=*&srlimit=5`;
    const res = await fetch(searchUrl);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.query?.search || []).slice(0, 5).map(item => ({
      type: 'referencia',
      title: item.title,
      summary: stripHtml(item.snippet || ''),
      url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      source: 'Wikipedia'
    }));
  }


  function isGenericEntertainmentQuery(query) {
    const q = stripHtml(query).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    return /^(traga|traz|trazer|mostra|mostrar|quero|busca|buscar|pesquisa|pesquisar)?\s*(filmes?|series?|filmes? e series?|series? e filmes?|filmes? populares|series? populares|recomendac(?:ao|oes).*)$/.test(q)
      || /filmes? e series? populares recomendados/.test(q);
  }

  function genericFallback() {
    return [
      { type:'filme', title:'Interestelar', year:'2014', rating:'', status:'', summary:'Ficção científica emocional e grandiosa, boa para quem gosta de mistério, espaço e drama familiar.', url:'', source:'Sugestão fixa do Gabriel' },
      { type:'filme', title:'A Origem', year:'2010', rating:'', status:'', summary:'Suspense de ficção científica com sonhos, camadas de realidade e ritmo forte.', url:'', source:'Sugestão fixa do Gabriel' },
      { type:'filme', title:'Duna', year:'2021', rating:'', status:'', summary:'Ficção científica épica, visual forte e universo político bem construído.', url:'', source:'Sugestão fixa do Gabriel' },
      { type:'filme', title:'Cidade de Deus', year:'2002', rating:'', status:'', summary:'Clássico brasileiro intenso, marcante e muito bem dirigido.', url:'', source:'Sugestão fixa do Gabriel' },
      { type:'serie', title:'Dark', year:'2017', rating:'', status:'Ended', summary:'Série alemã de mistério, viagem no tempo e drama familiar.', url:'https://www.tvmaze.com/shows/17861/dark', source:'Sugestão fixa do Gabriel' },
      { type:'serie', title:'Breaking Bad', year:'2008', rating:'', status:'Ended', summary:'Drama criminal com transformação de personagem e roteiro muito forte.', url:'https://www.tvmaze.com/shows/169/breaking-bad', source:'Sugestão fixa do Gabriel' },
      { type:'serie', title:'The Last of Us', year:'2023', rating:'', status:'Running', summary:'Drama pós-apocalíptico com foco em sobrevivência e emoção.', url:'https://www.tvmaze.com/shows/46562/the-last-of-us', source:'Sugestão fixa do Gabriel' },
      { type:'serie', title:'Stranger Things', year:'2016', rating:'', status:'Running', summary:'Aventura, suspense e nostalgia dos anos 80 com pegada sobrenatural.', url:'https://www.tvmaze.com/shows/2993/stranger-things', source:'Sugestão fixa do Gabriel' }
    ];
  }

  async function duckduckgo(query) {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query + ' filme série')}&format=json&no_redirect=1&no_html=1`);
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    if (data.AbstractText) out.push({ type: 'referencia', title: data.Heading || query, summary: data.AbstractText, url: data.AbstractURL, source: 'DuckDuckGo' });
    (data.RelatedTopics || []).slice(0, 4).forEach(t => {
      if (t.Text) out.push({ type: 'referencia', title: String(t.Text).split(' - ')[0], summary: t.Text, url: t.FirstURL, source: 'DuckDuckGo' });
    });
    return out;
  }

  try {
    const { query, type = 'auto' } = JSON.parse(event.body || '{}');
    if (!query) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Query ausente' }) };

    const genericQuery = isGenericEntertainmentQuery(query);

    const wantsSeries = type === 'series' || type === 'serie' || type === 'auto';
    const wantsMovies = type === 'movies' || type === 'movie' || type === 'filme' || type === 'auto';

    const tasks = [];
    if (wantsSeries) tasks.push(tvmaze(query));
    if (wantsMovies) tasks.push(tmdbMovie(query));
    tasks.push(wikipedia(query));
    tasks.push(duckduckgo(query));

    const settled = await Promise.allSettled(tasks);
    let results = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    if (genericQuery) {
      results = [...genericFallback(), ...results];
    }

    const seen = new Set();
    const unique = results.filter(item => {
      const key = `${item.source}|${item.title}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 14);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, query, results: unique }) };
  } catch (err) {
    console.error('[entertainment-search]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
