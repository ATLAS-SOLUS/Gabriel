# Gabriel — Upgrade do Chat Avançado

Atualização aplicada para transformar o chat em um assistente mais completo, com micro-agentes, pesquisa gratuita, filmes/séries, tabelas e criação de arquivos.

## Novos recursos

### 1. Micro-agentes para tarefas grandes
O chat agora identifica pedidos maiores e divide em módulos:

- Pesquisa
- Filmes e séries
- Análise
- Código
- Google Drive
- Dados/tabelas
- Documentos

O Gabriel coleta os resultados por partes e junta tudo antes da resposta final.

### 2. Busca web com APIs gratuitas/fallback
O sistema usa a função `netlify/functions/web-search.js`.

Fluxo:

1. Se tiver `BRAVE_SEARCH_API_KEY`, usa Brave Search.
2. Sem chave, usa DuckDuckGo Instant Answer.
3. Se não achar o bastante, o `groq.js` também tenta Wikipedia.

### 3. Filmes e séries
Nova função:

```txt
netlify/functions/entertainment-search.js
```

Fontes:

- TVMaze para séries, sem chave.
- TMDB para filmes, se `TMDB_API_KEY` for configurada.
- Wikipedia/DuckDuckGo como fallback sem chave.

### 4. Tabelas dentro do chat
O renderizador Markdown do `chat.html` agora transforma tabelas Markdown em tabela visual responsiva.

Exemplo suportado:

```md
| Nome | Tipo | Nota |
| --- | --- | --- |
| Dark | Série | 9 |
```

### 5. Criar documentos e arquivos
Novo arquivo:

```txt
document-utils.js
```

Novas ações:

```json
{"action":"create_document","title":"Relatório","content":"...","format":"pdf","fileName":"relatorio","saveToDrive":false}
```

```json
{"action":"create_table","title":"Comparativo","headers":["A","B"],"rows":[["1","2"]],"format":"csv","fileName":"comparativo"}
```

Formatos disponíveis:

- `txt`
- `md`
- `html`
- `doc`
- `pdf`
- `csv` para tabelas

Observação: o formato `doc` é HTML compatível com Word/Google Docs. Para PDF, o navegador carrega `jsPDF` via CDN quando necessário.

### 6. Cache atualizado
O service worker foi atualizado para:

```txt
gabriel-v16-agent-powers-vision-media
```

Também foi incluído `document-utils.js` no cache e as APIs externas foram tratadas como Network First.

## Variáveis opcionais no Netlify

```env
BRAVE_SEARCH_API_KEY=
TMDB_API_KEY=
```

O sistema funciona sem elas, mas com essas chaves os resultados ficam melhores.

## Arquivos principais alterados

- `chat.html`
- `groq.js`
- `actions.js`
- `document-utils.js`
- `sw.js`
- `netlify/functions/entertainment-search.js`
- `.env.example`

