// ============================================================
// notifications.js — Motor de Notificações Push
// Gabriel PWA
// ============================================================

const Notifications = (() => {

  const STORAGE_KEY = 'gabriel_scheduled_notifications';

  // ── Verificar suporte ────────────────────────────────────

  function isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  // ── Solicitar permissão ──────────────────────────────────

  async function requestPermission() {
    if (!isSupported()) {
      console.warn('[Notifications] Não suportado neste navegador.');
      return false;
    }

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  function hasPermission() {
    return isSupported() && Notification.permission === 'granted';
  }

  // ── Notificação imediata ─────────────────────────────────

  async function show(title, body, options = {}) {
    if (!hasPermission()) {
      const granted = await requestPermission();
      if (!granted) return false;
    }

    try {
      const sw = await navigator.serviceWorker.ready;
      await sw.showNotification(title, {
        body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200, 100, 200],
        tag: options.tag || 'gabriel-' + Date.now(),
        data: options.data || {},
        actions: options.actions || [],
        ...options
      });
      return true;
    } catch (err) {
      // Fallback para Notification API direta
      try {
        new Notification(title, { body, icon: 'icon-192.png', ...options });
        return true;
      } catch (e) {
        console.warn('[Notifications] Erro ao exibir notificação:', e);
        return false;
      }
    }
  }

  // ── Notificações agendadas (via localStorage + SW) ───────

  function getScheduled() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function saveScheduled(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  // Agendar notificação para data/hora específica
  function schedule(id, title, body, dateTime, data = {}) {
    const timestamp = new Date(dateTime).getTime();
    if (isNaN(timestamp)) {
      console.warn('[Notifications] Data inválida:', dateTime);
      return false;
    }

    if (timestamp <= Date.now()) {
      console.warn('[Notifications] Data já passou:', dateTime);
      return false;
    }

    const scheduled = getScheduled();

    // Remove agendamento anterior com mesmo id
    const filtered = scheduled.filter(n => n.id !== id);

    filtered.push({ id, title, body, timestamp, data });
    saveScheduled(filtered);

    console.log(`[Notifications] Agendado: "${title}" para ${new Date(timestamp).toLocaleString('pt-BR')}`);

    // Registra no Service Worker se disponível
    _syncWithSW(filtered);

    return true;
  }

  // Cancela agendamento por id
  function cancel(id) {
    const scheduled = getScheduled().filter(n => n.id !== id);
    saveScheduled(scheduled);
    _syncWithSW(scheduled);
    console.log(`[Notifications] Cancelado: ${id}`);
  }

  // Cancela todas
  function cancelAll() {
    saveScheduled([]);
    _syncWithSW([]);
  }

  // Sincroniza lista com Service Worker
  async function _syncWithSW(list) {
    try {
      const sw = await navigator.serviceWorker.ready;
      sw.active?.postMessage({
        type: 'SCHEDULE_NOTIFICATIONS',
        notifications: list
      });
    } catch (e) {
      // SW pode não estar ativo ainda
    }
  }

  // ── Verificador de notificações pendentes ────────────────
  // Roda em polling — dispara notificações cujo horário chegou

  let pollingInterval = null;

  function startPolling(intervalMs = 30000) {
    if (pollingInterval) return;

    const check = async () => {
      if (!hasPermission()) return;

      const now = Date.now();
      const scheduled = getScheduled();
      const toFire = scheduled.filter(n => n.timestamp <= now + 60000 && n.timestamp > now - 60000);
      const remaining = scheduled.filter(n => n.timestamp > now + 60000);

      for (const notif of toFire) {
        await show(notif.title, notif.body, { tag: notif.id, data: notif.data });
        console.log(`[Notifications] Disparada: "${notif.title}"`);
      }

      if (toFire.length > 0) {
        saveScheduled(remaining);
      }
    };

    // Verifica imediatamente e depois a cada intervalo
    check();
    pollingInterval = setInterval(check, intervalMs);
    console.log('[Notifications] Polling iniciado.');
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // ── Integração com Agenda ────────────────────────────────

  async function scheduleEvent(event) {
    if (!event.reminder || !event.date) return false;

    const dateStr = event.time
      ? `${event.date}T${event.time}:00`
      : `${event.date}T08:00:00`;

    const eventTime = new Date(dateStr).getTime();

    // Notifica 30 minutos antes
    const notifTime = new Date(eventTime - 30 * 60 * 1000);

    return schedule(
      `event-${event.id}`,
      `📅 ${event.title}`,
      event.time
        ? `Em 30 minutos — ${event.time}`
        : 'Evento hoje',
      notifTime,
      { type: 'event', eventId: event.id }
    );
  }

  async function cancelEvent(eventId) {
    cancel(`event-${eventId}`);
  }

  // ── Notificações do Gabriel ──────────────────────────────

  async function notifyAction(message) {
    return await show('Gabriel', message, {
      tag: 'gabriel-action',
      vibrate: [100, 50, 100]
    });
  }

  async function notifyMemory(content) {
    return await show('Gabriel salvou uma memória 🧠', content, {
      tag: 'gabriel-memory-' + Date.now(),
      silent: true
    });
  }

  async function notifyTask(taskTitle) {
    return await show('Nova tarefa criada ✅', taskTitle, {
      tag: 'gabriel-task-' + Date.now(),
      silent: true
    });
  }

  // ── Resumo diário ────────────────────────────────────────

  async function scheduleDailySummary(hour = 8, minute = 0) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    // Se já passou hoje, agenda para amanhã
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const events = await GabrielDB.Events.getUpcoming(1);
    const tasks  = await GabrielDB.Tasks.getPending();

    const body = [
      events.length ? `📅 ${events.length} evento(s) hoje` : '',
      tasks.length  ? `✅ ${tasks.length} tarefa(s) pendente(s)` : ''
    ].filter(Boolean).join(' · ') || 'Nenhum compromisso hoje.';

    schedule('daily-summary', 'Bom dia! Resumo do dia 🌅', body, next, { type: 'summary' });
  }

  // ── Status ───────────────────────────────────────────────

  function getStatus() {
    return {
      supported:   isSupported(),
      permission:  isSupported() ? Notification.permission : 'unsupported',
      scheduled:   getScheduled().length,
      polling:     !!pollingInterval
    };
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    requestPermission,
    hasPermission,
    isSupported,
    show,
    schedule,
    cancel,
    cancelAll,
    startPolling,
    stopPolling,
    scheduleEvent,
    cancelEvent,
    notifyAction,
    notifyMemory,
    notifyTask,
    scheduleDailySummary,
    getStatus,
    getScheduled
  };

})();

window.Notifications = Notifications;
console.log('[Gabriel] notifications.js carregado ✓');
