// netlify/functions/google-auth.js
// Troca authorization code por tokens e renova access_token via refresh_token.

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'exchange';

    // Client ID pode ter fallback público; Client Secret precisa ficar no ambiente seguro do Netlify.
    const DEFAULT_GOOGLE_CLIENT_ID = '864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com';
    const DEFAULT_GOOGLE_REDIRECT_URI = 'https://atlasgabriel.netlify.app/auth/google/callback';

    const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI  = body.redirect_uri || process.env.GOOGLE_REDIRECT_URI || DEFAULT_GOOGLE_REDIRECT_URI;

    if (!CLIENT_SECRET) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'GOOGLE_CLIENT_SECRET não configurado no Netlify. Configure em Site configuration > Environment variables e faça novo deploy.'
        })
      };
    }

    let tokenBody;

    if (action === 'refresh') {
      if (!body.refresh_token) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'refresh_token ausente' }) };
      }
      tokenBody = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: body.refresh_token,
        grant_type: 'refresh_token'
      });
    } else {
      if (!body.code) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código ausente' }) };
      }
      tokenBody = new URLSearchParams({
        code: body.code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      });
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error('[google-auth] Erro Google:', tokenData);
      return {
        statusCode: tokenRes.status || 400,
        headers,
        body: JSON.stringify({ error: tokenData.error_description || tokenData.error || 'Erro ao obter token Google' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in || 3600,
        token_type: tokenData.token_type
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
