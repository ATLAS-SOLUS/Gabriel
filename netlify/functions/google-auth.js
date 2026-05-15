// netlify/functions/google-auth.js
// Troca authorization code por tokens e renova access_token via refresh_token.
// Gabriel PWA — OAuth hardcoded para uso interno.
// Atenção: este arquivo roda como Function no Netlify. Não envie client_secret para HTML/JS público.

const GOOGLE_OAUTH = {
  clientId: process.env.GOOGLE_CLIENT_ID || '864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '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',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://atlasgabriel.netlify.app/auth/google/callback'
};

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Método não permitido' });

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'exchange';

    const CLIENT_ID = GOOGLE_OAUTH.clientId;
    const CLIENT_SECRET = GOOGLE_OAUTH.clientSecret;
    const REDIRECT_URI = body.redirect_uri || GOOGLE_OAUTH.redirectUri;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json(500, headers, {
        ok: false,
        error: 'Credenciais OAuth ausentes no código/ambiente.'
      });
    }

    let tokenBody;

    if (action === 'refresh') {
      if (!body.refresh_token) {
        return json(400, headers, { ok: false, error: 'refresh_token ausente' });
      }

      tokenBody = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: body.refresh_token,
        grant_type: 'refresh_token'
      });
    } else {
      if (!body.code) {
        return json(400, headers, { ok: false, error: 'Código ausente' });
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

    const tokenData = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || tokenData.error) {
      const rawError = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
      let friendly = rawError;

      if (/deleted_client/i.test(rawError)) {
        friendly = 'O Google ainda recebeu um Client ID apagado. Limpe cache/PWA e confirme se o deploy novo substituiu google.js e as Functions.';
      } else if (/redirect_uri_mismatch/i.test(rawError)) {
        friendly = 'Redirect URI diferente do cadastrado no Google Cloud. Use exatamente: https://atlasgabriel.netlify.app/auth/google/callback';
      } else if (/invalid_client/i.test(rawError)) {
        friendly = 'Client ID/Client Secret inválidos ou de clientes diferentes no Google Cloud.';
      }

      console.error('[google-auth] Erro Google:', {
        action,
        status: tokenRes.status,
        error: tokenData,
        clientIdSuffix: CLIENT_ID.slice(-18),
        redirectUri: REDIRECT_URI
      });

      return json(tokenRes.status || 400, headers, {
        ok: false,
        error: friendly,
        raw_error: rawError,
        google_error: tokenData.error || null,
        client_id_suffix: CLIENT_ID.slice(-18),
        redirect_uri: REDIRECT_URI
      });
    }

    return json(200, headers, {
      ok: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in || 3600,
      token_type: tokenData.token_type || 'Bearer'
    });
  } catch (err) {
    console.error('[google-auth] Erro interno:', err);
    return json(500, headers, { ok: false, error: 'Erro interno: ' + err.message });
  }
};
