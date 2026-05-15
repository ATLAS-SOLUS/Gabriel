// netlify/functions/google-config.js
// Exponhe somente dados públicos do OAuth para o frontend.
// O client_secret nunca deve ser enviado ao navegador.

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  // Client ID é público por natureza no OAuth Web.
  // Mantemos fallback para evitar o erro deleted_client quando a variável ainda não foi criada no Netlify.
  const DEFAULT_GOOGLE_CLIENT_ID = '864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com';
  const DEFAULT_GOOGLE_REDIRECT_URI = 'https://atlasgabriel.netlify.app/auth/google/callback';

  const clientId = process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || DEFAULT_GOOGLE_REDIRECT_URI;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: true,
      client_id: clientId,
      redirect_uri: redirectUri
    })
  };
};
