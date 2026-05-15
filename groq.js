// ============================================================
// groq.js — Motor da API Groq (IA + Tool Calling + Visão)
// Gabriel PWA
// ============================================================

const Groq = (() => {

  const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

  const MODELS = {
    text:   'llama-3.3-70b-versatile',
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    fast:   'llama-3.1-8b-instant'
  };

  // Groq on_demand costuma ter TPM baixo. Não adianta pedir 12k de saída:
  // isso estoura antes mesmo de contar memória, histórico e anexos.
  const MAX_TOKENS_CHAT       = 2200;
  const MAX_TOKENS_ACTIONS    = 2800;
  const MAX_TOKENS_MEMORY     = 420;
  const MAX_TOKENS_REVIEW     = 900;
  const HISTORY_LIMIT         = 8;

  const TOKEN_SAFETY_BUDGET        = 10800; // fica abaixo do limite comum de 12k TPM
  const MAX_SYSTEM_PROMPT_CHARS    = 9500;
  const MAX_MESSAGE_CHARS          = 2800;
  const MAX_USER_MESSAGE_CHARS     = 6500;
  const MAX_ATTACHMENT_TEXT_CHARS  = 5000;
  const MAX_AGENT_CONTEXT_CHARS    = 5200;

  const ACTION_SCHEMAS = `
AÇÕES LOCAIS:
- create_folder: { "action": "create_folder", "name": "...", "parentName": "..." }
- create_event: { "action": "create_event", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "description": "...", "reminder": true, "folderName": "..." }
- create_finance: { "action": "create_finance", "desc": "...", "value": 0.0, "category": "...", "card": "crédito|débito|pix|dinheiro", "month": "YYYY-MM", "folderName": "..." }
- create_note: { "action": "create_note", "title": "...", "content": "texto completo", "folderName": "..." }
- create_task: { "action": "create_task", "title": "...", "dueDate": "YYYY-MM-DD", "folderName": "..." }
- memory_add: { "action": "memory_add", "content": "fato duradouro para lembrar", "tags": ["..."] }
- search_web: { "action": "search_web", "query": "..." }
- search_news: { "action": "search_news", "query": "...", "count": 8 }
- search_entertainment: { "action": "search_entertainment", "query": "nome do filme/série", "type": "auto|filme|serie" }
- search_images: { "action": "search_images", "query": "tema da imagem", "count": 6 }
- create_table: { "action": "create_table", "title": "...", "headers": ["Coluna 1"], "rows": [["valor"]], "format": "md|csv|html|doc", "fileName": "tabela", "saveToDrive": false }
- create_document: { "action": "create_document", "title": "...", "content": "conteúdo completo", "format": "txt|md|html|doc|pdf", "fileName": "documento", "saveToDrive": false }
- get_weather: { "action": "get_weather", "city": "..." }
- open_module: { "action": "open_module", "module": "dashboard|chat|folders|agenda|finance|notes|games" }
- create_book: { "action": "create_book", "title": "...", "author": "...", "totalChapters": 0, "totalPages": 0, "folderName": "Livros" }
- update_book: { "action": "update_book", "title": "...", "currentChapter": 0, "currentPage": 0 }
- list_books: { "action": "list_books" }
- log_study: { "action": "log_study", "subject": "...", "duration": 60, "notes": "...", "reminderTime": "HH:MM", "folderName": "Estudos" }
- schedule_study: { "action": "schedule_study", "subject": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration": 60, "notes": "..." }
- study_stats: { "action": "study_stats" }

AÇÕES GOOGLE (somente se Google estiver conectado):
- gmail_list: { "action": "gmail_list", "query": "...", "max": 5 }
- gmail_read: { "action": "gmail_read", "id": "id_do_email" }
- gmail_send: { "action": "gmail_send", "to": "email@...", "subject": "...", "body": "..." }
- gmail_draft: { "action": "gmail_draft", "to": "email@...", "subject": "...", "body": "..." }
- gcal_list: { "action": "gcal_list", "days": 7 }
- gcal_today: { "action": "gcal_today" }
- gcal_create: { "action": "gcal_create", "title": "...", "start": "YYYY-MM-DDTHH:MM", "end": "YYYY-MM-DDTHH:MM", "description": "...", "location": "..." }
- gcal_delete: { "action": "gcal_delete", "eventId": "..." }
- drive_list: { "action": "drive_list", "folder": "", "max": 10 }
- drive_search: { "action": "drive_search", "query": "nome do arquivo" }
- drive_read_text: { "action": "drive_read_text", "fileId": "...", "mimeType": "..." }
- drive_upload: { "action": "drive_upload", "name": "arquivo.txt", "content": "...", "mimeType": "text/plain" }
- drive_create_folder: { "action": "drive_create_folder", "name": "...", "parentId": "..." }
- drive_download: { "action": "drive_download", "fileId": "...", "fileName": "nome.pdf" }
- photos_list: { "action": "photos_list", "max": 12 }
- photos_albums: { "action": "photos_albums" }
- keep_list: { "action": "keep_list" }
- keep_create: { "action": "keep_create", "title": "...", "content": "...", "color": "#fff", "pinned": false }
- translate: { "action": "translate", "text": "...", "targetLang": "pt", "sourceLang": null }`;

  // ── Chave API ────────────────────────────────────────────

  async function getApiKey() {
    const key = await GabrielDB.Settings.get('groq_api_key');
    if (!key) throw new Error('Chave Groq não configurada. Vá em Perfil → Configurações.');
    return String(key).trim();
  }

  async function setApiKey(key) {
    await GabrielDB.Settings.set('groq_api_key', String(key || '').trim());
  }

  async function getModel(kind = 'text') {
    const saved = await GabrielDB.Settings.get(kind === 'vision' ? 'groq_model_vision' : 'groq_model_text');
    return String(saved || '').trim() || MODELS[kind] || MODELS.text;
  }

  // ── Utilitários ──────────────────────────────────────────

  function clampTokens(n) {
    const value = Number(n || MAX_TOKENS_CHAT);
    return Math.max(64, Math.min(value, 4096));
  }

  function estimateTokens(value) {
    if (value == null) return 0;
    if (typeof value === 'string') return Math.ceil(value.length / 4);
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + estimateTokens(item), 0);
    if (typeof value === 'object') {
      if (value.type === 'image_url') return 900;
      return estimateTokens(JSON.stringify(value));
    }
    return estimateTokens(String(value));
  }

  function clipText(text, maxChars, opts = {}) {
    const raw = String(text || '');
    if (raw.length <= maxChars) return raw;
    const label = opts.label || 'conteúdo cortado para caber no limite do modelo';
    const headSize = Math.max(500, Math.floor(maxChars * 0.72));
    const tailSize = Math.max(250, maxChars - headSize - 180);
    return `${raw.slice(0, headSize)}\n\n[${label}: ${raw.length - headSize - tailSize} caracteres removidos]\n\n${raw.slice(-tailSize)}`;
  }

  function compactContent(content, maxChars = MAX_MESSAGE_CHARS) {
    if (typeof content === 'string') return clipText(content, maxChars);
    if (Array.isArray(content)) {
      return content.map(part => {
        if (part?.type === 'text') return { ...part, text: clipText(part.text || '', maxChars) };
        return part;
      });
    }
    return content;
  }

  function compactMessages(messages = [], opts = {}) {
    const maxHistory = opts.maxHistory ?? HISTORY_LIMIT;
    const maxChars = opts.maxChars ?? MAX_MESSAGE_CHARS;
    return (messages || []).slice(-maxHistory).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: compactContent(m.content, maxChars)
    }));
  }

  function fitRequestBudget(messages, systemPrompt, maxTokens) {
    let fittedSystem = clipText(systemPrompt || '', MAX_SYSTEM_PROMPT_CHARS, { label: 'system prompt compactado' });
    let fittedMessages = compactMessages(messages, { maxHistory: HISTORY_LIMIT, maxChars: MAX_MESSAGE_CHARS });
    let outputTokens = Math.min(clampTokens(maxTokens), 4096);

    let total = estimateTokens(fittedSystem) + estimateTokens(fittedMessages) + outputTokens;
    if (total <= TOKEN_SAFETY_BUDGET) {
      return { systemPrompt: fittedSystem, messages: fittedMessages, maxTokens: outputTokens };
    }

    outputTokens = Math.min(outputTokens, 1800);
    fittedMessages = compactMessages(messages, { maxHistory: 5, maxChars: 1800 });
    fittedSystem = clipText(fittedSystem, 7000, { label: 'system prompt compactado em modo econômico' });
    total = estimateTokens(fittedSystem) + estimateTokens(fittedMessages) + outputTokens;
    if (total <= TOKEN_SAFETY_BUDGET) {
      return { systemPrompt: fittedSystem, messages: fittedMessages, maxTokens: outputTokens };
    }

    outputTokens = Math.min(outputTokens, 1100);
    fittedMessages = compactMessages(messages, { maxHistory: 3, maxChars: 1100 });
    fittedSystem = clipText(fittedSystem, 4600, { label: 'system prompt compactado no limite seguro' });
    return { systemPrompt: fittedSystem, messages: fittedMessages, maxTokens: outputTokens };
  }

  function isGroqSizeLimitError(message = '') {
    return /request too large|tokens per minute|TPM|rate limit|reduce your message size/i.test(String(message));
  }

  function cleanJson(raw) {
    return String(raw || '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/g, '')
      .trim();
  }

  function safeJsonParse(raw, fallback = null) {
    const text = cleanJson(raw);
    try { return JSON.parse(text); } catch(e) {}

    const firstObj = text.indexOf('{');
    const lastObj  = text.lastIndexOf('}');
    if (firstObj >= 0 && lastObj > firstObj) {
      try { return JSON.parse(text.slice(firstObj, lastObj + 1)); } catch(e) {}
    }

    const firstArr = text.indexOf('[');
    const lastArr  = text.lastIndexOf(']');
    if (firstArr >= 0 && lastArr > firstArr) {
      try { return JSON.parse(text.slice(firstArr, lastArr + 1)); } catch(e) {}
    }

    return fallback;
  }

  function normalizeActionList(actions) {
    if (!actions) return [];
    const list = Array.isArray(actions) ? actions : [actions];
    return list
      .flat()
      .filter(Boolean)
      .map(a => typeof a === 'string' ? { action: a } : a)
      .filter(a => a && typeof a === 'object' && typeof a.action === 'string')
      .map(a => ({ ...a, action: a.action.trim() }));
  }

  function extractActions(rawResponse) {
    const raw = String(rawResponse || '');
    const openTag = raw.search(/<gabriel_actions>/i);
    if (openTag < 0) return { text: raw.trim(), actions: [] };

    const afterOpen = raw.slice(openTag).replace(/^<gabriel_actions>/i, '');
    const closeMatch = afterOpen.match(/<\/gabriel_actions>/i);
    const jsonStr = (closeMatch ? afterOpen.slice(0, closeMatch.index) : afterOpen).trim();
    let actions = safeJsonParse(jsonStr, null);

    if (!actions) {
      const matches = jsonStr.match(/\{[\s\S]*?\}/g) || [];
      actions = matches.map(m => safeJsonParse(m, null)).filter(Boolean);
    }

    const before = raw.slice(0, openTag).trim();
    const after = closeMatch ? afterOpen.slice(closeMatch.index + closeMatch[0].length).trim() : '';
    const text = [before, after].filter(Boolean).join('\n\n').trim();
    return { text, actions: normalizeActionList(actions) };
  }

  function hasImageAttachment(attachments = []) {
    return attachments.some(a => a?.kind === 'image' && a.dataUrl);
  }

  function attachmentTextSummary(attachments = []) {
    if (!attachments.length) return '';
    return attachments.map(a => {
      if (a.kind === 'image') return `Imagem anexada: ${a.name || 'sem nome'} (${a.type || 'image/*'}, ${Math.round((a.size || 0) / 1024)}KB).`;
      if (a.kind === 'text') return `Arquivo de texto anexado: ${a.name || 'sem nome'} (${a.type || 'text/plain'}). Conteúdo:\n${a.text || ''}`;
      return `Arquivo anexado: ${a.name || 'sem nome'} (${a.type || 'desconhecido'}, ${Math.round((a.size || 0) / 1024)}KB).`;
    }).join('\n\n');
  }

  function buildUserContent(userMessage, attachments = []) {
    if (!hasImageAttachment(attachments)) return userMessage;

    const parts = [{ type: 'text', text: `${userMessage}\n\n${attachmentTextSummary(attachments)}`.trim() }];
    attachments.forEach(att => {
      if (att.kind === 'image' && att.dataUrl) {
        parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
      }
    });
    return parts;
  }

  // ── Chamada base ─────────────────────────────────────────

  async function call(messages, systemPrompt = '', maxTokens = MAX_TOKENS_CHAT, options = {}) {
    const apiKey = await getApiKey();
    const model = options.model || await getModel(options.vision ? 'vision' : 'text');
    const fitted = fitRequestBudget(
      messages || [],
      systemPrompt || 'Você é Gabriel, assistente útil em português brasileiro.',
      maxTokens
    );

    const body = {
      model,
      max_tokens: fitted.maxTokens,
      temperature: options.temperature ?? 0.45,
      top_p: options.top_p ?? 0.9,
      messages: [
        { role: 'system', content: fitted.systemPrompt || 'Você é Gabriel, assistente útil em português brasileiro.' },
        ...fitted.messages
      ]
    };

    async function post(bodyToSend) {
      return await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(bodyToSend)
      });
    }

    let response = await post(body);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err?.error?.message || `Erro Groq: ${response.status}`;

      // Segundo corte: quando o Groq ainda reclamar de TPM/tamanho, refaz uma única vez
      // em modo econômico, mantendo o pedido principal e os anexos essenciais.
      if (!options.__compactRetry && isGroqSizeLimitError(errMsg)) {
        const retryFitted = {
          systemPrompt: clipText(fitted.systemPrompt, 3200, { label: 'prompt reduzido após limite Groq' }),
          messages: compactMessages(messages || [], { maxHistory: 2, maxChars: 900 }),
          maxTokens: Math.min(900, fitted.maxTokens)
        };
        const retryBody = {
          ...body,
          max_tokens: retryFitted.maxTokens,
          messages: [
            { role: 'system', content: retryFitted.systemPrompt },
            ...retryFitted.messages
          ]
        };
        response = await post(retryBody);
        if (response.ok) {
          localStorage.removeItem('gabriel_groq_key_error');
          const data = await response.json();
          return data.choices?.[0]?.message?.content || '';
        }
        const retryErr = await response.json().catch(() => ({}));
        const retryMsg = retryErr?.error?.message || errMsg;
        throw new Error('O pedido ficou grande demais para o limite atual do Groq. O Gabriel já tentou compactar automaticamente, mas o serviço ainda recusou. Tente pedir em partes menores ou aguarde um minuto e envie novamente. Detalhe: ' + retryMsg);
      }

      if (response.status === 401 || response.status === 403 || /invalid_api_key/i.test(errMsg)) {
        localStorage.setItem('gabriel_groq_key_error', '1');
      }
      throw new Error(errMsg);
    }

    localStorage.removeItem('gabriel_groq_key_error');
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ── System Prompt principal ──────────────────────────────

  async function buildSystemPrompt(userContext = '', attachments = []) {
    const profile  = await GabrielDB.Profile.get();
    const tasks    = await GabrielDB.Tasks.getPending();
    const events   = await GabrielDB.Events.getUpcoming(14);
    const now      = new Date();

    const userName = profile?.name || 'usuário';

    let memoryTxt = 'Nenhuma memória registrada ainda.';
    try {
      if (window.Memory?.formatForPrompt) {
        memoryTxt = await window.Memory.formatForPrompt(userContext, 12);
      } else {
        const memories = await GabrielDB.Memories.getRecent(12);
        memoryTxt = memories.length ? memories.map(m => `• ${m.content}`).join('\n') : memoryTxt;
      }
    } catch(e) {}

    const tasksTxt = tasks.length
      ? tasks.slice(0, 8).map(t => `- ${t.title}${t.dueDate ? ` (${t.dueDate})` : ''}`).join('\n')
      : 'Nenhuma tarefa pendente.';

    const eventsTxt = events.length
      ? events.slice(0, 8).map(e => `- ${e.title} em ${e.date}${e.time ? ' às ' + e.time : ''}`).join('\n')
      : 'Nenhum evento próximo.';

    let googleCtx = '';
    try {
      if (window.Google && window.Google.isConnected()) {
        const status = window.Google.getStatus?.() || {};
        googleCtx = `\n\n🔗 GOOGLE CONECTADO: ${status.name || window.Google.getConnectedName?.() || 'Conta Google'} <${status.email || window.Google.getConnectedEmail?.() || ''}>\nServiços disponíveis: Gmail, Google Agenda, Google Drive, Google Photos, notas simuladas no Drive e Translate. Use ações Google quando o pedido envolver e-mail, agenda, arquivos, fotos ou tradução.`;
      }
    } catch(e) {}

    const attachmentCtx = attachments.length
      ? `\n\nANEXOS RECEBIDOS NESTA MENSAGEM:\n${attachmentTextSummary(attachments)}\nSe houver imagem, você deve analisá-la visualmente e responder com base no que vê.`
      : '';

    return `Você é Gabriel, assistente pessoal inteligente, executor e analítico de ${userName}.
Data e hora atual: ${now.toLocaleString('pt-BR')}
${googleCtx}${attachmentCtx}

PERSONALIDADE:
- Português brasileiro natural, direto, educado, esperto e útil.
- Respostas completas, bem formatadas e sem enrolação.
- Use emojis com moderação e contexto.
- Quando o usuário pedir algo prático, faça. Não finja que fez.

MEMÓRIAS RELEVANTES SOBRE ${String(userName).toUpperCase()}:
${memoryTxt}

TAREFAS PENDENTES:
${tasksTxt}

PRÓXIMOS EVENTOS:
${eventsTxt}

MODO EXECUTOR COMPLETO — REGRA DE OURO:
Você NÃO deve fazer tarefa pela metade. Antes de responder, siga internamente:
1. Entender o pedido real do usuário.
2. Quebrar em módulos quando necessário.
3. Executar todas as ações possíveis via <gabriel_actions>.
4. Conferir se falta alguma etapa, dado, formatação ou ação.
5. Entregar uma resposta final limpa, objetiva e completa.

MODO MICRO-AGENTES:
- Para tarefas grandes, pense como uma equipe: pesquisador, analista, formatador, documentador, programador e auditor.
- Divida a entrega em partes claras, junte tudo e revise no final.
- Se o usuário pedir tabela, entregue tabela Markdown bem formada e, quando fizer sentido, use create_table.
- Se pedir documento, relatório, PDF, arquivo, roteiro, proposta ou material pronto, use create_document com conteúdo completo.
- Se pedir filmes/séries, use search_entertainment antes de concluir.
- Para respostas com dados, prefira seções, tabelas, checklist e conclusão prática.
- Cada micro-agente precisa entregar uma parte sólida e verificável, não uma frase solta. O consolidor final junta, corta duplicação e transforma em resposta única.
- Se a tarefa envolve imagem/anexo, ative visão; se envolve capa, pôster, personagem, produto, filme/série, lugar ou referência visual, use imagens no chat quando possível.

NUNCA faça isto:
- Não use "...", "etc", "continua", "restante do código" ou placeholders quando o usuário pediu algo completo.
- Não diga que salvou/criou/agendou/enviou se não incluiu a ação correspondente.
- Não entregue só o básico se o pedido exige estrutura, checklist, código completo, plano completo ou arquivo organizado.
- Não ignore anexos. Se imagem vier anexada, analise a imagem.

QUANDO USAR AÇÕES:
Sempre que o usuário pedir para criar, salvar, anotar, lembrar, registrar, agendar, enviar, listar, buscar, abrir, baixar, organizar, pesquisar ou mexer em dados do Google, inclua um bloco de ações.

Formato obrigatório quando houver ações:
<gabriel_actions>
[
  {"action":"nome_acao","param":"valor"}
]
</gabriel_actions>

${ACTION_SCHEMAS}

REGRAS PRÁTICAS:
1. Hoje é ${now.toLocaleDateString('pt-BR')}.
2. Amanhã = ${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}.
3. Para mês atual use ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.
4. Conteúdo de nota/e-mail/documento deve ir completo no campo da ação, não resumido.
5. Se uma tarefa tem várias etapas, gere várias ações no mesmo bloco.
6. Para pesquisa atual, use search_web antes de concluir. Para notícias recentes/manchetes, use search_news.
7. Para filmes, séries, elenco, temporadas ou recomendações de entretenimento, use search_entertainment e mostre pôster/imagem quando vier fonte visual.
8. Para imagem anexada, descreva o que vê, extraia texto visível quando possível e use isso na resposta/ações.
9. Para pedidos visuais sem anexo, use search_images quando fizer sentido.
10. Se faltarem dados obrigatórios que impedem execução real, pergunte só o mínimo necessário. Se der para fazer uma versão útil com os dados atuais, faça.
11. Depois das ações, a resposta deve confirmar o que foi feito e mencionar qualquer limitação real.
12. Seja caprichoso: títulos bons, tabelas corretas, listas claras, mensagem bem formatada, conclusão útil.`;
  }

  // ── Chat principal ───────────────────────────────────────

  async function chat(userMessage, conversationMessages = [], options = {}) {
    const attachments = options.attachments || [];
    const systemPrompt = await buildSystemPrompt(userMessage, attachments);
    const usingVision = hasImageAttachment(attachments);

    const history = compactMessages(conversationMessages || [], { maxHistory: HISTORY_LIMIT, maxChars: MAX_MESSAGE_CHARS });

    history.push({
      role: 'user',
      content: compactContent(buildUserContent(clipText(userMessage, MAX_USER_MESSAGE_CHARS, { label: 'mensagem do usuário compactada' }), attachments), MAX_USER_MESSAGE_CHARS)
    });

    let rawResponse;
    try {
      rawResponse = await call(history, systemPrompt, MAX_TOKENS_ACTIONS, {
        vision: usingVision,
        temperature: usingVision ? 0.25 : 0.42
      });
    } catch (err) {
      // Fallback: se o modelo de visão falhar, tenta responder com texto/metadados do anexo.
      if (usingVision) {
        const fallbackMsg = `${userMessage}\n\n[O envio visual falhou no modelo de visão. Use os metadados do anexo e peça reenvio se precisar ver a imagem.]\n${attachmentTextSummary(attachments)}`;
        rawResponse = await call(
          [...history.slice(0, -1), { role: 'user', content: fallbackMsg }],
          await buildSystemPrompt(fallbackMsg, []),
          MAX_TOKENS_ACTIONS,
          { temperature: 0.35 }
        );
      } else {
        throw err;
      }
    }

    const parsed = extractActions(rawResponse);
    return { text: parsed.text || 'Feito.', actions: parsed.actions, raw: rawResponse };
  }

  // ── Auditor de conclusão da tarefa ───────────────────────

  async function reviewTaskCompletion(userMessage, assistantResponse, actions = [], actionResults = [], options = {}) {
    const systemPrompt = `Você é o Auditor de Conclusão do Gabriel.
Sua função é detectar se o assistente fez a tarefa pela metade e corrigir antes de mostrar ao usuário.

Retorne SOMENTE JSON válido, sem markdown.
Formato:
{
  "complete": true,
  "reason": "resumo curto",
  "extra_actions": [],
  "improved_reply": "resposta final revisada ou string vazia"
}

Use extra_actions somente se faltar uma ação executável real.
Use improved_reply quando a resposta estiver rasa, mal formatada, incompleta ou sem explicar o resultado.
Não invente execução de ação que falhou. Se algo falhou, explique claramente.

Ações disponíveis:
${ACTION_SCHEMAS}`;

    const payload = {
      userMessage: clipText(userMessage, 2200),
      assistantResponse: clipText(assistantResponse, 2600),
      plannedActions: normalizeActionList(actions),
      actionResults: (actionResults || []).slice(-12).map(r => ({ action: r.action, success: !!r.success, message: clipText(r.message || '', 500) })),
      hasAttachment: !!options.hasAttachment
    };

    try {
      const raw = await call(
        [{ role: 'user', content: JSON.stringify(payload) }],
        systemPrompt,
        MAX_TOKENS_REVIEW,
        { temperature: 0.1 }
      );
      const parsed = safeJsonParse(raw, null);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        complete: parsed.complete !== false,
        reason: parsed.reason || '',
        extra_actions: normalizeActionList(parsed.extra_actions || parsed.missing_actions || []),
        improved_reply: typeof parsed.improved_reply === 'string' ? parsed.improved_reply.trim() : ''
      };
    } catch(e) {
      console.warn('[Groq] Auditor falhou:', e);
      return null;
    }
  }

  // ── Extração de memórias ─────────────────────────────────

  async function extractMemories(userMessage, assistantResponse) {
    const profile = await GabrielDB.Profile.get();
    const userName = profile?.name || 'usuário';

    const systemPrompt = `Você é um extrator de memória do Gabriel.
Extraia APENAS fatos duradouros, úteis e claros sobre ${userName} ou preferências permanentes do usuário.
Não extraia dado sensível desnecessário, fofoca, frase passageira ou conteúdo de documento/anexo.
Retorne SOMENTE JSON válido: { "memories": ["fato 1", "fato 2"] }
Se não houver, retorne { "memories": [] }.`;

    try {
      const raw = await call(
        [{ role: 'user', content: `Usuário: ${clipText(userMessage, 1500)}\n\nResposta do Gabriel: ${clipText(assistantResponse, 1800)}` }],
        systemPrompt,
        MAX_TOKENS_MEMORY,
        { temperature: 0.1 }
      );
      const parsed = safeJsonParse(raw, { memories: [] });
      return Array.isArray(parsed?.memories) ? parsed.memories.slice(0, 8) : [];
    } catch (e) {
      console.warn('[Groq] Erro extração de memórias:', e);
      return [];
    }
  }

  // ── Extração de tarefas ──────────────────────────────────

  async function extractTasks(userMessage) {
    const systemPrompt = `Você é um extrator de tarefas.
Analise a mensagem e extraia tarefas mencionadas implicitamente ou explicitamente.
Retorne SOMENTE JSON válido: { "tasks": [{ "title": "...", "dueDate": "YYYY-MM-DD ou null" }] }
Se não houver tarefas, retorne { "tasks": [] }.`;

    const now = new Date();
    try {
      const raw = await call(
        [{ role: 'user', content: `Data atual: ${now.toISOString().split('T')[0]}\nMensagem: ${userMessage}` }],
        systemPrompt,
        MAX_TOKENS_MEMORY,
        { temperature: 0.1 }
      );
      const parsed = safeJsonParse(raw, { tasks: [] });
      return Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    } catch (e) {
      console.warn('[Groq] Erro extração de tarefas:', e);
      return [];
    }
  }

  // ── Gerar título de conversa ─────────────────────────────

  async function generateTitle(firstMessage) {
    const systemPrompt = `Gere um título curto em português, com no máximo 5 palavras. Retorne apenas o título.`;
    try {
      const title = await call([{ role: 'user', content: clipText(firstMessage, 600) }], systemPrompt, 50, { temperature: 0.2 });
      return title.trim().replace(/^['"]|['"]$/g, '').slice(0, 50) || 'Nova conversa';
    } catch (e) {
      return 'Nova conversa';
    }
  }

  // ── Pesquisa web real ────────────────────────────────────

  async function searchWeb(query) {
    try {
      let results = [];

      try {
        const res = await fetch('/.netlify/functions/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, count: 5 }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results?.length) results = data.results;
        }
      } catch(e) { console.warn('[Search] Netlify proxy falhou:', e?.message || e); }

      if (results.length === 0) {
        try {
          const wikiRes = await fetch(
            `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(query).split(' ').slice(0,4).join('_'))}`,
            { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined }
          );
          if (wikiRes.ok) {
            const wiki = await wikiRes.json();
            if (wiki.extract && wiki.extract.length > 50) {
              results.push({
                title: wiki.title,
                snippet: wiki.extract.slice(0, 900),
                url: wiki.content_urls?.desktop?.page || 'https://pt.wikipedia.org'
              });
            }
          }
        } catch(e) { console.warn('[Search] Wikipedia summary falhou:', e?.message || e); }
      }

      if (results.length === 0) {
        try {
          const searchRes = await fetch(
            `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=5`,
            { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined }
          );
          if (searchRes.ok) {
            const data = await searchRes.json();
            const articles = data.query?.search || [];
            for (const art of articles.slice(0, 4)) {
              results.push({
                title: art.title,
                snippet: String(art.snippet || '').replace(/<[^>]+>/g, ''),
                url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(art.title)}`
              });
            }
          }
        } catch(e) { console.warn('[Search] Wikipedia search falhou:', e?.message || e); }
      }

      const systemPrompt = `Você é Gabriel. Responda em português sobre a pesquisa do usuário.
Use as fontes abaixo quando existirem. Se forem insuficientes ou possivelmente desatualizadas, avise com honestidade.
Entregue resposta útil, organizada e prática.`;

      const content = results.length > 0
        ? `Pergunta/pesquisa: ${query}\n\nFontes encontradas:\n${results.slice(0,5).map((r,i) => `[${i+1}] ${r.title}\n${clipText(r.snippet || '', 650)}\nURL: ${r.url}`).join('\n\n')}`
        : `Não houve fonte externa confiável via busca. Responda com conhecimento geral e avise que não conseguiu confirmar online: ${query}`;

      return await call([{ role: 'user', content: clipText(content, MAX_AGENT_CONTEXT_CHARS) }], systemPrompt, 1200, { temperature: 0.25 });

    } catch (e) {
      console.error('[Groq] Erro pesquisa:', e);
      return `Não consegui pesquisar "${query}" agora. A conexão de busca falhou.`;
    }
  }





  // ── Notícias grátis ───────────────────────────────────────

  async function searchNews(query, count = 8) {
    try {
      const res = await fetch('/.netlify/functions/news-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined
      });
      if (!res.ok) throw new Error('Busca de notícias falhou: ' + res.status);
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) return `Não encontrei notícias recentes confiáveis para "${query}" agora.`;

      const table = [
        '| Notícia | Fonte | Data | Link |',
        '|---|---|---|---|',
        ...results.slice(0, Math.min(count, 10)).map(r => `| ${String(r.title || '').replace(/\|/g, '/')} | ${String(r.source || r.provider || '').replace(/\|/g, '/')} | ${String(r.publishedAt || '').replace(/\|/g, '/')} | ${r.url || ''} |`)
      ].join('\n');

      const systemPrompt = `Você é o Agente de Notícias do Gabriel.
Organize as notícias em português brasileiro, com resumo curto, principais pontos e tabela.
Não invente fatos além dos títulos/fontes. Avise se a busca for limitada.`;
      const context = `Pesquisa: ${query}\n\nResultados:\n${JSON.stringify(results.slice(0, 10), null, 2)}\n\nTabela base:\n${table}`;
      return await call([{ role: 'user', content: clipText(context, MAX_AGENT_CONTEXT_CHARS) }], systemPrompt, 1300, { temperature: 0.2 });
    } catch(e) {
      console.warn('[News] falhou:', e);
      return `Não consegui consultar notícias agora. Detalhe: ${e.message}`;
    }
  }

  // ── Pesquisa visual / imagens ─────────────────────────────

  function mediaMarkdownCards(items = [], opts = {}) {
    const max = opts.max || 6;
    return (items || []).slice(0, max).filter(x => x.image || x.poster || x.imageUrl).map((x, i) => {
      const img = x.imageUrl || x.poster || x.image || '';
      const title = String(x.title || x.titulo || `Imagem ${i + 1}`).replace(/[\[\]]/g, '');
      const source = x.source || x.fonte || '';
      const url = x.url || x.full || img;
      return `![${title}](${img})\n**${title}**${source ? ` — ${source}` : ''}${url ? `\nFonte: ${url}` : ''}`;
    }).join('\n\n');
  }

  async function searchImages(query, count = 6) {
    try {
      const res = await fetch('/.netlify/functions/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });
      if (!res.ok) throw new Error('Busca de imagens falhou: ' + res.status);
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) return `Não encontrei imagens confiáveis para "${query}" agora.`;

      const visualBlock = mediaMarkdownCards(results, { max: Math.min(count, 6) });
      const table = [
        '| Imagem | Fonte | Licença/Autor | Link |',
        '|---|---|---|---|',
        ...results.slice(0, Math.min(count, 8)).map((r, i) => `| ${String(r.title || 'Imagem ' + (i+1)).replace(/\|/g,'/')} | ${r.source || ''} | ${String(r.license || r.author || '').replace(/\|/g,'/')} | ${r.url || r.full || r.image || ''} |`)
      ].join('\n');

      return `🖼️ **Imagens encontradas para:** ${query}\n\n${visualBlock}\n\n${table}\n\nObservação: use as imagens respeitando fonte/licença indicada quando houver.`;
    } catch(e) {
      console.warn('[Images] falhou:', e);
      return `Não consegui consultar imagens agora. Detalhe: ${e.message}`;
    }
  }

  // ── Pesquisa filmes/séries ───────────────────────────────

  async function searchEntertainment(query, type = 'auto') {
    try {
      const res = await fetch('/.netlify/functions/entertainment-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined
      });
      if (!res.ok) throw new Error('Busca de entretenimento falhou: ' + res.status);
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (!results.length) return `Não encontrei resultados confiáveis para "${query}".`;

      const systemPrompt = `Você é o Gabriel no modo curador de filmes e séries.
Organize os resultados em português, com dados limpos e apresentáveis.
Sempre entregue:
1. Resumo curto do que encontrou.
2. Tabela Markdown com Título, Tipo, Ano, Nota/Status e Fonte.
3. Observações úteis quando houver lacunas.
Não repita cards de imagem/pôster no texto: eles já serão anexados automaticamente antes do resumo.
Não invente streaming, elenco ou temporadas se os dados não vieram nas fontes.`;

      const payload = results.slice(0, 10).map(r => ({
        titulo: r.title,
        tipo: r.type,
        ano: r.year || '',
        status: r.status || '',
        nota: r.rating || '',
        generos: r.genres || [],
        resumo: clipText(r.summary || '', 600),
        url: r.url || '',
        fonte: r.source || '',
        image: r.imageUrl || r.poster || r.image || '',
        poster: r.poster || r.image || r.imageUrl || ''
      }));

      const visualBlock = mediaMarkdownCards(results, { max: 6 });
      const summary = await call(
        [{ role: 'user', content: `Pesquisa: ${query}\n\nDados encontrados:\n${JSON.stringify(payload, null, 2)}` }],
        systemPrompt,
        1500,
        { temperature: 0.2 }
      );
      return visualBlock ? `${visualBlock}\n\n${summary}` : summary;
    } catch (e) {
      console.warn('[Entertainment] falhou:', e);
      return `Não consegui consultar a busca de filmes/séries agora. Detalhe: ${e.message}`;
    }
  }

  function looksLikeComplexTask(text = '') {
    return /completo|completa|grande|profundo|detalhado|relat[oó]rio|documento|pdf|docx?|tabela|comparativo|planejamento|plano|roteiro|proposta|organiza|organizar|pesquise.+e|analise.+e|crie.+arquivo|micro.?agente|m[oó]dulos?|v[aá]rias etapas|tudo|imagem|imagens|visual|foto|poster|p[oô]ster|capa/i.test(String(text || ''));
  }

  function fallbackAgentPlan(userMessage = '') {
    const msg = String(userMessage || '');
    const agents = [];
    const tasks = {};
    if (/not[ií]cia|manchete|jornal|aconteceu|hoje|atual|recente|últimas|ultimas/i.test(msg)) {
      agents.push('news'); tasks.news = msg;
    }
    if (/pesquis|busca|not[ií]cia|atual|pre[cç]o|quem [ée]|o que [ée]|como funciona|lan[cç]amento|novidade/i.test(msg)) {
      agents.push('search'); tasks.search = msg;
    }
    if (/filme|s[eé]rie|temporada|epis[oó]dio|elenco|cinema|netflix|prime|disney|hbo|tv/i.test(msg)) {
      agents.push('entertainment'); tasks.entertainment = msg;
      agents.push('images'); tasks.images = msg + ' poster capa imagem';
    }
    if (/imagem|imagens|foto|fotos|p[oô]ster|poster|capa|visual|ilustra[cç][aã]o|trazer imagem|mostrar imagem/i.test(msg)) {
      agents.push('images'); tasks.images = msg;
    }
    if (/c[oó]digo|programa|script|fun[cç][aã]o|desenvolv|implementar|app|sistema|html|css|javascript|node/i.test(msg)) {
      agents.push('code'); tasks.code = msg;
    }
    if (/drive|arquivo|minha foto|meus documentos|pasta|baixar|mostrar arquivo|ver arquivo/i.test(msg)) {
      agents.push('drive'); tasks.drive = msg;
    }
    if (/tabela|planilha|dados|comparativo|formatad/i.test(msg)) {
      agents.push('data'); tasks.data = msg;
    }
    if (/documento|pdf|docx?|relat[oó]rio|proposta|contrato|roteiro|arquivo/i.test(msg)) {
      agents.push('document'); tasks.document = msg;
    }
    if (looksLikeComplexTask(msg)) {
      agents.push('analyze'); tasks.analyze = msg;
    }
    return { agents: [...new Set(agents)].slice(0, 8), tasks };
  }

  // ══════════════════════════════════════════════════════════
  // ── SISTEMA MULTI-AGENTE ─────────────────────────────────
  // ══════════════════════════════════════════════════════════

  async function agentVision(task, attachments = []) {
    const systemPrompt = `Você é o Agente de Visão do Gabriel.
Analise imagens com cuidado: objetos, pessoas sem identificar identidade, textos visíveis, layout, cores, problemas, riscos e utilidade prática.
Se for print de erro, extraia a mensagem e proponha correção.
Se não conseguir ver algo com segurança, diga a limitação sem inventar.`;
    try {
      const content = buildUserContent(`Tarefa visual: ${task}\n\nAnalise o anexo e entregue achados em tópicos, texto visível e próximos passos.`, attachments);
      const result = await call([{ role: 'user', content }], systemPrompt, 1400, { vision: true, temperature: 0.18 });
      return { agent: 'vision', label: 'Visão', task, result };
    } catch(e) {
      return { agent: 'vision', label: 'Visão', task, result: 'Não consegui analisar a imagem pelo modelo visual agora: ' + e.message };
    }
  }

  async function agentImages(task) {
    const result = await searchImages(task, 6);
    return { agent: 'images', label: 'Imagens', task, result };
  }

  async function agentSearch(task) {
    const systemPrompt = `Você é o Agente de Pesquisa do Gabriel.
Crie até 3 queries objetivas para pesquisar a tarefa. Retorne JSON: {"queries":["..."]}`;
    try {
      const raw = await call([{ role: 'user', content: `Tarefa: ${task}` }], systemPrompt, 260, { temperature: 0.15 });
      const parsed = safeJsonParse(raw, { queries: [task] });
      const queries = Array.isArray(parsed.queries) && parsed.queries.length ? parsed.queries : [task];
      const results = [];
      for (const q of queries.slice(0, 3)) results.push(await searchWeb(q));
      return { agent: 'search', label: 'Pesquisa', task, result: results.join('\n\n---\n\n') };
    } catch(e) {
      return { agent: 'search', label: 'Pesquisa', task, result: await searchWeb(task) };
    }
  }

  async function agentNews(task) {
    const result = await searchNews(task, 8);
    return { agent: 'news', label: 'Notícias', task, result };
  }

  async function agentEntertainment(task) {
    const result = await searchEntertainment(task, /filme/i.test(task) && !/s[eé]rie/i.test(task) ? 'filme' : 'auto');
    return { agent: 'entertainment', label: 'Filmes e séries', task, result };
  }

  async function agentAnalyze(task, context = '') {
    const systemPrompt = `Você é o Agente de Análise do Gabriel.
Analise profundamente, encontre padrões, riscos, lacunas e próximos passos.
Entregue em português estruturado, sem enrolação.`;
    const result = await call([{ role: 'user', content: clipText(`${context ? 'Contexto:\n' + context + '\n\n' : ''}Tarefa: ${task}`, MAX_AGENT_CONTEXT_CHARS) }], systemPrompt, 1400, { temperature: 0.25 });
    return { agent: 'analyze', label: 'Análise', task, result };
  }

  async function agentData(task, context = '') {
    const systemPrompt = `Você é o Agente Formatador de Dados do Gabriel.
Transforme a tarefa e o contexto em dados bonitos e úteis.
Quando fizer sentido, entregue tabela Markdown válida.
Não invente números. Se faltar dado, marque como "não informado".`;
    const result = await call([{ role: 'user', content: clipText(`${context ? 'Contexto:\n' + context + '\n\n' : ''}Tarefa: ${task}`, MAX_AGENT_CONTEXT_CHARS) }], systemPrompt, 1300, { temperature: 0.2 });
    return { agent: 'data', label: 'Dados/Tabela', task, result };
  }

  async function agentDocument(task, context = '') {
    const systemPrompt = `Você é o Agente Documentador do Gabriel.
Prepare conteúdo pronto para virar documento, relatório, proposta, DOC ou PDF.
Use título, seções, subtítulos, tabelas quando fizer sentido e conclusão.
Não use placeholders nem "continua".`;
    const result = await call([{ role: 'user', content: clipText(`${context ? 'Contexto:\n' + context + '\n\n' : ''}Tarefa: ${task}`, MAX_AGENT_CONTEXT_CHARS) }], systemPrompt, 1800, { temperature: 0.25 });
    return { agent: 'document', label: 'Documento', task, result };
  }

  async function agentCode(task, language = 'javascript') {
    const systemPrompt = `Você é o Agente de Programação do Gabriel.
REGRAS:
1. Código completo e funcional, sem placeholders.
2. Nunca use "...", "resto do código" ou comentários para esconder implementação.
3. Explique como usar.
4. Para HTML/CSS/JS, entregue arquivo único quando fizer sentido.
5. Responda em português.`;
    const result = await call([{ role: 'user', content: clipText(`Linguagem preferida: ${language}\n\n${task}`, MAX_AGENT_CONTEXT_CHARS) }], systemPrompt, 2200, { temperature: 0.2 });
    return { agent: 'code', label: 'Código', task, result };
  }

  async function agentDrive(task) {
    const systemPrompt = `Você é o Agente do Google Drive do Gabriel.
Use o contexto de arquivos para orientar ações concretas. Seja específico.`;
    let driveContext = '';
    try {
      if (window.Google?.isConnected()) {
        const files = await window.Google.Drive.list('', 20);
        driveContext = `Arquivos recentes no Drive:\n${files.map(f => `- ${f.name} | id=${f.id} | ${f.mimeType}`).join('\n')}`;
      }
    } catch(e) { driveContext = 'Não foi possível listar o Drive: ' + e.message; }

    const result = await call([{ role: 'user', content: clipText(`${driveContext}\n\nTarefa: ${task}`, MAX_AGENT_CONTEXT_CHARS) }], systemPrompt, 1000, { temperature: 0.2 });
    return { agent: 'drive', label: 'Drive', task, result };
  }

  async function planAgents(userMessage) {
    const routerPrompt = `Analise a mensagem e decida quais micro-agentes ativar.
Agentes disponíveis: search, news, entertainment, images, vision, analyze, code, drive, data, document.
Retorne SOMENTE JSON válido:
{"agents":["..."],"tasks":{"search":"...","news":"...","entertainment":"...","images":"...","vision":"...","analyze":"...","code":"...","drive":"...","data":"...","document":"..."}}
Ative até 8 agentes se necessário. Se for conversa simples, retorne {"agents":[],"tasks":{}}.`;
    try {
      const raw = await call([{ role: 'user', content: `Mensagem: ${clipText(userMessage, 1800)}` }], routerPrompt, 500, { temperature: 0.08 });
      const plan = safeJsonParse(raw, fallbackAgentPlan(userMessage));
      const fallback = fallbackAgentPlan(userMessage);
      const merged = [...new Set([...(Array.isArray(plan.agents) ? plan.agents : []), ...fallback.agents])]
        .filter(a => ['search','news','entertainment','images','vision','analyze','code','drive','data','document'].includes(a))
        .slice(0, 8);
      return { agents: merged, tasks: { ...(fallback.tasks || {}), ...(plan.tasks || {}) } };
    } catch(e) {
      return fallbackAgentPlan(userMessage);
    }
  }

  async function runAgents(userMessage, options = {}) {
    try {
      const attachments = options.attachments || [];
      const plan = await planAgents(userMessage);
      let agents = Array.isArray(plan.agents) ? plan.agents : [];
      if (hasImageAttachment(attachments) && !agents.includes('vision')) agents.unshift('vision');
      if (!agents.length && looksLikeComplexTask(userMessage)) agents = ['analyze'];
      agents = [...new Set(agents)].slice(0, 8);
      if (!agents.length) return null;

      const results = [];
      let sharedContext = '';
      for (const agent of agents) {
        const task = plan.tasks?.[agent] || userMessage;
        let out = null;
        if (agent === 'search') out = await agentSearch(task);
        else if (agent === 'news') out = await agentNews(task);
        else if (agent === 'entertainment') out = await agentEntertainment(task);
        else if (agent === 'images') out = await agentImages(task);
        else if (agent === 'vision') out = await agentVision(task, attachments);
        else if (agent === 'analyze') out = await agentAnalyze(task, sharedContext);
        else if (agent === 'code') out = await agentCode(task);
        else if (agent === 'drive') out = await agentDrive(task);
        else if (agent === 'data') out = await agentData(task, sharedContext);
        else if (agent === 'document') out = await agentDocument(task, sharedContext);
        if (out) {
          results.push(out);
          sharedContext = clipText(sharedContext + `\n\n[${out.label || out.agent}]\n${out.result}`, MAX_AGENT_CONTEXT_CHARS);
        }
      }
      return results.filter(Boolean);
    } catch(e) {
      console.warn('[Groq] runAgents falhou:', e);
      return null;
    }
  }

  async function chatWithAgents(userMessage, conversationMessages = [], options = {}) {
    const agentResults = await runAgents(userMessage, options);
    let enrichedMessage = userMessage;
    if (agentResults?.length) {
      const agentContext = clipText(agentResults.map(r => `[${r.agent.toUpperCase()} AGENT RESULT]\n${r.result}`).join('\n\n'), MAX_AGENT_CONTEXT_CHARS);
      enrichedMessage = `${userMessage}\n\n[CONTEXTO DOS AGENTES ESPECIALIZADOS]\n${agentContext}`;
    }
    return await chat(enrichedMessage, conversationMessages, options);
  }



  // ── Consolidador Premium: transforma resultados dos agentes em entrega final ──
  function buildAgentContext(agentResults = []) {
    return (agentResults || []).map((r, i) => {
      const label = r.label || r.agent || `Agente ${i + 1}`;
      return `## ${label}\nTarefa: ${r.task || ''}\n\n${clipText(r.result || '', 3600, { label: 'resultado de agente compactado' })}`;
    }).join('\n\n---\n\n');
  }

  function isLowQualityAnswer(userMessage = '', answer = '', opts = {}) {
    const msg = String(userMessage || '');
    const text = String(answer || '').trim();
    if (!text) return true;

    const complex = looksLikeComplexTask(msg) || !!opts.needsPowerMode || !!opts.hasAgentContext;
    const askedFile = /pdf|docx?|documento|arquivo|csv|planilha|tabela|relat[oó]rio|proposta|contrato/i.test(msg);
    const askedCode = /c[oó]digo|script|html|css|javascript|node|programa|sistema|app/i.test(msg);
    const askedResearch = /pesquis|busca|filme|s[eé]rie|imagem|not[ií]cia|atual|pre[cç]o/i.test(msg);
    const hasStructure = /(^|\n)#{1,3}\s|\|.+\|\n\|[-:| ]+\||```|\n[-*]\s|\n\d+\.\s/i.test(text);
    const hasBadPhrases = /(n[aã]o consegui|n[aã]o encontrei|posso tentar|se voc[eê] quiser|continua|restante do c[oó]digo|\.\.\.)/i.test(text);
    const tooShort = complex && text.length < 650;
    const missingStructure = (askedFile || askedCode || askedResearch || complex) && !hasStructure && text.length < 1400;
    return !!(tooShort || missingStructure || hasBadPhrases);
  }

  async function synthesizeWithAgents(userMessage, agentResults = [], conversationMessages = [], options = {}) {
    const agentContext = buildAgentContext(agentResults);
    const hasVisual = (agentResults || []).some(r => /vision|images|entertainment/i.test(r.agent || ''));
    const systemPrompt = `Você é o CONSOLIDADOR PREMIUM do Gabriel.
Sua missão é transformar resultados de micro-agentes em uma ENTREGA FINAL ÚNICA, bonita, completa e acionável.

REGRAS DE QUALIDADE:
1. Não mostre bastidores, nomes internos ou "resultado do agente".
2. Corte duplicações e tentativas ruins. Se houver resultado útil, não comece pedindo desculpas.
3. Dê resposta direta no início e depois organize por seções.
4. Use tabela Markdown quando houver comparação, lista de filmes/séries, dados, opções, preços ou status.
5. Use Markdown de imagem válido quando houver pôster/imagem: ![Título](URL). Não repita a mesma imagem.
6. Para pedido de código: entregar código completo, sem placeholders.
7. Para pedido de documento/PDF/DOC/CSV: incluir conteúdo completo e a ação create_document/create_table quando fizer sentido.
8. Para pedido grande: entregar resumo executivo, blocos principais, checklist e próximos passos.
9. Não invente dado que não veio das fontes. Marque como "não informado" quando faltar.
10. A resposta precisa parecer pronta para uso, não rascunho.

QUANDO HOUVER AÇÕES EXECUTÁVEIS, use exatamente:
<gabriel_actions>
[
  {"action":"nome_acao"}
]
</gabriel_actions>

AÇÕES DISPONÍVEIS:
${ACTION_SCHEMAS}`;

    const payload = `PEDIDO ORIGINAL DO USUÁRIO:\n${clipText(userMessage, 2200)}\n\nRESULTADOS DOS ESPECIALISTAS:\n${clipText(agentContext, 9000, { label: 'contexto dos agentes compactado' })}\n\nENTREGUE AGORA A RESPOSTA FINAL PREMIUM. ${hasVisual ? 'Se houver imagens/pôsteres nos resultados, mantenha os melhores cards visuais.' : ''}`;

    const history = compactMessages(conversationMessages || [], { maxHistory: 4, maxChars: 1200 });
    history.push({ role: 'user', content: payload });
    const raw = await call(history, systemPrompt, 2600, { temperature: 0.28 });
    const parsed = extractActions(raw);
    return { text: parsed.text || raw || 'Feito.', actions: parsed.actions, raw };
  }

  async function repairIncompleteAnswer(userMessage, assistantResponse, agentResults = [], actionResults = [], options = {}) {
    if (!isLowQualityAnswer(userMessage, assistantResponse, options)) {
      return { improved_reply: '', reason: 'Resposta já está adequada.' };
    }

    const systemPrompt = `Você é o REVISOR PREMIUM do Gabriel.
Reescreva respostas rasas, incompletas ou mal formatadas para ficarem completas, bonitas e úteis.
Retorne SOMENTE JSON válido:
{"improved_reply":"...","reason":"..."}

Regras:
- Preserve fatos e limitações reais.
- Não diga que ação foi feita se ela falhou ou não foi executada.
- Remova pedidos de desculpa desnecessários se há dados úteis.
- Entregue estrutura: título curto, resposta direta, tabela/lista/checklist quando fizer sentido e próximos passos.
- Nada de "...", "continua", "posso fazer" como substituto de entrega.`;

    const payload = {
      pedido: clipText(userMessage, 2000),
      respostaAtual: clipText(assistantResponse, 3000),
      contextoAgentes: clipText(buildAgentContext(agentResults), 5200),
      resultadosAcoes: (actionResults || []).slice(-12).map(r => ({ action: r.action, success: !!r.success, message: clipText(r.message || '', 550) }))
    };

    try {
      const raw = await call([{ role: 'user', content: JSON.stringify(payload) }], systemPrompt, 1700, { temperature: 0.18 });
      const parsed = safeJsonParse(raw, null);
      if (!parsed || typeof parsed !== 'object') return { improved_reply: '', reason: 'Revisor não retornou JSON.' };
      return { improved_reply: String(parsed.improved_reply || '').trim(), reason: String(parsed.reason || '').trim() };
    } catch (e) {
      console.warn('[Groq] Revisor premium falhou:', e);
      return { improved_reply: '', reason: 'Revisor falhou: ' + e.message };
    }
  }

  // ── Gerar conteúdo completo para nota ────────────────────

  async function generateNoteContent(topic, existingResponse) {
    const systemPrompt = `Você é Gabriel. Gere o conteúdo COMPLETO e DETALHADO para salvar numa nota.
Não resuma, não corte, não use placeholders. Responda apenas com o conteúdo da nota.`;
    try {
      return await call(
        [{ role: 'user', content: `Tema: ${topic}\n\nBase disponível:\n${existingResponse || topic}` }],
        systemPrompt,
        8192,
        { temperature: 0.25 }
      );
    } catch(e) {
      return existingResponse || topic;
    }
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    chat,
    chatWithAgents,
    synthesizeWithAgents,
    repairIncompleteAnswer,
    isLowQualityAnswer,
    reviewTaskCompletion,
    generateNoteContent,
    runAgents,
    agentSearch,
    agentNews,
    agentImages,
    agentVision,
    agentAnalyze,
    agentCode,
    agentDrive,
    extractMemories,
    extractTasks,
    generateTitle,
    searchWeb,
    searchNews,
    searchImages,
    searchEntertainment,
    planAgents,
    looksLikeComplexTask,
    setApiKey,
    getApiKey,
    getModel,
    call
  };

})();

window.Groq = Groq;
console.log('[Gabriel] groq.js carregado ✓');
