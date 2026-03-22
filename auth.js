// ============================================================
// auth.js — Motor de Autenticação Local
// Gabriel PWA
// ============================================================

const Auth = (() => {

  const SESSION_KEY = 'gabriel_session';
  const USERS_KEY   = 'gabriel_users';

  // ── Helpers ─────────────────────────────────────────────

  // Hash simples SHA-256 via Web Crypto API
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Gera ID único
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Lê lista de usuários do IndexedDB Settings
  async function getUsers() {
    const raw = await GabrielDB.Settings.get(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  // Salva lista de usuários
  async function saveUsers(users) {
    await GabrielDB.Settings.set(USERS_KEY, JSON.stringify(users));
  }

  // ── Sessão ───────────────────────────────────────────────

  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function saveSession(user) {
    const session = {
      id:        user.id,
      name:      user.name,
      email:     user.email,
      loggedAt:  new Date().toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function isLoggedIn() {
    return !!getSession();
  }

  // ── Cadastro ─────────────────────────────────────────────

  async function register(name, email, password) {
    // Validações
    if (!name || name.trim().length < 2) {
      throw new Error('Nome deve ter pelo menos 2 caracteres.');
    }
    if (!email || !email.includes('@')) {
      throw new Error('E-mail inválido.');
    }
    if (!password || password.length < 6) {
      throw new Error('Senha deve ter pelo menos 6 caracteres.');
    }

    const users = await getUsers();

    // Verifica duplicidade
    const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      throw new Error('Este e-mail já está cadastrado.');
    }

    const hashed = await hashPassword(password);

    const newUser = {
      id:        generateId(),
      name:      name.trim(),
      email:     email.toLowerCase().trim(),
      password:  hashed,
      createdAt: new Date().toISOString(),
      onboardingDone: false,
      termosAceitos:  false
    };

    users.push(newUser);
    await saveUsers(users);

    // Salva perfil no DB
    await GabrielDB.Profile.save({
      name:      newUser.name,
      email:     newUser.email,
      userId:    newUser.id,
      createdAt: new Date()
    });

    console.log('[Auth] Usuário cadastrado:', newUser.name);
    return saveSession(newUser);
  }

  // ── Login ────────────────────────────────────────────────

  async function login(email, password) {
    if (!email || !password) {
      throw new Error('Preencha e-mail e senha.');
    }

    const users = await getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      throw new Error('E-mail não encontrado.');
    }

    const hashed = await hashPassword(password);
    if (hashed !== user.password) {
      throw new Error('Senha incorreta.');
    }

    console.log('[Auth] Login realizado:', user.name);
    return saveSession(user);
  }

  // ── Logout ───────────────────────────────────────────────

  function logout() {
    clearSession();
    console.log('[Auth] Sessão encerrada.');
    window.location.href = 'login.html';
  }

  // ── Atualizar usuário ────────────────────────────────────

  async function updateUser(fields) {
    const session = getSession();
    if (!session) throw new Error('Nenhuma sessão ativa.');

    const users = await getUsers();
    const idx = users.findIndex(u => u.id === session.id);
    if (idx === -1) throw new Error('Usuário não encontrado.');

    users[idx] = { ...users[idx], ...fields };
    await saveUsers(users);

    // Atualiza sessão
    saveSession(users[idx]);
    return users[idx];
  }

  async function acceptTerms() {
    return await updateUser({ termosAceitos: true });
  }

  async function completeOnboarding(prefs = {}) {
    return await updateUser({ onboardingDone: true, prefs });
  }

  // ── Verificar estado do usuário ──────────────────────────

  async function getCurrentUserFull() {
    const session = getSession();
    if (!session) return null;

    const users = await getUsers();
    return users.find(u => u.id === session.id) || null;
  }

  // ── Roteador de telas ────────────────────────────────────
  // Chame no topo de cada página para redirecionar corretamente

  async function guard(page) {
    const session = getSession();

    // Páginas públicas — não precisa estar logado
    const publicPages = ['login.html', 'terms.html'];
    const isPublic = publicPages.some(p => page.includes(p));

    if (!session) {
      if (!isPublic) {
        window.location.href = 'login.html';
        return false;
      }
      return true;
    }

    // Está logado — verifica fluxo
    const user = await getCurrentUserFull();
    if (!user) {
      clearSession();
      window.location.href = 'login.html';
      return false;
    }

    if (!user.termosAceitos && !page.includes('terms.html')) {
      window.location.href = 'terms.html';
      return false;
    }

    if (!user.onboardingDone && !page.includes('onboarding.html') && !page.includes('terms.html')) {
      window.location.href = 'onboarding.html';
      return false;
    }

    if (page.includes('login.html')) {
      window.location.href = 'dashboard.html';
      return false;
    }

    return true;
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    register,
    login,
    logout,
    isLoggedIn,
    getSession,
    getCurrentUserFull,
    acceptTerms,
    completeOnboarding,
    updateUser,
    guard
  };

})();

window.Auth = Auth;
console.log('[Gabriel] auth.js carregado ✓');
