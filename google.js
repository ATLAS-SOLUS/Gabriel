// ============================================================
// google.js — Motor Google OAuth (Gmail + Agenda)
// Gabriel PWA
// ============================================================

const Google = (() => {

  // ── Configuração OAuth ───────────────────────────────────
  const CLIENT_ID    = '796196296469-pu0h3695e6mbig82rdpegl82f5pkr4bo.apps.googleusercontent.com';
  const REDIRECT_URI = 'https://atlasgabriel.netlify.app/auth/google/callback';
  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');

  const KEYS = {
    access_token:  'gabriel_google_access_token',
    refresh_token: 'gabriel_google_refresh_token',
    token_expiry:  'gabriel_google_token_expiry',
    connected:     'gabriel_google_connected',
    user_email:    'gabriel_google_email',
    user_name:     'gabriel_google_name'
  };

  // ── Estado ───────────────────────────────────────────────

  function isConnected() {
    return localStorage.getItem(KEYS.connected) === 'true';
  }

  function getAccessToken() {
    return localStorage.getItem(KEYS.access_token);
  }

  function getTokenExpiry() {
    return parseInt(localStorage.getItem(KEYS.token_expiry) || '0');
  }

  function isTokenValid() {
    return isConnected() && getAccessToken() && Date.now() < getTokenExpiry();
  }

  function getConnectedEmail() {
    return localStorage.getItem(KEYS.user_email) || '';
  }

  function getConnectedName() {
    return localStorage.getItem(KEYS.user_name) || '';
  }

  // ── Salvar tokens ────────────────────────────────────────

  function saveTokens({ access_token, refresh_token, expires_in, email, name }) {
    localStorage.setItem(KEYS.access_token,  access_token);
    localStorage.setItem(KEYS.token_expiry,  Date.now() + (expires_in * 1000));
    localStorage.setItem(KEYS.connected,     'true');
    if (refresh_token) localStorage.setItem(KEYS.refresh_token, refresh_token);
    if (email) localStorage.setItem(KEYS.user_email, email);
    if (name)  localStorage.setItem(KEYS.user_name,  name);
    console.log('[Google] Tokens salvos ✓');
  }

  // ── Iniciar fluxo OAuth ──────────────────────────────────

  function connect() {
    const state = btoa(JSON.stringify({ ts: Date.now(), from: window.location.pathname }));
    localStorage.setItem('gabriel_oauth_state', state);

    const params = new URLSearchParams({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPES,
      access_type:   'offline',
      prompt:        'consent',
      state
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // ── Processar callback OAuth ─────────────────────────────
  // Chamado na página /auth/google/callback ou pelo index.html

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');
    const error  = params.get('error');

    if (error) {
      console.error('[Google] OAuth erro:', error);
      return { success: false, error };
    }

    if (!code) return { success: false, error: 'Código ausente' };

    // Troca code por tokens via backend/netlify function
    try {
      const res = await fetch('/.netlify/functions/google-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao trocar token');

      // Busca info do usuário
      const userInfo = await getUserInfo(data.access_token);
      saveTokens({ ...data, email: userInfo.email, name: userInfo.name });

      // Redireciona para onde estava
      const savedState = JSON.parse(atob(state || btoa('{"from":"/dashboard.html"}')));
      window.location.href = savedState.from || 'dashboard.html';
      return { success: true };

    } catch (err) {
      console.error('[Google] Callback erro:', err);
      return { success: false, error: err.message };
    }
  }

  // ── Info do usuário ──────────────────────────────────────

  async function getUserInfo(token) {
    try {
      const res  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return await res.json();
    } catch { return {}; }
  }

  // ── Request autenticado ──────────────────────────────────

  async function request(url, options = {}) {
    if (!isTokenValid()) {
      throw new Error('Token Google inválido ou expirado. Reconecte nas configurações.');
    }
    const token = getAccessToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (res.status === 401) {
      disconnect();
      throw new Error('Sessão Google expirada. Conecte novamente.');
    }
    return res;
  }

  // ── GMAIL ────────────────────────────────────────────────

  const Gmail = {

    // Lista emails recentes
    async list(maxResults = 10, query = '') {
      const params = new URLSearchParams({
        maxResults,
        q: query || 'in:inbox -category:promotions -category:social'
      });
      const res  = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
      const data = await res.json();
      if (!data.messages) return [];

      // Busca detalhes de cada email
      const emails = await Promise.all(
        data.messages.slice(0, maxResults).map(m => Gmail.get(m.id))
      );
      return emails.filter(Boolean);
    },

    // Busca email por ID
    async get(id) {
      try {
        const res  = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From,Subject,Date,To`);
        const data = await res.json();
        const headers = data.payload?.headers || [];
        const get = (name) => headers.find(h => h.name === name)?.value || '';

        return {
          id:      data.id,
          subject: get('Subject') || '(sem assunto)',
          from:    get('From'),
          to:      get('To'),
          date:    new Date(parseInt(data.internalDate)).toLocaleString('pt-BR'),
          snippet: data.snippet || '',
          unread:  data.labelIds?.includes('UNREAD'),
          labels:  data.labelIds || []
        };
      } catch { return null; }
    },

    // Lê corpo completo do email
    async getBody(id) {
      try {
        const res  = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
        const data = await res.json();
        const body = extractBody(data.payload);
        return { ...await Gmail.get(id), body };
      } catch { return null; }
    },

    // Envia email
    async send({ to, subject, body, replyToId }) {
      let raw = '';

      if (replyToId) {
        const original = await Gmail.get(replyToId);
        raw = makeEmail({
          to,
          from: getConnectedEmail(),
          subject: subject || `Re: ${original.subject}`,
          body,
          inReplyTo: replyToId
        });
      } else {
        raw = makeEmail({ to, from: getConnectedEmail(), subject, body });
      }

      const res = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    },

    // Marca como lido
    async markRead(id) {
      await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
        method: 'POST',
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
      });
    },

    // Conta não lidos
    async countUnread() {
      try {
        const res  = await request('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX');
        const data = await res.json();
        return data.messagesUnread || 0;
      } catch { return 0; }
    }
  };

  // ── Helpers de email ─────────────────────────────────────

  function makeEmail({ to, from, subject, body, inReplyTo }) {
    const lines = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
    ];
    if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push('', body);
    const email = lines.join('\r\n');
    return btoa(unescape(encodeURIComponent(email)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function extractBody(payload) {
    if (!payload) return '';
    if (payload.body?.data) {
      return atob(payload.body.data.replace(/-/g,'+').replace(/_/g,'/'));
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        const text = extractBody(part);
        if (text) return text;
      }
    }
    return '';
  }

  // ── GOOGLE CALENDAR ──────────────────────────────────────

  const Calendar = {

    // Lista eventos dos próximos N dias
    async list(days = 7) {
      const now   = new Date().toISOString();
      const end   = new Date(Date.now() + days * 86400000).toISOString();
      const params = new URLSearchParams({
        timeMin: now,
        timeMax: end,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20
      });

      const res  = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
      const data = await res.json();

      return (data.items || []).map(ev => ({
        id:          ev.id,
        title:       ev.summary || '(sem título)',
        description: ev.description || '',
        start:       ev.start?.dateTime || ev.start?.date,
        end:         ev.end?.dateTime   || ev.end?.date,
        location:    ev.location || '',
        link:        ev.htmlLink || '',
        allDay:      !ev.start?.dateTime
      }));
    },

    // Cria evento
    async create({ title, description, start, end, location }) {
      const startDT = new Date(start);
      const endDT   = end ? new Date(end) : new Date(startDT.getTime() + 3600000);

      const body = {
        summary:     title,
        description: description || '',
        location:    location || '',
        start: { dateTime: startDT.toISOString(), timeZone: 'America/Sao_Paulo' },
        end:   { dateTime: endDT.toISOString(),   timeZone: 'America/Sao_Paulo' }
      };

      const res  = await request('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        body:   JSON.stringify(body)
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    },

    // Deleta evento
    async delete(eventId) {
      await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'DELETE'
      });
    },

    // Eventos de hoje
    async today() {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const res  = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
      const data = await res.json();
      return data.items || [];
    }
  };

  // ── Desconectar ──────────────────────────────────────────

  function disconnect() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    console.log('[Google] Desconectado.');
  }

  // ── Status para UI ───────────────────────────────────────

  function getStatus() {
    return {
      connected:    isConnected(),
      tokenValid:   isTokenValid(),
      email:        getConnectedEmail(),
      name:         getConnectedName(),
      expiry:       getTokenExpiry() ? new Date(getTokenExpiry()).toLocaleString('pt-BR') : null
    };
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    connect,
    disconnect,
    handleCallback,
    isConnected,
    isTokenValid,
    getConnectedEmail,
    getConnectedName,
    getStatus,
    Gmail,
    Calendar
  };

})();

window.Google = Google;
console.log('[Gabriel] google.js carregado ✓');
