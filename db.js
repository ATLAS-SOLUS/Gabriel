// ============================================================
// db.js — Motor do Banco de Dados (IndexedDB via Dexie.js)
// Gabriel PWA
// ============================================================

const DB_VERSION = 1;
const DB_NAME = 'GabrielDB';

// Dexie carregado via CDN no HTML principal
// <script src="https://unpkg.com/dexie@3.2.4/dist/dexie.min.js"></script>

const db = new Dexie(DB_NAME);

// ── Schema ──────────────────────────────────────────────────
db.version(DB_VERSION).stores({
  profile:       '++id, name, createdAt',
  memories:      '++id, content, tags, date, sourceConversationId',
  conversations: '++id, title, createdAt, updatedAt',
  folders:       '++id, name, parentId, createdAt',
  events:        '++id, title, date, time, reminder, folderId, done',
  finances:      '++id, desc, value, category, card, month, folderId, createdAt',
  notes:         '++id, title, content, folderId, createdAt, updatedAt',
  tasks:         '++id, title, done, dueDate, folderId, createdAt',
  settings:      '++id, key, value'
});

// ============================================================
// PROFILE
// ============================================================
const Profile = {
  async get() {
    return await db.profile.orderBy('id').first();
  },
  async save(data) {
    const existing = await Profile.get();
    if (existing) {
      return await db.profile.update(existing.id, data);
    }
    return await db.profile.add({ ...data, createdAt: new Date() });
  }
};

// ============================================================
// AUTH / SETTINGS
// ============================================================
const Settings = {
  async get(key) {
    const row = await db.settings.where('key').equals(key).first();
    return row ? row.value : null;
  },
  async set(key, value) {
    const existing = await db.settings.where('key').equals(key).first();
    if (existing) {
      return await db.settings.update(existing.id, { value });
    }
    return await db.settings.add({ key, value });
  },
  async delete(key) {
    return await db.settings.where('key').equals(key).delete();
  }
};

// ============================================================
// CONVERSATIONS — máximo 50, apaga a mais antiga
// ============================================================
const Conversations = {
  MAX: 50,

  async getAll() {
    return await db.conversations.orderBy('updatedAt').reverse().toArray();
  },

  async getById(id) {
    return await db.conversations.get(id);
  },

  async create(title = 'Nova conversa') {
    const count = await db.conversations.count();
    if (count >= this.MAX) {
      const oldest = await db.conversations.orderBy('updatedAt').first();
      if (oldest) await db.conversations.delete(oldest.id);
    }
    const id = await db.conversations.add({
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return await db.conversations.get(id);
  },

  async addMessage(conversationId, message) {
    const conv = await db.conversations.get(conversationId);
    if (!conv) throw new Error('Conversa não encontrada');
    const messages = [...(conv.messages || []), {
      ...message,
      timestamp: new Date()
    }];
    await db.conversations.update(conversationId, {
      messages,
      updatedAt: new Date()
    });
    return messages;
  },

  async updateTitle(conversationId, title) {
    return await db.conversations.update(conversationId, { title });
  },

  async delete(conversationId) {
    return await db.conversations.delete(conversationId);
  }
};

// ============================================================
// MEMORIES
// ============================================================
const Memories = {
  async getAll() {
    return await db.memories.orderBy('date').reverse().toArray();
  },

  async add(content, tags = [], sourceConversationId = null) {
    return await db.memories.add({
      content,
      tags,
      sourceConversationId,
      date: new Date()
    });
  },

  async getRecent(limit = 20) {
    return await db.memories.orderBy('date').reverse().limit(limit).toArray();
  },

  async delete(id) {
    return await db.memories.delete(id);
  },

  async search(term) {
    return await db.memories
      .filter(m => m.content.toLowerCase().includes(term.toLowerCase()))
      .toArray();
  }
};

// ============================================================
// FOLDERS
// ============================================================
const Folders = {
  async getAll() {
    return await db.folders.orderBy('createdAt').toArray();
  },

  async getRoots() {
    return await db.folders.where('parentId').equals(0).toArray();
  },

  async getChildren(parentId) {
    return await db.folders.where('parentId').equals(parentId).toArray();
  },

  async create(name, parentId = 0) {
    const id = await db.folders.add({ name, parentId, createdAt: new Date() });
    return await db.folders.get(id);
  },

  async rename(id, name) {
    return await db.folders.update(id, { name });
  },

  async delete(id) {
    // Apaga subpastas recursivamente
    const children = await Folders.getChildren(id);
    for (const child of children) await Folders.delete(child.id);
    return await db.folders.delete(id);
  },

  async getByName(name) {
    return await db.folders.where('name').equalsIgnoreCase(name).first();
  }
};

// ============================================================
// EVENTS (Agenda)
// ============================================================
const Events = {
  async getAll() {
    return await db.events.orderBy('date').toArray();
  },

  async getByMonth(year, month) {
    return await db.events.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }).toArray();
  },

  async getUpcoming(days = 7) {
    const now = new Date();
    const limit = new Date(now.getTime() + days * 86400000);
    return await db.events.filter(e => {
      const d = new Date(e.date);
      return d >= now && d <= limit;
    }).toArray();
  },

  async create(data) {
    const id = await db.events.add({ ...data, done: false, createdAt: new Date() });
    return await db.events.get(id);
  },

  async update(id, data) {
    return await db.events.update(id, data);
  },

  async delete(id) {
    return await db.events.delete(id);
  }
};

