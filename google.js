// ============================================================
// google.js — Motor Google OAuth + Drive + Photos + Keep + Translate
// Gabriel PWA
// ============================================================

const Google = (() => {

  const CLIENT_ID    = '796196296469-pu0h3695e6mbig82rdpegl82f5pkr4bo.apps.googleusercontent.com';
  const REDIRECT_URI = 'https://atlasgabriel.netlify.app/auth/google/callback';

  const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
  ].join(' ');

  const KEYS = {
    access_token:  'gabriel_google_access_token',
    refresh_token: 'gabriel_google_refresh_token',
    token_expiry:  'gabriel_google_token_expiry',
    connected:     'gabriel_google_connected',
    user_email:    'gabriel_google_email',
    user_name:     'gabriel_google_name',
    user_picture:  'gabriel_google_picture',
    user_id:       'gabriel_google_user_id',
  };

  // ── Estado ───────────────────────────────────────────────
  function isConnected()   { return localStorage.getItem(KEYS.connected) === 'true'; }
  function getAccessToken(){ return localStorage.getItem(KEYS.access_token); }
  function getTokenExpiry(){ return parseInt(localStorage.getItem(KEYS.token_expiry) || '0'); }
  function isTokenValid()  { return isConnected() && getAccessToken() && Date.now() < getTokenExpiry(); }
  function getConnectedEmail()  { return localStorage.getItem(KEYS.user_email) || ''; }
  function getConnectedName()   { return localStorage.getItem(KEYS.user_name)  || ''; }
  function getConnectedPicture(){ return localStorage.getItem(KEYS.user_picture)|| ''; }
  function getConnectedUserId() { return localStorage.getItem(KEYS.user_id)    || ''; }

  // ── Salvar tokens ────────────────────────────────────────
  function saveTokens({ access_token, refresh_token, expires_in, email, name, picture, id }) {
    localStorage.setItem(KEYS.access_token, access_token);
    localStorage.setItem(KEYS.token_expiry, Date.now() + ((expires_in || 3600) * 1000));
    localStorage.setItem(KEYS.connected,    'true');
    if (refresh_token) localStorage.setItem(KEYS.refresh_token, refresh_token);
    if (email)   localStorage.setItem(KEYS.user_email,   email);
    if (name)    localStorage.setItem(KEYS.user_name,    name);
    if (picture) localStorage.setItem(KEYS.user_picture, picture);
    if (id)      localStorage.setItem(KEYS.user_id,      id);
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
      prompt:        'consent select_account',
      state
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // ── Request autenticado ──────────────────────────────────
  async function request(url, options = {}) {
    if (!isTokenValid()) throw new Error('Token Google inválido. Reconecte nas Configurações.');
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (res.status === 401) { disconnect(); throw new Error('Sessão Google expirada. Conecte novamente.'); }
    return res;
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

  // ── GMAIL ────────────────────────────────────────────────
  const Gmail = {
    async list(maxResults = 10, query = '') {
      const params = new URLSearchParams({ maxResults, q: query || 'in:inbox -category:promotions -category:social' });
      const res  = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
      const data = await res.json();
      if (!data.messages) return [];
      const emails = await Promise.all(data.messages.slice(0, maxResults).map(m => Gmail.get(m.id)));
      return emails.filter(Boolean);
    },
    async get(id) {
      try {
        const res  = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From,Subject,Date,To`);
        const data = await res.json();
        const headers = data.payload?.headers || [];
        const get = (name) => headers.find(h => h.name === name)?.value || '';
        return { id: data.id, subject: get('Subject') || '(sem assunto)', from: get('From'), to: get('To'), date: new Date(parseInt(data.internalDate)).toLocaleString('pt-BR'), snippet: data.snippet || '', unread: data.labelIds?.includes('UNREAD'), labels: data.labelIds || [] };
      } catch { return null; }
    },
    async send({ to, subject, body, replyToId }) {
      const from = getConnectedEmail();
      const lines = [`To: ${to}`, `From: ${from}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8'];
      if (replyToId) lines.push(`In-Reply-To: ${replyToId}`);
      lines.push('', body);
      const raw = btoa(unescape(encodeURIComponent(lines.join('\r\n')))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const res  = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    },
    async countUnread() {
      try {
        const res  = await request('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX');
        const data = await res.json();
        return data.messagesUnread || 0;
      } catch { return 0; }
    }
  };

  // ── GOOGLE CALENDAR ──────────────────────────────────────
  const Calendar = {
    async list(days = 7) {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + days * 86400000).toISOString();
      const params = new URLSearchParams({ timeMin: now, timeMax: end, singleEvents: true, orderBy: 'startTime', maxResults: 20 });
      const res  = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
      const data = await res.json();
      return (data.items || []).map(ev => ({ id: ev.id, title: ev.summary || '(sem título)', description: ev.description || '', start: ev.start?.dateTime || ev.start?.date, end: ev.end?.dateTime || ev.end?.date, location: ev.location || '', link: ev.htmlLink || '', allDay: !ev.start?.dateTime }));
    },
    async create({ title, description, start, end, location }) {
      const startDT = new Date(start);
      const endDT   = end ? new Date(end) : new Date(startDT.getTime() + 3600000);
      const body = { summary: title, description: description || '', location: location || '', start: { dateTime: startDT.toISOString(), timeZone: 'America/Sao_Paulo' }, end: { dateTime: endDT.toISOString(), timeZone: 'America/Sao_Paulo' } };
      const res  = await request('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    },
    async delete(eventId) {
      await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, { method: 'DELETE' });
    },
    async today() {
      const start = new Date(); start.setHours(0,0,0,0);
      const end   = new Date(); end.setHours(23,59,59,999);
      const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: true, orderBy: 'startTime' });
      const res  = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
      const data = await res.json();
      return data.items || [];
    }
  };

  // ── GOOGLE DRIVE ─────────────────────────────────────────
  const Drive = {
    // Lista arquivos
    async list(query = '', pageSize = 20, folderId = null) {
      let q = query || "trashed=false";
      if (folderId) q = `'${folderId}' in parents and trashed=false`;
      const params = new URLSearchParams({ q, pageSize, fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,parents)' });
      const res  = await request(`https://www.googleapis.com/drive/v3/files?${params}`);
      const data = await res.json();
      return data.files || [];
    },
    // Cria pasta
    async createFolder(name, parentId = null) {
      const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
      if (parentId) meta.parents = [parentId];
      const res  = await request('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: JSON.stringify(meta) });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    },
    // Upload de arquivo
    async upload(file, folderId = null, onProgress = null) {
      const meta = { name: file.name };
      if (folderId) meta.parents = [folderId];
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', file);
      const token = getAccessToken();
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        if (onProgress) xhr.upload.onprogress = (e) => onProgress(Math.round(e.loaded/e.total*100));
        xhr.onload = () => {
          const data = JSON.parse(xhr.responseText);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data);
        };
        xhr.onerror = () => reject(new Error('Erro de rede'));
        xhr.send(form);
      });
    },
    // Buscar arquivo por nome
    async search(term) {
      const q = `name contains '${term}' and trashed=false`;
      return await Drive.list(q);
    },
    // Ler conteúdo de arquivo texto
    async readText(fileId) {
      const res = await request(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
      return await res.text();
    },
    // Salvar arquivo de texto
    async saveText(name, content, folderId = null) {
      const meta = { name };
      if (folderId) meta.parents = [folderId];
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([content], { type: 'text/plain' }));
      const token = getAccessToken();
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
      });
      return await res.json();
    },
    // Deletar
    async delete(fileId) {
      await request(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
    },
    // Pasta do Gabriel no Drive
    async getOrCreateGabrielFolder() {
      const files = await Drive.list(`name='Gabriel IA' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      if (files.length > 0) return files[0].id;
      const folder = await Drive.createFolder('Gabriel IA');
      return folder.id;
    },
    // Salvar memórias no Drive
    async saveMemories(memoriesJson) {
      const folderId = await Drive.getOrCreateGabrielFolder();
      const existing = await Drive.list(`name='memorias.json' and '${folderId}' in parents and trashed=false`);
      if (existing.length > 0) {
        // Atualiza arquivo existente
        const token = getAccessToken();
        const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing[0].id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: memoriesJson
        });
        return await res.json();
      } else {
        return await Drive.saveText('memorias.json', memoriesJson, folderId);
      }
    },
    // Carregar memórias do Drive
    async loadMemories() {
      try {
        const folderId = await Drive.getOrCreateGabrielFolder();
        const files = await Drive.list(`name='memorias.json' and '${folderId}' in parents and trashed=false`);
        if (!files.length) return null;
        return await Drive.readText(files[0].id);
      } catch { return null; }
    }
  };

  // ── GOOGLE PHOTOS ────────────────────────────────────────
  const Photos = {
    async list(pageSize = 20) {
      const res  = await request(`https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=${pageSize}`);
      const data = await res.json();
      return (data.mediaItems || []).map(item => ({
        id:          item.id,
        filename:    item.filename,
        url:         item.baseUrl + '=w400-h300',
        fullUrl:     item.baseUrl + '=d',
        mimeType:    item.mimeType,
        createdTime: item.mediaMetadata?.creationTime,
        width:       item.mediaMetadata?.width,
        height:      item.mediaMetadata?.height,
      }));
    },
    async search(query) {
      const body = { pageSize: 20, filters: { contentFilter: { includedContentCategories: [query.toUpperCase()] } } };
      const res  = await request('https://photoslibrary.googleapis.com/v1/mediaItems:search', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      return data.mediaItems || [];
    },
    async getAlbums() {
      const res  = await request('https://photoslibrary.googleapis.com/v1/albums?pageSize=20');
      const data = await res.json();
      return data.albums || [];
    },
    async getAlbumItems(albumId) {
      const body = { albumId, pageSize: 50 };
      const res  = await request('https://photoslibrary.googleapis.com/v1/mediaItems:search', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      return (data.mediaItems || []).map(item => ({
        id: item.id, filename: item.filename,
        url: item.baseUrl + '=w400-h300', fullUrl: item.baseUrl + '=d',
        mimeType: item.mimeType, createdTime: item.mediaMetadata?.creationTime
      }));
    },
    async createAlbum(title) {
      const res  = await request('https://photoslibrary.googleapis.com/v1/albums', { method: 'POST', body: JSON.stringify({ album: { title } }) });
      return await res.json();
    }
  };

  // ── GOOGLE KEEP ──────────────────────────────────────────
  // Keep não tem API pública oficial — usamos Drive para simular notas keep
  const Keep = {
    FOLDER_NAME: 'Gabriel Keep',
    async getFolderId() {
      const files = await Drive.list(`name='Gabriel Keep' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      if (files.length > 0) return files[0].id;
      const folder = await Drive.createFolder('Gabriel Keep');
      return folder.id;
    },
    async list() {
      const folderId = await Keep.getFolderId();
      const files = await Drive.list('', 50, folderId);
      const notes = [];
      for (const f of files) {
        try {
          const content = await Drive.readText(f.id);
          const note = JSON.parse(content);
          notes.push({ ...note, driveId: f.id, modifiedTime: f.modifiedTime });
        } catch {}
      }
      return notes.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
    },
    async create({ title, content, color = '#fff', pinned = false, labels = [] }) {
      const folderId = await Keep.getFolderId();
      const note = { id: Date.now().toString(36), title, content, color, pinned, labels, createdAt: new Date().toISOString() };
      await Drive.saveText(`note_${note.id}.json`, JSON.stringify(note), folderId);
      return note;
    },
    async update(driveId, fields) {
      const content = await Drive.readText(driveId);
      const note = JSON.parse(content);
      const updated = { ...note, ...fields, updatedAt: new Date().toISOString() };
      const token = getAccessToken();
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${driveId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      return updated;
    },
    async delete(driveId) {
      await Drive.delete(driveId);
    }
  };

  // ── GOOGLE TRANSLATE ─────────────────────────────────────
  const Translate = {
    async translate(text, targetLang = 'pt', sourceLang = null) {
      const token = getAccessToken();
      const body = { q: text, target: targetLang };
      if (sourceLang) body.source = sourceLang;
      const res = await fetch('https://translation.googleapis.com/language/translate/v2', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return data.data?.translations?.[0]?.translatedText || '';
    },
    async detectLanguage(text) {
      const token = getAccessToken();
      const res = await fetch(`https://translation.googleapis.com/language/translate/v2/detect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text })
      });
      const data = await res.json();
      return data.data?.detections?.[0]?.[0]?.language || 'unknown';
    }
  };

  // ── Desconectar ──────────────────────────────────────────
  function disconnect() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('gabriel_google_banner_dismissed');
    console.log('[Google] Desconectado.');
  }

  // ── Status ───────────────────────────────────────────────
  function getStatus() {
    return {
      connected:  isConnected(),
      tokenValid: isTokenValid(),
      email:      getConnectedEmail(),
      name:       getConnectedName(),
      picture:    getConnectedPicture(),
      expiry:     getTokenExpiry() ? new Date(getTokenExpiry()).toLocaleString('pt-BR') : null
    };
  }

  return {
    connect, disconnect,
    isConnected, isTokenValid,
    getConnectedEmail, getConnectedName, getConnectedPicture, getConnectedUserId,
    saveTokens, getUserInfo,
    getStatus, request,
    Gmail, Calendar, Drive, Photos, Keep, Translate
  };
})();

window.Google = Google;
console.log('[Gabriel] google.js carregado ✓');
