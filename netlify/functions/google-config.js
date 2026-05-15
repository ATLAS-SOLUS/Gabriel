// netlify/functions/google-config.js
// Retorna somente dados públicos do OAuth para o frontend.
// Client secret fica apenas no google-auth.js / ambiente do Netlify.

const GOOGLE_OAUTH_PUBLIC = {
  clientId: process.env.GOOGLE_CLIENT_ID || '864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://atlasgabriel.netlify.app/auth/google/callback'
};

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Método não permitido' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      mode: 'hardcoded',
      client_id: GOOGLE_OAUTH_PUBLIC.clientId,
      redirect_uri: GOOGLE_OAUTH_PUBLIC.redirectUri,
      client_id_suffix: GOOGLE_OAUTH_PUBLIC.clientId.slice(-18),
      updated_at: '2026-05-15T10:40:00-03:00'
    })
  };
};
