// ============================================================
// actions.js — Motor Executor de Ações
// Gabriel PWA
// ============================================================

const Actions = (() => {

  // ── Resultado de execução ────────────────────────────────

  function result(action, success, message, data = null) {
    return { action, success, message, data };
  }

  // ── Resolver datas em linguagem natural ──────────────────

  function resolveDate(dateStr) {
    if (!dateStr) return null;

    // Já é formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    const now = new Date();
    const lower = dateStr.toLowerCase().trim();

    if (lower === 'hoje') {
      return now.toISOString().split('T')[0];
    }
    if (lower === 'amanhã' || lower === 'amanha') {
      const d = new Date(now.getTime() + 86400000);
      return d.toISOString().split('T')[0];
    }
    if (lower === 'depois de amanhã' || lower === 'depois de amanha') {
      const d = new Date(now.getTime() + 2 * 86400000);
      return d.toISOString().split('T')[0];
    }
    if (lower.includes('próxima semana') || lower.includes('proxima semana')) {
      const d = new Date(now.getTime() + 7 * 86400000);
      return d.toISOString().split('T')[0];
    }

    // Tenta parsear data normal
    const parsed = new Date(dateStr);
    if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];

    return dateStr;
  }

  function resolveMonth(monthStr) {
    if (!monthStr) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}$/.test(monthStr)) return monthStr;

    const lower = monthStr.toLowerCase();
    const now = new Date();
    if (lower.includes('atual') || lower.includes('esse') || lower.includes('este')) {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (lower.includes('próximo') || lower.includes('proximo')) {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    }
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // ── Resolver pasta por nome ──────────────────────────────

  async function resolveFolder(folderName) {
    if (!folderName) return 0;
    const folder = await GabrielDB.Folders.getByName(folderName);
    return folder ? folder.id : 0;
  }

  // ── EXECUTORES DE AÇÕES ──────────────────────────────────

  // 📁 Criar pasta
  async function execCreateFolder(params) {
    const { name, parentName } = params;
    if (!name) return result('create_folder', false, 'Nome da pasta não informado.');

    let parentId = 0;
    if (parentName) {
      const parent = await GabrielDB.Folders.getByName(parentName);
      parentId = parent ? parent.id : 0;
    }

    // Verifica se já existe
    const existing = await GabrielDB.Folders.getByName(name);
    if (existing) {
      return result('create_folder', true, `Pasta "${name}" já existe.`, existing);
    }

    const folder = await GabrielDB.Folders.create(name, parentId);
    return result('create_folder', true, `Pasta "${name}" criada com sucesso.`, folder);
  }

  // 📅 Criar evento
  async function execCreateEvent(params) {
    const { title, date, time, description, reminder, folderName } = params;
    if (!title) return result('create_event', false, 'Título do evento não informado.');

    const resolvedDate = resolveDate(date);
    const folderId = await resolveFolder(folderName);

    const event = await GabrielDB.Events.create({
      title,
      date: resolvedDate,
      time: time || null,
      description: description || '',
      reminder: reminder !== false,
      folderId,
      done: false
    });

    // Agenda notificação se tiver data e hora
    if (resolvedDate && time && window.Notifications) {
      await Notifications.scheduleEvent(event);
    }

    const dateFormatted = resolvedDate
      ? new Date(resolvedDate + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'sem data';

    return result(
      'create_event',
      true,
      `Evento "${title}" agendado para ${dateFormatted}${time ? ' às ' + time : ''}.`,
      event
    );
  }

  // 💰 Criar gasto financeiro
  async function execCreateFinance(params) {
    const { desc, value, category, card, month, folderName } = params;
    if (!desc) return result('create_finance', false, 'Descrição do gasto não informada.');
    if (!value && value !== 0) return result('create_finance', false, 'Valor do gasto não informado.');

    const resolvedMonth = resolveMonth(month);
    const folderId = await resolveFolder(folderName);

    const finance = await GabrielDB.Finances.create({
      desc,
      value: parseFloat(value),
      category: category || 'Geral',
      card: card || 'outros',
      month: resolvedMonth,
      folderId
    });

    const valueFormatted = parseFloat(value).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

    return result(
      'create_finance',
      true,
      `Gasto "${desc}" de ${valueFormatted} registrado em ${resolvedMonth}.`,
      finance
    );
  }

  // 📓 Criar nota
  async function execCreateNote(params) {
    const { title, content, folderName } = params;
    if (!title) return result('create_note', false, 'Título da nota não informado.');

    const folderId = await resolveFolder(folderName);
    const note = await GabrielDB.Notes.create(title, content || '', folderId);

    return result('create_note', true, `Nota "${title}" criada no caderno.`, note);
  }

  // ✅ Criar tarefa
  async function execCreateTask(params) {
    const { title, dueDate, folderName } = params;
    if (!title) return result('create_task', false, 'Título da tarefa não informado.');

    const resolvedDate = resolveDate(dueDate);
    const folderId = await resolveFolder(folderName);

    const task = await GabrielDB.Tasks.create(title, resolvedDate, folderId);

    return result(
      'create_task',
      true,
      `Tarefa "${title}" criada${resolvedDate ? ' para ' + new Date(resolvedDate + 'T00:00:00').toLocaleDateString('pt-BR') : ''}.`,
      task
    );
  }

  // 🌐 Pesquisa web
  async function execSearchWeb(params) {
    const { query } = params;
    if (!query) return result('search_web', false, 'Termo de pesquisa não informado.');

    const searchResult = await Groq.searchWeb(query);
    return result('search_web', true, searchResult, { query });
  }

  // 🌤️ Clima
  async function execGetWeather(params) {
    const { city } = params;
    const weatherResult = await Weather.get(city);
    return result('get_weather', true, weatherResult, { city });
  }

  // 🖥️ Abrir módulo
  async function execOpenModule(params) {
    const { module } = params;
    const routes = {
      dashboard: 'dashboard.html',
      chat:      'chat.html',
      folders:   'folders.html',
      agenda:    'agenda.html',
      finance:   'finance.html',
      notes:     'notes.html'
    };

    const page = routes[module];
    if (!page) return result('open_module', false, `Módulo "${module}" não encontrado.`);

    setTimeout(() => { window.location.href = page; }, 800);
    return result('open_module', true, `Abrindo ${module}...`, { module });
  }

  // ── GMAIL: listar e-mails ────────────────────────────────

  async function execGmailList({ query = '', max = 5 }) {
    if (!window.Google || !window.Google.isConnected()) {
      return result('gmail_list', false, 'Google não conectado. Conecte no Dashboard primeiro.');
    }
    try {
      const emails = await window.Google.Gmail.list(max, query);
      if (!emails.length) return result('gmail_list', true, 'Nenhum e-mail encontrado.', { emails: [] });
      const summary = emails.map(e =>
        `📧 **${e.subject}**\nDe: ${e.from}\n${e.date}${e.unread ? ' 🔵' : ''}\n${e.snippet}`
      ).join('\n\n---\n\n');
      return result('gmail_list', true, summary, { emails });
    } catch (err) {
      return result('gmail_list', false, `Erro ao buscar e-mails: ${err.message}`);
    }
  }

  // ── GMAIL: enviar e-mail ─────────────────────────────────

  async function execGmailSend({ to, subject, body }) {
    if (!window.Google || !window.Google.isConnected()) {
      return result('gmail_send', false, 'Google não conectado. Conecte no Dashboard primeiro.');
    }
    if (!to || !subject || !body) {
      return result('gmail_send', false, 'Informe destinatário, assunto e corpo do e-mail.');
    }
    try {
      await window.Google.Gmail.send({ to, subject, body });
      if (window.Notifications) {
        await window.Notifications.show('E-mail enviado ✉️', `Para: ${to} — ${subject}`, { tag: 'gmail-sent' });
      }
      return result('gmail_send', true, `E-mail enviado para **${to}** com assunto "${subject}".`);
    } catch (err) {
      return result('gmail_send', false, `Erro ao enviar e-mail: ${err.message}`);
    }
  }

  // ── GOOGLE CALENDAR: listar eventos ─────────────────────

  async function execGcalList({ days = 7 }) {
    if (!window.Google || !window.Google.isConnected()) {
      return result('gcal_list', false, 'Google não conectado. Conecte no Dashboard primeiro.');
    }
    try {
      const events = await window.Google.Calendar.list(days);
      if (!events.length) return result('gcal_list', true, 'Nenhum evento encontrado no Google Agenda.', { events: [] });
      const summary = events.map(e => {
        const start = e.start ? new Date(e.start).toLocaleString('pt-BR') : 'Data não definida';
        return `📅 **${e.title}**\n${start}${e.location ? '\n📍 ' + e.location : ''}`;
      }).join('\n\n');
      return result('gcal_list', true, summary, { events });
    } catch (err) {
      return result('gcal_list', false, `Erro ao buscar agenda Google: ${err.message}`);
    }
  }

  // ── GOOGLE CALENDAR: criar evento ────────────────────────

  async function execGcalCreate({ title, start, end, description = '', location = '' }) {
    if (!window.Google || !window.Google.isConnected()) {
      return result('gcal_create', false, 'Google não conectado. Conecte no Dashboard primeiro.');
    }
    if (!title || !start) {
      return result('gcal_create', false, 'Informe título e data/hora do evento.');
    }
    try {
      await window.Google.Calendar.create({ title, start, end, description, location });
      if (window.Notifications) {
        await window.Notifications.show('Evento criado no Google Agenda 📅', title, { tag: 'gcal-created' });
      }
      return result('gcal_create', true, `Evento **"${title}"** criado no Google Agenda com sucesso!`);
    } catch (err) {
      return result('gcal_create', false, `Erro ao criar evento no Google: ${err.message}`);
    }
  }

  // ── DISPATCHER PRINCIPAL ─────────────────────────────────

  const handlers = {
    create_folder:  execCreateFolder,
    create_event:   execCreateEvent,
    create_finance: execCreateFinance,
    create_note:    execCreateNote,
    create_task:    execCreateTask,
    search_web:     execSearchWeb,
    get_weather:    execGetWeather,
    open_module:    execOpenModule,
    gmail_list:     execGmailList,
    gmail_send:     execGmailSend,
    gcal_list:      execGcalList,
    gcal_create:    execGcalCreate,
    drive_list:     execDriveList,
    drive_upload:   execDriveUpload,
    drive_search:   execDriveSearch,
    photos_list:    execPhotosList,
    photos_albums:  execPhotosAlbums,
    keep_list:      execKeepList,
    keep_create:    execKeepCreate,
    translate:      execTranslate
  };

  // ── GOOGLE DRIVE: listar arquivos ────────────────────────
  async function execDriveList({ folder = '', max = 10 }) {
    if (!window.Google?.isConnected()) return result('drive_list', false, 'Google não conectado.');
    try {
      const files = await window.Google.Drive.list('', max, folder || undefined);
      if (!files.length) return result('drive_list', true, 'Nenhum arquivo encontrado.', { files: [] });
      const summary = files.map(f => `📄 **${f.name}** (${f.mimeType?.split('/').pop() || 'arquivo'})`).join('\n');
      return result('drive_list', true, summary, { files });
    } catch(err) { return result('drive_list', false, `Erro Drive: ${err.message}`); }
  }

  async function execDriveSearch({ query }) {
    if (!window.Google?.isConnected()) return result('drive_search', false, 'Google não conectado.');
    try {
      const files = await window.Google.Drive.search(query);
      if (!files.length) return result('drive_search', true, `Nenhum arquivo encontrado para "${query}".`);
      const summary = files.map(f => `📄 **${f.name}**`).join('\n');
      return result('drive_search', true, summary, { files });
    } catch(err) { return result('drive_search', false, `Erro Drive: ${err.message}`); }
  }

  async function execDriveUpload({ name, content, mimeType = 'text/plain' }) {
    if (!window.Google?.isConnected()) return result('drive_upload', false, 'Google não conectado.');
    try {
      const blob = new Blob([content], { type: mimeType });
      const file = new File([blob], name, { type: mimeType });
      const folderId = await window.Google.Drive.getOrCreateGabrielFolder();
      const saved = await window.Google.Drive.upload(file, folderId);
      return result('drive_upload', true, `Arquivo **"${name}"** salvo no Google Drive ✓`, { file: saved });
    } catch(err) { return result('drive_upload', false, `Erro upload: ${err.message}`); }
  }

  // ── GOOGLE PHOTOS ────────────────────────────────────────
  async function execPhotosList({ max = 12 }) {
    if (!window.Google?.isConnected()) return result('photos_list', false, 'Google não conectado.');
    try {
      const photos = await window.Google.Photos.list(max);
      if (!photos.length) return result('photos_list', true, 'Nenhuma foto encontrada.', { photos: [] });
      const summary = `📸 ${photos.length} foto(s) encontrada(s).\n` +
        photos.slice(0, 5).map(p => `• ${p.filename} — ${p.createdTime ? new Date(p.createdTime).toLocaleDateString('pt-BR') : ''}`).join('\n');
      return result('photos_list', true, summary, { photos });
    } catch(err) { return result('photos_list', false, `Erro Fotos: ${err.message}`); }
  }

  async function execPhotosAlbums() {
    if (!window.Google?.isConnected()) return result('photos_albums', false, 'Google não conectado.');
    try {
      const albums = await window.Google.Photos.getAlbums();
      if (!albums.length) return result('photos_albums', true, 'Nenhum álbum encontrado.', { albums: [] });
      const summary = albums.map(a => `📁 **${a.title}** (${a.mediaItemsCount || '?'} itens)`).join('\n');
      return result('photos_albums', true, summary, { albums });
    } catch(err) { return result('photos_albums', false, `Erro Álbuns: ${err.message}`); }
  }

  // ── GOOGLE KEEP ──────────────────────────────────────────
  async function execKeepList() {
    if (!window.Google?.isConnected()) return result('keep_list', false, 'Google não conectado.');
    try {
      const notes = await window.Google.Keep.list();
      if (!notes.length) return result('keep_list', true, 'Nenhuma nota encontrada.', { notes: [] });
      const summary = notes.slice(0, 8).map(n => `📝 **${n.title || '(sem título)'}**${n.content ? ': ' + n.content.slice(0, 60) : ''}`).join('\n');
      return result('keep_list', true, summary, { notes });
    } catch(err) { return result('keep_list', false, `Erro Keep: ${err.message}`); }
  }

  async function execKeepCreate({ title, content, color, pinned, labels }) {
    if (!window.Google?.isConnected()) return result('keep_create', false, 'Google não conectado.');
    try {
      const note = await window.Google.Keep.create({ title, content, color, pinned, labels });
      if (window.Notifications) await window.Notifications.show('Nota criada 📝', title || content?.slice(0, 40), { tag: 'keep-created' });
      return result('keep_create', true, `Nota **"${title || content?.slice(0, 30)}"** criada no Keep ✓`, { note });
    } catch(err) { return result('keep_create', false, `Erro Keep: ${err.message}`); }
  }

  // ── GOOGLE TRANSLATE ─────────────────────────────────────
  async function execTranslate({ text, targetLang = 'pt', sourceLang }) {
    if (!window.Google?.isConnected()) return result('translate', false, 'Google não conectado.');
    if (!text) return result('translate', false, 'Informe o texto para traduzir.');
    try {
      const translated = await window.Google.Translate.translate(text, targetLang, sourceLang);
      return result('translate', true, `**Tradução (${targetLang}):** ${translated}`, { original: text, translated, targetLang });
    } catch(err) { return result('translate', false, `Erro Translate: ${err.message}`); }
  }

  // Executa lista de ações em sequência
  async function execute(actions = []) {
    if (!Array.isArray(actions) || actions.length === 0) return [];

    const results = [];

    for (const actionObj of actions) {
      const { action, ...params } = actionObj;

      if (!action) {
        results.push(result('unknown', false, 'Ação inválida.'));
        continue;
      }

      const handler = handlers[action];
      if (!handler) {
        results.push(result(action, false, `Ação "${action}" não reconhecida.`));
        continue;
      }

      try {
        console.log(`[Actions] Executando: ${action}`, params);
        const res = await handler(params);
        results.push(res);
        console.log(`[Actions] Resultado:`, res);
      } catch (err) {
        console.error(`[Actions] Erro em ${action}:`, err);
        results.push(result(action, false, `Erro ao executar "${action}": ${err.message}`));
      }
    }

    return results;
  }

  // ── Formata resumo das ações para exibir no chat ─────────

  function summarize(results = []) {
    if (results.length === 0) return null;

    const lines = results.map(r => {
      const icon = r.success ? '✅' : '❌';
      return `${icon} ${r.message}`;
    });

    return lines.join('\n');
  }

  // ── Conta ações bem-sucedidas por tipo ───────────────────

  function countByType(results = []) {
    const counts = {};
    results.forEach(r => {
      if (r.success) {
        counts[r.action] = (counts[r.action] || 0) + 1;
      }
    });
    return counts;
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    execute,
    summarize,
    countByType,
    resolveDate,
    resolveMonth
  };

})();

window.Actions = Actions;
console.log('[Gabriel] actions.js carregado ✓');
