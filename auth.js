// ============================================================
// auth.js — Autenticação 100% Google OAuth
// Gabriel PWA
// ============================================================

const Auth = (() => {

  const SESSION_KEY = 'gabriel_session';

  // ── Sessão ───────────────────────────────────────────────

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch(e) {}

    // Fallback: monta sessão a partir dos tokens Google
    try {
      const connected = localStorage.getItem('gabriel_google_connected') === 'true';
      const email     = localStorage.getItem('gabriel_google_email');
      const name      = localStorage.getItem('gabriel_google_name');
      const picture   = localStorage.getItem('gabriel_google_picture') || '';
      const id        = localStorage.getItem('gabriel_google_user_id') || email;

      if (connected && email) {
        const session = { id, name, email, picture, provider: 'google', loggedAt: new Date().toISOString() };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
      }
    } catch(e) {}

    return null;
  }

  function isGoogleConnected() {
    const connected = localStorage.getItem('gabriel_google_connected') === 'true';
    const token     = localStorage.getItem('gabriel_google_access_token');
    const expiry    = parseInt(localStorage.getItem('gabriel_google_token_expiry') || '0');
    return connected && token && Date.now() < expiry;
  }

  function isLoggedIn() {
    return isGoogleConnected();
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ── Login via Google ─────────────────────────────────────

  function loginWithGoogle() {
    if (typeof Google !== 'undefined') {
      Google.connect();
    } else {
      window.location.href = 'login.html';
    }
  }

  // ── Atualizar sessão ─────────────────────────────────────

  async function updateUser(fields) {
    const session = getSession();
    if (!session) throw new Error('Nenhuma sessão ativa.');
    const updated = { ...session, ...fields };
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    try { await GabrielDB.Profile.save(updated); } catch(e) {}
    return updated;
  }

  async function completeOnboarding(prefs = {}) {
    await GabrielDB.Profile.save({ onboardingDone: true, prefs });
    const session = getSession();
    if (session) {
      session.onboardingDone = true;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }

  async function getCurrentUserFull() {
    const session = getSession();
    if (!session) return null;
    try { return await GabrielDB.Profile.get() || session; } catch { return session; }
  }

  function logout() {
    clearSession();
    // Limpa tokens Google
    ['gabriel_google_access_token','gabriel_google_refresh_token','gabriel_google_token_expiry',
     'gabriel_google_connected','gabriel_google_email','gabriel_google_name',
     'gabriel_google_picture','gabriel_google_user_id','gabriel_google_banner_dismissed'].forEach(k => {
      localStorage.removeItem(k);
    });
    window.location.href = 'login.html';
  }

  // ── Guard ────────────────────────────────────────────────

  async function guard(page) {
    const publicPages = ['login.html', 'auth-callback.html', 'termosservicos.html', 'politicapublica.html'];
    const isPublic = publicPages.some(p => page.includes(p));

    const loggedIn = isGoogleConnected();

    if (!loggedIn) {
      // Tenta reconstruir sessão a partir dos tokens
      const session = getSession();
      if (!session) {
        if (!isPublic) {
          window.location.href = 'login.html';
          return false;
        }
        return true;
      }
    }

    // Garante sessão local salva
    getSession(); // chamada reconstrói e salva se necessário

    // Se está na login e já logado, vai para dashboard
    if (page.includes('login.html')) {
      window.location.href = 'dashboard.html';
      return false;
    }

    return true;
  }

  return {
    loginWithGoogle,
    isLoggedIn,
    isGoogleConnected,
    getSession,
    getCurrentUserFull,
    updateUser,
    completeOnboarding,
    logout,
    guard
  };

})();

window.Auth = Auth;
console.log('[Gabriel] auth.js carregado ✓');
