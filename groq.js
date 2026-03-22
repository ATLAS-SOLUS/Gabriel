// ============================================================
// groq.js — Motor da API Groq (IA + Tool Calling)
// Gabriel PWA
// ============================================================

const Groq = (() => {

  const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL   = 'llama-3.3-70b-versatile';
  const MAX_TOKENS_CHAT    = 1024;
  const MAX_TOKENS_ACTIONS = 2048;
  const MAX_TOKENS_MEMORY  = 512;

  // ── Chave API ────────────────────────────────────────────

  async function getApiKey() {
    const key = await GabrielDB.Settings.get('groq_api_key');
    if (!key) throw new Error('Chave Groq não configurada. Vá em Perfil → Configurações.');
    return key;
  }

  async function setApiKey(key) {
    await GabrielDB.Settings.set('groq_api_key', key.trim());
  }

  // ── Chamada base ─────────────────────────────────────────

  async function call(messages, systemPrompt, maxTokens = MAX_TOKENS_CHAT) {
    const apiKey = await getApiKey();

    const body = {
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err?.error?.message || `Erro Groq: ${response.status}`;
      if (response.status === 401 || response.status === 403 || errMsg.includes('invalid_api_key') || errMsg.includes('rate_limit')) {
        localStorage.setItem('gabriel_groq_key_error', '1');
      }
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ── System Prompt principal ──────────────────────────────

  async function buildSystemPrompt() {
    const profile  = await GabrielDB.Profile.get();
    const memories = await GabrielDB.Memories.getRecent(15);
    const tasks    = await GabrielDB.Tasks.getPending();
    const events   = await GabrielDB.Events.getUpcoming(3);
    const now      = new Date();

    const userName  = profile?.name || 'usuário';
    const memoryTxt = memories.length
      ? memories.map(m => `- ${m.content}`).join('\n')
      : 'Nenhuma memória registrada ainda.';

    const tasksTxt = tasks.length
      ? tasks.slice(0, 5).map(t => `- ${t.title}`).join('\n')
      : 'Nenhuma tarefa pendente.';

    const eventsTxt = events.length
      ? events.slice(0, 3).map(e => `- ${e.title} em ${e.date} às ${e.time || 'horário não definido'}`).join('\n')
      : 'Nenhum evento próximo.';

    // Verifica conexão Google
    let googleCtx = '';
    let googleActions = '';
    try {
      if (window.Google && window.Google.isConnected() && window.Google.isTokenValid()) {
        const email = window.Google.getConnectedEmail();
        googleCtx = `\nGOOGLE CONECTADO: ${email}
Você tem acesso ao Gmail e Google Agenda do usuário. Pode ler e-mails, enviar e-mails e gerenciar eventos no Google Calendar.`;
        googleActions = `
- gmail_list: { "action": "gmail_list", "query": "...", "max": 5 }
- gmail_send: { "action": "gmail_send", "to": "email@...", "subject": "...", "body": "..." }
- gcal_list: { "action": "gcal_list", "days": 7 }
- gcal_create: { "action": "gcal_create", "title": "...", "start": "YYYY-MM-DDTHH:MM", "end": "YYYY-MM-DDTHH:MM", "description": "...", "location": "..." }`;
      }
    } catch(e) {}

    return `Você é Gabriel, assistente pessoal inteligente e analítico de ${userName}.
Data e hora atual: ${now.toLocaleString('pt-BR')}
${googleCtx}

PERSONALIDADE:
- Inteligente, analítico e direto
- Responde em português brasileiro
- Respostas concisas mas completas
- Executa ações autonomamente quando solicitado
- Confirma o que foi feito após executar ações

MEMÓRIAS SOBRE ${userName.toUpperCase()}:
${memoryTxt}

TAREFAS PENDENTES:
${tasksTxt}

PRÓXIMOS EVENTOS:
${eventsTxt}

CAPACIDADES:
Você pode criar pastas, eventos, gastos financeiros, notas, tarefas, buscar clima e pesquisar na web.${googleCtx ? ' Também pode ler e-mails, enviar e-mails e gerenciar o Google Agenda.' : ''}
Quando o usuário pedir algo que envolva ação, responda normalmente E inclua no final um bloco JSON de ações.
Formato do bloco de ações (apenas quando houver ações):
<gabriel_actions>
[
  {"action": "...", ...parâmetros}
]
</gabriel_actions>

AÇÕES DISPONÍVEIS:
- create_folder: { "action": "create_folder", "name": "...", "parentName": "..." }
- create_event: { "action": "create_event", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "description": "...", "reminder": true, "folderName": "..." }
- create_finance: { "action": "create_finance", "desc": "...", "value": 0.0, "category": "...", "card": "crédito|débito|pix|dinheiro", "month": "YYYY-MM", "folderName": "..." }
- create_note: { "action": "create_note", "title": "...", "content": "...", "folderName": "..." }
- create_task: { "action": "create_task", "title": "...", "dueDate": "YYYY-MM-DD", "folderName": "..." }
- search_web: { "action": "search_web", "query": "..." }
- get_weather: { "action": "get_weather", "city": "..." }
- open_module: { "action": "open_module", "module": "dashboard|chat|folders|agenda|finance|notes" }${googleActions}

REGRAS:
1. Sempre responda em português
2. Seja preciso com datas — hoje é ${now.toLocaleDateString('pt-BR')}
3. Amanhã = ${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}
4. Para "mês atual" use ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}
5. Ao executar múltiplas ações, liste todas no mesmo bloco JSON
6. Após executar, confirme de forma amigável o que foi feito
7. Para ações gmail_* e gcal_*, só use se Google estiver conectado. Caso contrário, oriente a conectar no Dashboard`;
  }

  // ── Chat principal ───────────────────────────────────────

  async function chat(userMessage, conversationMessages = []) {
    const systemPrompt = await buildSystemPrompt();

    // Monta histórico — últimas 20 mensagens para não estourar contexto
    const history = conversationMessages.slice(-20).map(m => ({
      role:    m.role,
      content: m.content
    }));

    history.push({ role: 'user', content: userMessage });

    const rawResponse = await call(history, systemPrompt, MAX_TOKENS_CHAT);

    // Separa texto da resposta e bloco de ações
    const actionMatch = rawResponse.match(/<gabriel_actions>([\s\S]*?)<\/gabriel_actions>/);
    let actions = [];
    let text = rawResponse;

    if (actionMatch) {
      try {
        actions = JSON.parse(actionMatch[1].trim());
      } catch (e) {
        console.warn('[Groq] Erro ao parsear ações:', e);
      }
      text = rawResponse.replace(/<gabriel_actions>[\s\S]*?<\/gabriel_actions>/, '').trim();
    }

    return { text, actions };
  }

  // ── Extração de memórias ─────────────────────────────────

  async function extractMemories(userMessage, assistantResponse) {
    const profile = await GabrielDB.Profile.get();
    const userName = profile?.name || 'usuário';

    const systemPrompt = `Você é um extrator de informações pessoais.
Analise a conversa e extraia APENAS fatos relevantes e duradouros sobre ${userName}.
Retorne SOMENTE um JSON válido. Sem texto extra. Sem markdown.
Formato: { "memories": ["fato 1", "fato 2"] }
Extraia apenas se houver fatos claros. Se não houver, retorne: { "memories": [] }
Exemplos de fatos válidos:
- Preferências pessoais (gosta de X, não gosta de Y)
- Informações profissionais (trabalha em X, cargo Y)
- Informações familiares (tem filhos, casado)
- Hábitos relevantes
- Metas e objetivos`;

    const messages = [
      { role: 'user', content: `Usuário disse: "${userMessage}"\nGabriel respondeu: "${assistantResponse}"` }
    ];

    try {
      const raw = await call(messages, systemPrompt, MAX_TOKENS_MEMORY);
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return parsed.memories || [];
    } catch (e) {
      console.warn('[Groq] Erro extração de memórias:', e);
      return [];
    }
  }

  // ── Extração de tarefas ──────────────────────────────────

  async function extractTasks(userMessage) {
    const systemPrompt = `Você é um extrator de tarefas.
Analise a mensagem e extraia tarefas mencionadas implicitamente ou explicitamente.
Retorne SOMENTE JSON válido. Sem texto. Sem markdown.
Formato: { "tasks": [{ "title": "...", "dueDate": "YYYY-MM-DD ou null" }] }
Se não houver tarefas, retorne: { "tasks": [] }`;

    const now = new Date();
    const messages = [
      {
        role: 'user',
        content: `Data atual: ${now.toISOString().split('T')[0]}\nMensagem: "${userMessage}"`
      }
    ];

    try {
      const raw = await call(messages, systemPrompt, MAX_TOKENS_MEMORY);
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return parsed.tasks || [];
    } catch (e) {
      console.warn('[Groq] Erro extração de tarefas:', e);
      return [];
    }
  }

  // ── Gerar título de conversa ─────────────────────────────

  async function generateTitle(firstMessage) {
    const systemPrompt = `Gere um título curto (máx. 5 palavras) em português para uma conversa que começa com a mensagem do usuário.
Retorne APENAS o título, sem aspas, sem pontuação extra.`;

    try {
      const title = await call(
        [{ role: 'user', content: firstMessage }],
        systemPrompt,
        50
      );
      return title.trim().slice(0, 50);
    } catch (e) {
      return 'Nova conversa';
    }
  }

  // ── Pesquisa web via DuckDuckGo ──────────────────────────

  async function searchWeb(query) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
      const res = await fetch(url);
      const data = await res.json();

      const results = [];

      if (data.AbstractText) {
        results.push({ title: data.Heading, text: data.AbstractText, url: data.AbstractURL });
      }

      if (data.RelatedTopics) {
        data.RelatedTopics.slice(0, 4).forEach(t => {
          if (t.Text) results.push({ title: t.Text.split(' - ')[0], text: t.Text, url: t.FirstURL });
        });
      }

      if (results.length === 0) {
        return `Nenhum resultado encontrado para: "${query}"`;
      }

      // Resume os resultados com a IA
      const systemPrompt = `Você é Gabriel. Resuma os resultados de pesquisa em português de forma clara e útil.`;
      const messages = [{
        role: 'user',
        content: `Pesquisa: "${query}"\n\nResultados:\n${results.map(r => `${r.title}: ${r.text}`).join('\n\n')}`
      }];

      return await call(messages, systemPrompt, 512);

    } catch (e) {
      console.error('[Groq] Erro pesquisa web:', e);
      return `Não consegui buscar resultados para "${query}" agora.`;
    }
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    chat,
    extractMemories,
    extractTasks,
    generateTitle,
    searchWeb,
    setApiKey,
    getApiKey
  };

})();

window.Groq = Groq;
console.log('[Gabriel] groq.js carregado ✓');
