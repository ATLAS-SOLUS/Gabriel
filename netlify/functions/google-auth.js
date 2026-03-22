// netlify/functions/google-auth.js
// Troca o authorization code por access_token + refresh_token
// Deploy: coloque em /netlify/functions/google-auth.js no repositório

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin':  'https://atlasgabriel.netlify.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const { code, redirect_uri } = JSON.parse(event.body || '{}');
    if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código ausente' }) };

    // Variáveis de ambiente do Netlify
    // Configure em: Site Settings → Environment Variables
    const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI  = redirect_uri || process.env.GOOGLE_REDIRECT_URI;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Variáveis de ambiente não configuradas' })
      };
    }

    // Troca code por tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[google-auth] Erro Google:', tokenData);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: tokenData.error_description || tokenData.error })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in:    tokenData.expires_in || 3600,
        token_type:    tokenData.token_type
      })
    };

  } catch (err) {
    console.error('[google-auth] Erro interno:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro interno: ' + err.message })
    };
  }
};
