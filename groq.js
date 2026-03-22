// ============================================================
// groq.js — Motor da API Groq (IA + Tool Calling)
// Gabriel PWA
// ============================================================

const Groq = (() => {

  const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL   = 'llama-3.3-70b-versatile';
  const MAX_TOKENS_CHAT    = 2048;
  const MAX_TOKENS_ACTIONS = 4096;
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
Você tem acesso completo ao Google do usuário: Gmail, Agenda, Drive, Fotos, Keep e Translate.`;
        googleActions = `
- gmail_list: { "action": "gmail_list", "query": "...", "max": 5 }
- gmail_send: { "action": "gmail_send", "to": "email@...", "subject": "...", "body": "..." }
- gcal_list: { "action": "gcal_list", "days": 7 }
- gcal_create: { "action": "gcal_create", "title": "...", "start": "YYYY-MM-DDTHH:MM", "end": "YYYY-MM-DDTHH:MM", "description": "...", "location": "..." }
- drive_list: { "action": "drive_list", "max": 10 }
- drive_search: { "action": "drive_search", "query": "nome do arquivo" }
- drive_upload: { "action": "drive_upload", "name": "arquivo.txt", "content": "...", "mimeType": "text/plain" }
- photos_list: { "action": "photos_list", "max": 12 }
- photos_albums: { "action": "photos_albums" }
- keep_list: { "action": "keep_list" }
- keep_create: { "action": "keep_create", "title": "...", "content": "...", "color": "#fff", "pinned": false }
- translate: { "action": "translate", "text": "...", "targetLang": "pt", "sourceLang": null }`;
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
7. Para ações gmail_* e gcal_*, só use se Google estiver conectado. Caso contrário, oriente a conectar no Dashboard
8. CONTEÚDO COMPLETO: Quando criar notas, músicas, poemas, letras, histórias ou qualquer texto criativo, SEMPRE salve o conteúdo COMPLETO na nota via create_note — nunca resuma ou corte
9. PESQUISA: Quando o usuário pedir algo atual, notícias, preços, clima ou qualquer informação recente, use search_web para buscar dados reais antes de responder
10. CLIMA: Para previsão do tempo, use get_weather com a cidade do usuário. Mostre temperatura, chuva e previsão para os próximos dias`;
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

  // ── Pesquisa web real (via Netlify proxy) ────────────────

  async function searchWeb(query) {
    try {
      // Chama nosso proxy Netlify que usa Brave Search (ou DuckDuckGo fallback)
      const res = await fetch('/.netlify/functions/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count: 6 })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = data.results || [];

      if (results.length === 0) {
        return `Nenhum resultado encontrado para: "${query}"`;
      }

      // Passa os resultados para a IA resumir de forma inteligente
      const systemPrompt = `Você é Gabriel, assistente pessoal. Analise os resultados de pesquisa e responda em português de forma clara, útil e completa. Cite as fontes quando relevante. Seja direto e informativo.`;

      const content = `Pesquisa: "${query}"\n\nResultados encontrados:\n\n` +
        results.map((r, i) => `[${i+1}] ${r.title}\n${r.snippet}${r.url ? '\nFonte: ' + r.url : ''}`).join('\n\n');

      const messages = [{ role: 'user', content }];
      return await call(messages, systemPrompt, 1024);

    } catch (e) {
      console.error('[Groq] Erro pesquisa web:', e);
      // Fallback direto DuckDuckGo
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
        const res = await fetch(url);
        const data = await res.json();
        const results = [];
        if (data.AbstractText) results.push(`${data.Heading}: ${data.AbstractText}`);
        (data.RelatedTopics || []).slice(0, 3).forEach(t => { if (t.Text) results.push(t.Text); });
        if (results.length === 0) return `Não consegui buscar "${query}" agora.`;
        const messages = [{ role: 'user', content: `Pesquisa: "${query}"\n\n${results.join('\n\n')}` }];
        return await call(messages, 'Resuma em português de forma clara e útil.', 512);
      } catch(e2) {
        return `Não consegui buscar "${query}" agora. Verifique sua conexão.`;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── SISTEMA MULTI-AGENTE ──────────────────────────────────
  // ══════════════════════════════════════════════════════════

  // ── Agente de Pesquisa ───────────────────────────────────
  async function agentSearch(task) {
    const systemPrompt = `Você é o Agente de Pesquisa do Gabriel. Sua única função é buscar informações na web de forma precisa e abrangente.
Receberá uma tarefa e deve:
1. Identificar as melhores queries de busca
2. Retornar os resultados de forma estruturada
Responda APENAS em JSON: { "queries": ["query1","query2"], "summary": "resumo dos resultados", "sources": ["url1","url2"] }`;

    try {
      // Busca múltiplas queries em paralelo
      const queriesRes = await call([{ role: 'user', content: `Tarefa: ${task}\n\nQuais são as 2 melhores queries para buscar isso?` }],
        `Retorne APENAS JSON: {"queries": ["q1","q2"]}`, 100);
      
      let queries = [task];
      try { queries = JSON.parse(queriesRes.replace(/```json|```/g, '').trim()).queries || [task]; } catch(e) {}

      const results = await Promise.all(queries.slice(0, 2).map(q => searchWeb(q)));
      return { agent: 'search', task, result: results.join('\n\n---\n\n') };
    } catch(e) {
      return { agent: 'search', task, result: await searchWeb(task) };
    }
  }

  // ── Agente de Análise ────────────────────────────────────
  async function agentAnalyze(task, context = '') {
    const systemPrompt = `Você é o Agente de Análise do Gabriel. Analisa dados, gráficos, textos e informações de forma profunda e estruturada.
Forneça análises detalhadas, padrões identificados e recomendações práticas em português.`;

    const messages = [{ role: 'user', content: `${context ? 'Contexto:\n' + context + '\n\n' : ''}Tarefa de análise: ${task}` }];
    const result = await call(messages, systemPrompt, 2048);
    return { agent: 'analyze', task, result };
  }

  // ── Agente de Programação ────────────────────────────────
  async function agentCode(task, language = 'javascript') {
    const systemPrompt = `Você é o Agente de Programação do Gabriel. Especialista em escrever código limpo, funcional e bem comentado.
Linguagem preferida: ${language}. Sempre inclua comentários explicativos e exemplos de uso.
Quando criar código completo, sinalize para salvar no Drive ou caderno.`;

    const messages = [{ role: 'user', content: task }];
    const result = await call(messages, systemPrompt, 4096);
    return { agent: 'code', task, result };
  }

  // ── Agente do Drive ──────────────────────────────────────
  async function agentDrive(task) {
    const systemPrompt = `Você é o Agente do Google Drive do Gabriel. Especialista em organizar, criar e gerenciar arquivos no Drive.
Responda indicando exatamente quais ações tomar: criar pasta, fazer upload, buscar arquivo, ou baixar.`;

    let driveContext = '';
    try {
      if (window.Google?.isConnected()) {
        const files = await window.Google.Drive.list('', 10);
        driveContext = `Arquivos recentes no Drive:\n${files.map(f => `- ${f.name}`).join('\n')}`;
      }
    } catch(e) {}

    const messages = [{ role: 'user', content: `${driveContext}\n\nTarefa: ${task}` }];
    const result = await call(messages, systemPrompt, 1024);
    return { agent: 'drive', task, result };
  }

  // ── Orquestrador principal ───────────────────────────────
  async function runAgents(userMessage) {
    // Detecta qual agente usar baseado na mensagem
    const routerPrompt = `Analise a mensagem e decida quais agentes devem ser ativados.
Agentes disponíveis: search (pesquisa web), analyze (análise de dados/textos), code (programação), drive (Google Drive).
Retorne APENAS JSON: {"agents": ["agente1"], "tasks": {"agente1": "tarefa específica"}}
Ative no máximo 2 agentes por vez. Se for conversa simples, retorne {"agents": [], "tasks": {}}`;

    let agentPlan = { agents: [], tasks: {} };
    try {
      const raw = await call([{ role: 'user', content: `Mensagem: "${userMessage}"` }], routerPrompt, 200);
      agentPlan = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch(e) { return null; }

    if (!agentPlan.agents?.length) return null;

    // Executa agentes em paralelo
    const agentResults = await Promise.all(agentPlan.agents.map(agent => {
      const task = agentPlan.tasks[agent] || userMessage;
      switch(agent) {
        case 'search':  return agentSearch(task);
        case 'analyze': return agentAnalyze(task);
        case 'code':    return agentCode(task);
        case 'drive':   return agentDrive(task);
        default:        return Promise.resolve(null);
      }
    }));

    return agentResults.filter(Boolean);
  }

  // ── Chat com suporte a multi-agentes ─────────────────────
  async function chatWithAgents(userMessage, conversationMessages = []) {
    // Verifica se precisa de agentes especializados
    const agentResults = await runAgents(userMessage);

    let enrichedMessage = userMessage;
    if (agentResults?.length) {
      const agentContext = agentResults.map(r =>
        `[${r.agent.toUpperCase()} AGENT RESULT]\n${r.result}`
      ).join('\n\n');
      enrichedMessage = `${userMessage}\n\n[CONTEXTO DOS AGENTES ESPECIALIZADOS]\n${agentContext}`;
    }

    return await chat(enrichedMessage, conversationMessages);
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    chat,
    chatWithAgents,
    runAgents,
    agentSearch,
    agentAnalyze,
    agentCode,
    agentDrive,
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
