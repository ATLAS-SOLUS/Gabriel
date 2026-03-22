// ============================================================
// memory.js — Motor de Memória
// Gabriel PWA
// ============================================================

const Memory = (() => {

  // ── Configurações ────────────────────────────────────────
  const MAX_MEMORIES    = 200;   // limite total de memórias
  const MIN_MSG_LENGTH  = 15;    // mínimo de chars para tentar extrair
  const EXTRACT_DEBOUNCE = 1500; // ms após última mensagem para extrair

  let extractTimer = null;

  // ── Extração automática pós-mensagem ─────────────────────

  async function scheduleExtraction(userMessage, assistantResponse, conversationId) {
    clearTimeout(extractTimer);
    extractTimer = setTimeout(async () => {
      await extractAndSave(userMessage, assistantResponse, conversationId);
    }, EXTRACT_DEBOUNCE);
  }

  async function extractAndSave(userMessage, assistantResponse, conversationId = null) {
    // Só extrai se a mensagem tiver conteúdo suficiente
    if (!userMessage || userMessage.length < MIN_MSG_LENGTH) return [];

    try {
      const memories = await Groq.extractMemories(userMessage, assistantResponse);

      if (!memories || memories.length === 0) return [];

      const saved = [];

      for (const content of memories) {
        if (!content || content.trim().length < 5) continue;

        // Evita duplicatas — busca por conteúdo similar
        const isDuplicate = await checkDuplicate(content);
        if (isDuplicate) continue;

        const id = await GabrielDB.Memories.add(
          content.trim(),
          extractTags(content),
          conversationId
        );

        saved.push({ id, content });
      }

      // Mantém limite máximo de memórias
      await enforceLimit();

      console.log(`[Memory] ${saved.length} memória(s) salva(s).`);
      return saved;

    } catch (err) {
      console.warn('[Memory] Erro na extração:', err);
      return [];
    }
  }

  // ── Verificar duplicatas ─────────────────────────────────

  async function checkDuplicate(content) {
    const all = await GabrielDB.Memories.getAll();
    const normalizedNew = normalize(content);

    return all.some(m => {
      const similarity = computeSimilarity(normalize(m.content), normalizedNew);
      return similarity > 0.80; // 80% similar = duplicata
    });
  }

  function normalize(text) {
    return text.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  function computeSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Jaccard similarity por palavras
    const setA = new Set(a.split(' ').filter(w => w.length > 2));
    const setB = new Set(b.split(' ').filter(w => w.length > 2));

    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    const intersection = new Set([...setA].filter(w => setB.has(w)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
  }

  // ── Extrair tags automáticas ─────────────────────────────

  function extractTags(content) {
    const lower = content.toLowerCase();
    const tags = [];

    const tagMap = {
      'trabalho':    ['trabalha', 'emprego', 'empresa', 'cargo', 'profissão', 'colega'],
      'família':     ['filho', 'filha', 'esposa', 'marido', 'pai', 'mãe', 'irmão', 'família'],
      'saúde':       ['médico', 'remédio', 'doença', 'exercício', 'academia', 'saúde'],
      'finanças':    ['gasto', 'salário', 'dívida', 'investimento', 'dinheiro', 'banco'],
      'preferências':['gosta', 'prefere', 'favorito', 'adora', 'não gosta', 'odeia'],
      'rotina':      ['acorda', 'dorme', 'manhã', 'tarde', 'noite', 'rotina', 'hábito'],
      'educação':    ['estuda', 'curso', 'faculdade', 'escola', 'aprendendo'],
      'hobbies':     ['hobby', 'jogar', 'ler', 'assistir', 'esporte', 'lazer'],
      'contatos':    ['amigo', 'conhece', 'parceiro', 'cliente', 'chefe'],
      'local':       ['mora', 'cidade', 'bairro', 'endereço', 'estado']
    };

    for (const [tag, keywords] of Object.entries(tagMap)) {
      if (keywords.some(kw => lower.includes(kw))) {
        tags.push(tag);
      }
    }

    return tags;
  }

  // ── Manter limite máximo ─────────────────────────────────

  async function enforceLimit() {
    const all = await GabrielDB.Memories.getAll();
    if (all.length <= MAX_MEMORIES) return;

    // Remove as mais antigas
    const toRemove = all
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, all.length - MAX_MEMORIES);

    for (const m of toRemove) {
      await GabrielDB.Memories.delete(m.id);
    }

    console.log(`[Memory] Limpeza: ${toRemove.length} memória(s) removida(s).`);
  }

  // ── Busca de memórias relevantes ─────────────────────────

  async function getRelevant(context, limit = 10) {
    const all = await GabrielDB.Memories.getAll();
    if (all.length === 0) return [];

    if (!context || context.trim().length < 3) {
      return all.slice(0, limit);
    }

    const normalizedCtx = normalize(context);
    const ctxWords = new Set(normalizedCtx.split(' ').filter(w => w.length > 2));

    // Pontua cada memória por relevância
    const scored = all.map(m => {
      const normalizedContent = normalize(m.content);
      const contentWords = new Set(normalizedContent.split(' ').filter(w => w.length > 2));

      // Matches diretos
      const matches = [...ctxWords].filter(w => contentWords.has(w)).length;

      // Boost por tag
      const tagBoost = m.tags?.some(tag => normalizedCtx.includes(tag)) ? 2 : 0;

      // Boost por recência (últimas 7 dias)
      const daysAgo = (Date.now() - new Date(m.date).getTime()) / 86400000;
      const recencyBoost = daysAgo < 7 ? 1 : 0;

      return {
        ...m,
        score: matches + tagBoost + recencyBoost
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...m }) => m);
  }

  // ── Formata memórias para o system prompt ────────────────

  async function formatForPrompt(context = '', limit = 15) {
    const memories = context
      ? await getRelevant(context, limit)
      : await GabrielDB.Memories.getRecent(limit);

    if (memories.length === 0) return 'Nenhuma memória registrada ainda.';

    return memories.map(m => {
      const tags = m.tags?.length ? ` [${m.tags.join(', ')}]` : '';
      return `• ${m.content}${tags}`;
    }).join('\n');
  }

  // ── Gestão manual ────────────────────────────────────────

  async function add(content, tags = []) {
    if (!content || content.trim().length < 3) {
      throw new Error('Conteúdo da memória muito curto.');
    }

    const isDuplicate = await checkDuplicate(content);
    if (isDuplicate) return null;

    const autoTags = [...new Set([...tags, ...extractTags(content)])];

    return await GabrielDB.Memories.add(content.trim(), autoTags, null);
  }

  async function remove(id) {
    return await GabrielDB.Memories.delete(id);
  }

  async function getAll() {
    return await GabrielDB.Memories.getAll();
  }

  async function getByTag(tag) {
    const all = await GabrielDB.Memories.getAll();
    return all.filter(m => m.tags?.includes(tag));
  }

  async function search(term) {
    return await GabrielDB.Memories.search(term);
  }

  async function clear() {
    const all = await GabrielDB.Memories.getAll();
    for (const m of all) await GabrielDB.Memories.delete(m.id);
    console.log('[Memory] Todas as memórias apagadas.');
  }

  // ── Estatísticas ─────────────────────────────────────────

  async function getStats() {
    const all = await GabrielDB.Memories.getAll();
    const tagCounts = {};

    all.forEach(m => {
      m.tags?.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    return {
      total:    all.length,
      max:      MAX_MEMORIES,
      topTags,
      oldest:   all.length ? all[all.length - 1]?.date : null,
      newest:   all.length ? all[0]?.date : null
    };
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    scheduleExtraction,
    extractAndSave,
    getRelevant,
    formatForPrompt,
    add,
    remove,
    getAll,
    getByTag,
    search,
    clear,
    getStats,
    extractTags
  };

})();

window.Memory = Memory;
console.log('[Gabriel] memory.js carregado ✓');
