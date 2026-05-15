# Gabriel Power Mode v18 — Upgrade contra respostas básicas

Esta versão melhora o Gabriel para trabalhar mais parecido com um assistente avançado: ele não apenas responde, ele tenta planejar, dividir, executar, consolidar e revisar.

## Principais mudanças

### 1. Modo avançado automático
O chat agora ativa o modo avançado quando detecta pedidos de:

- pesquisa web;
- notícias recentes;
- filmes e séries;
- imagens, pôsteres e referências visuais;
- análise de imagem/anexo;
- documentos, PDF, DOC, CSV e tabelas;
- código/sistemas/scripts;
- tarefas grandes, detalhadas ou profissionais.

Antes, os micro-agentes só rodavam em casos mais específicos. Agora eles entram sempre que o pedido merece uma entrega melhor.

### 2. Consolidador Premium
Foi adicionada a função `Groq.synthesizeWithAgents()`.

Ela pega os resultados dos agentes especializados e transforma tudo em uma resposta final única, sem mostrar bastidores, sem duplicação e com melhor formatação.

### 3. Revisor Premium anti-resposta básica
Foi adicionada a função `Groq.repairIncompleteAnswer()`.

Ela detecta quando a resposta ficou curta, rasa, mal formatada ou com cara de rascunho, e tenta reescrever antes de mostrar ao usuário.

### 4. Detector de baixa qualidade
Foi adicionada a função `Groq.isLowQualityAnswer()`.

Ela verifica sinais como:

- resposta curta demais para tarefa complexa;
- falta de tabela/lista/código em pedidos que exigem estrutura;
- uso de frases ruins como "não consegui", "posso tentar", "..." ou "restante do código";
- pouca organização visual.

### 5. Notícias gratuitas
Foi adicionada a Netlify Function:

```txt
netlify/functions/news-search.js
```

Ela tenta buscar notícias via Google News RSS e fallback GDELT, sem chave obrigatória.

Nova ação disponível:

```json
{"action":"search_news","query":"tema da notícia","count":8}
```

### 6. Histórico melhorado sem estourar tokens
O chat agora usa mais mensagens recentes, mas compactadas para reduzir risco de erro TPM no Groq.

### 7. Cache atualizado
Service Worker atualizado para:

```txt
gabriel-v18-power-mode-premium
```

Scripts atualizados com cache busting:

```txt
?v=20260515-power-v18
```

## Arquivos alterados

- `groq.js`
- `chat.html`
- `actions.js`
- `sw.js`
- `netlify/functions/news-search.js`

## Depois do deploy

Abra:

```txt
https://atlasgabriel.netlify.app/reset-google.html
```

Clique para limpar cache antes de testar o chat.