// ============================================================
// FINANCES
// ============================================================
const Finances = {
  async getAll() {
    return await db.finances.orderBy('createdAt').reverse().toArray();
  },

  async getByMonth(monthKey) {
    // monthKey formato: "2026-03"
    return await db.finances.where('month').equals(monthKey).toArray();
  },

  async getCurrentMonth() {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return await Finances.getByMonth(key);
  },

  async create(data) {
    const now = new Date();
    const month = data.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const id = await db.finances.add({ ...data, month, createdAt: now });
    return await db.finances.get(id);
  },

  async update(id, data) {
    return await db.finances.update(id, data);
  },

  async delete(id) {
    return await db.finances.delete(id);
  },

  async getSummary(monthKey) {
    const items = await Finances.getByMonth(monthKey);
    const total = items.reduce((sum, i) => sum + Number(i.value), 0);
    const byCategory = {};
    items.forEach(i => {
      byCategory[i.category] = (byCategory[i.category] || 0) + Number(i.value);
    });
    return { total, byCategory, count: items.length, items };
  }
};

// ============================================================
// NOTES (Caderno)
// ============================================================
const Notes = {
  async getAll() {
    return await db.notes.orderBy('updatedAt').reverse().toArray();
  },

  async getByFolder(folderId) {
    return await db.notes.where('folderId').equals(folderId).toArray();
  },

  async create(title, content = '', folderId = 0) {
    const now = new Date();
    const id = await db.notes.add({ title, content, folderId, createdAt: now, updatedAt: now });
    return await db.notes.get(id);
  },

  async update(id, data) {
    return await db.notes.update(id, { ...data, updatedAt: new Date() });
  },

  async delete(id) {
    return await db.notes.delete(id);
  },

  async search(term) {
    return await db.notes.filter(n =>
      n.title.toLowerCase().includes(term.toLowerCase()) ||
      n.content.toLowerCase().includes(term.toLowerCase())
    ).toArray();
  }
};

// ============================================================
// TASKS
// ============================================================
const Tasks = {
  async getAll() {
    return await db.tasks.orderBy('createdAt').reverse().toArray();
  },

  async getPending() {
    return await db.tasks.where('done').equals(0).toArray();
  },

  async create(title, dueDate = null, folderId = 0) {
    const id = await db.tasks.add({
      title, dueDate, folderId,
      done: false,
      createdAt: new Date()
    });
    return await db.tasks.get(id);
  },

  async toggle(id) {
    const task = await db.tasks.get(id);
    if (!task) return;
    return await db.tasks.update(id, { done: !task.done });
  },

  async delete(id) {
    return await db.tasks.delete(id);
  }
};

// ============================================================
// EXPORT GLOBAL
// ============================================================
window.GabrielDB = {
  db,
  Profile,
  Settings,
  Conversations,
  Memories,
  Folders,
  Events,
  Finances,
  Notes,
  Tasks
};

console.log('[Gabriel] db.js carregado ✓');
