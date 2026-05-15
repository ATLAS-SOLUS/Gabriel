// netlify/functions/google-auth.js
// Gabriel PWA — Google OAuth token bridge
// Correção forte para 401 deleted_client:
// - NÃO usa process.env para Client ID/Secret, porque variável antiga no Netlify pode sobrescrever o client novo.
// - Usa sempre o OAuth Client novo criado em 15/05/2026.
// - Valida se o frontend iniciou login com o mesmo Client ID.
// Atenção: este arquivo roda como Netlify Function. Não importe este arquivo em HTML/JS público.

const GOOGLE_OAUTH = Object.freeze({
  clientId: '864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com',
  clientSecret: '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',
  redirectUri: 'https://atlasgabriel.netlify.app/auth/google/callback',
  version: '20260515-oauth-force-client-v3'
});

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function safeSuffix(value) {
  return String(value || '').slice(-24);
}

function normalizeText(value) {
  return String(value || '').trim();
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '*';
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, headers, { ok: false, error: 'Método não permitido' });

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'exchange';

    const CLIENT_ID = GOOGLE_OAUTH.clientId;
    const CLIENT_SECRET = GOOGLE_OAUTH.clientSecret;
    const REDIRECT_URI = GOOGLE_OAUTH.redirectUri;
    const clientIdUsedByBrowser = normalizeText(body.client_id_used);

    if (clientIdUsedByBrowser && clientIdUsedByBrowser !== CLIENT_ID) {
      return json(409, headers, {
        ok: false,
        error: 'O navegador iniciou o login com um Client ID diferente do backend. Limpe o cache/PWA em /reset-google.html e faça novo login.',
        code: 'CLIENT_ID_FRONTEND_BACKEND_MISMATCH',
        browser_client_id_suffix: safeSuffix(clientIdUsedByBrowser),
        backend_client_id_suffix: safeSuffix(CLIENT_ID),
        oauth_version: GOOGLE_OAUTH.version
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

      // Importante: o redirect_uri precisa ser exatamente o cadastrado no Google Cloud e o mesmo usado no login.
      // Não aceitamos valor vindo do localStorage/body para evitar URI velho/cacheado quebrando a troca do code.
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
      let code = tokenData.error || 'GOOGLE_TOKEN_ERROR';

      if (/deleted_client/i.test(rawError)) {
        code = 'GOOGLE_DELETED_CLIENT';
        friendly = 'O Google respondeu que o Client ID usado na troca do token foi apagado. Esta versão força o Client ID novo no backend; se aparecer de novo, o deploy publicado ainda é antigo ou existe cache de Function no Netlify.';
      } else if (/redirect_uri_mismatch/i.test(rawError)) {
        code = 'GOOGLE_REDIRECT_URI_MISMATCH';
        friendly = 'Redirect URI diferente do cadastrado no Google Cloud. Use exatamente: https://atlasgabriel.netlify.app/auth/google/callback';
      } else if (/invalid_client/i.test(rawError)) {
        code = 'GOOGLE_INVALID_CLIENT';
        friendly = 'Client Secret inválida ou pertencente a outro Client ID no Google Cloud.';
      } else if (/invalid_grant/i.test(rawError)) {
        code = 'GOOGLE_INVALID_GRANT';
        friendly = 'Código OAuth expirado ou já usado. Volte ao login e autorize novamente.';
      }

      console.error('[google-auth] Erro Google:', {
        action,
        status: tokenRes.status,
        code,
        googleError: tokenData,
        backendClientIdSuffix: safeSuffix(CLIENT_ID),
        browserClientIdSuffix: safeSuffix(clientIdUsedByBrowser),
        redirectUri: REDIRECT_URI,
        oauthVersion: GOOGLE_OAUTH.version
      });

      return json(tokenRes.status || 400, headers, {
        ok: false,
        error: friendly,
        code,
        raw_error: rawError,
        google_error: tokenData.error || null,
        backend_client_id_suffix: safeSuffix(CLIENT_ID),
        browser_client_id_suffix: safeSuffix(clientIdUsedByBrowser),
        redirect_uri: REDIRECT_URI,
        oauth_version: GOOGLE_OAUTH.version
      });
    }

    return json(200, headers, {
      ok: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in || 3600,
      token_type: tokenData.token_type || 'Bearer',
      backend_client_id_suffix: safeSuffix(CLIENT_ID),
      oauth_version: GOOGLE_OAUTH.version
    });
  } catch (err) {
    console.error('[google-auth] Erro interno:', err);
    return json(500, headers, { ok: false, error: 'Erro interno: ' + err.message, oauth_version: GOOGLE_OAUTH.version });
  }
};
