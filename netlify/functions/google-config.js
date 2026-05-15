// netlify/functions/google-config.js
// Retorna somente dados públicos do OAuth para o frontend.
// Correção forte: ignora process.env para não deixar variável antiga do Netlify devolver Client ID apagado.

const GOOGLE_OAUTH_PUBLIC = Object.freeze({
  clientId: '864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com',
  redirectUri: 'https://atlasgabriel.netlify.app/auth/google/callback',
  version: '20260515-oauth-force-client-v3'
});

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
      mode: 'hardcoded-force-no-env',
      client_id: GOOGLE_OAUTH_PUBLIC.clientId,
      redirect_uri: GOOGLE_OAUTH_PUBLIC.redirectUri,
      client_id_suffix: GOOGLE_OAUTH_PUBLIC.clientId.slice(-24),
      oauth_version: GOOGLE_OAUTH_PUBLIC.version,
      updated_at: '2026-05-15T11:05:00-03:00'
    })
  };
};
