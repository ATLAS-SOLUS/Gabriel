// ============================================================
// auth.js — Autenticação 100% Google OAuth
// Gabriel PWA
// ============================================================

const Auth = (() => {

  const SESSION_KEY = 'gabriel_session';

  // ── Sessão ───────────────────────────────────────────────

  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) { try { return JSON.parse(raw); } catch { return null; } }
    if (typeof Google !== 'undefined' && Google.isConnected && Google.isConnected()) {
      return buildSessionFromGoogle();
    }
    return null;
  }

  function buildSessionFromGoogle() {
    const name    = Google.getConnectedName();
    const email   = Google.getConnectedEmail();
    const picture = typeof Google.getConnectedPicture === 'function' ? Google.getConnectedPicture() : '';
    if (!email) return null;
    return { id: email, name, email, picture, provider: 'google', loggedAt: new Date().toISOString() };
  }

  function saveSession(data) {
    const session = {
      id: data.email || data.id, name: data.name, email: data.email,
      picture: data.picture || '', provider: 'google', loggedAt: new Date().toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function isLoggedIn() {
    const session = getSession();
    if (!session) return false;
    if (typeof Google !== 'undefined' && Google.isConnected) {
      return Google.isConnected() && Google.isTokenValid();
    }
    return !!session;
  }

  // ── Login via Google ─────────────────────────────────────

  function loginWithGoogle(fromPage) {
    if (typeof Google !== 'undefined') {
      Google.connect(fromPage);
    } else {
      console.error('[Auth] Google.js não carregado');
    }
  }

  // ── Pós-OAuth: cria sessão + recupera dados do Drive ─────

  async function handleGoogleLoginSuccess() {
    const name    = Google.getConnectedName();
    const email   = Google.getConnectedEmail();
    const picture = typeof Google.getConnectedPicture === 'function' ? Google.getConnectedPicture() : '';
    const userId  = typeof Google.getConnectedUserId === 'function' ? Google.getConnectedUserId() : email;

    const session = saveSession({ id: userId, name, email, picture });

    try {
      const existing = await GabrielDB.Profile.get();
      if (!existing || existing.email !== email) {
        await GabrielDB.Profile.save({ name, email, userId, picture, provider: 'google', createdAt: new Date() });
      }
    } catch(e) { console.warn('[Auth] Erro perfil:', e); }

    // Recupera memórias do Drive
    try {
      const memoriesJson = await Google.Drive.loadMemories();
      if (memoriesJson) {
        const memories = JSON.parse(memoriesJson);
        for (const m of memories) {
          const exists = await GabrielDB.Memories.search(m.content?.slice(0, 20) || '');
          if (!exists?.length) await GabrielDB.Memories.add(m.content, m.tags || [], null);
        }
        console.log(`[Auth] ${memories.length} memória(s) recuperada(s) do Drive.`);
      }
    } catch(e) { console.warn('[Auth] Drive memórias:', e); }

    return session;
  }

  // ── Logout ───────────────────────────────────────────────

  function logout() {
    clearSession();
    if (typeof Google !== 'undefined' && Google.disconnect) Google.disconnect();
    window.location.href = 'login.html';
  }

  async function updateUser(fields) {
    const session = getSession();
    if (!session) throw new Error('Nenhuma sessão ativa.');
    const updated = { ...session, ...fields };
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    try { await GabrielDB.Profile.save({ ...updated }); } catch(e) {}
    return updated;
  }

  async function completeOnboarding(prefs = {}) {
    await GabrielDB.Profile.save({ onboardingDone: true, prefs });
    const session = getSession();
    if (session) { session.onboardingDone = true; localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  }

  async function getCurrentUserFull() {
    const session = getSession();
    if (!session) return null;
    try { return await GabrielDB.Profile.get() || session; } catch { return session; }
  }

  // ── Guard ────────────────────────────────────────────────

  async function guard(page) {
    const publicPages = ['login.html', 'auth-callback.html', 'terms.html', 'politicapublica.html', 'termosservicos.html'];
    const isPublic = publicPages.some(p => page.includes(p));

    const googleOk = typeof Google !== 'undefined' && Google.isConnected && Google.isConnected() && Google.isTokenValid();

    if (!googleOk) {
      clearSession();
      if (!isPublic) { window.location.href = 'login.html'; return false; }
      return true;
    }

    if (!localStorage.getItem(SESSION_KEY)) await handleGoogleLoginSuccess();

    const session = getSession();
    if (!session) { window.location.href = 'login.html'; return false; }
    if (page.includes('login.html')) { window.location.href = 'dashboard.html'; return false; }

    try {
      const profile = await GabrielDB.Profile.get();
      if (!profile?.onboardingDone && !page.includes('onboarding.html') && !page.includes('terms.html')) {
        window.location.href = 'onboarding.html';
        return false;
      }
    } catch(e) {}

    return true;
  }

  return {
    loginWithGoogle, handleGoogleLoginSuccess,
    isLoggedIn, getSession, getCurrentUserFull,
    updateUser, completeOnboarding, logout, guard
  };

})();

window.Auth = Auth;
console.log('[Gabriel] auth.js carregado ✓');
