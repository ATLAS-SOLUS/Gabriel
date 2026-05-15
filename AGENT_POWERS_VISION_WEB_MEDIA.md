# Gabriel — Upgrade de Agentes, Visão, Web e Mídia

Versão: `gabriel-v17-format-premium`  
Data: 15/05/2026

## Objetivo

Transformar o Gabriel de um chat comum em um workspace com agentes especializados, cada um com ferramentas próprias, para reduzir respostas pela metade e melhorar entregas grandes.

## Novos poderes

### 1. Agente de Visão

- Ativado automaticamente quando o usuário envia imagem.
- Analisa print, foto, layout, objeto, texto visível e erro em tela.
- Não tenta identificar pessoa real pelo rosto.
- Entrega achados, texto visível e próximos passos.

### 2. Agente de Imagens

Nova ação:

```json
{"action":"search_images","query":"tema da imagem","count":6}
```

Nova função Netlify:

```txt
netlify/functions/image-search.js
```

Fontes usadas:

- Wikimedia Commons sem chave.
- Openverse como tentativa anônima quando disponível.
- Pexels opcional via `PEXELS_API_KEY`.
- Unsplash opcional via `UNSPLASH_ACCESS_KEY`.

### 3. Filmes e séries com visual

A busca de entretenimento agora tenta retornar pôster/imagem no chat.

- Séries: TVMaze.
- Filmes: TMDB opcional via `TMDB_API_KEY`.
- Fallback: Wikipedia/DuckDuckGo.

O retorno pode vir com Markdown de imagem:

```md
![Dark](https://...)
```

O chat transforma isso em card visual.

### 4. Renderização visual no chat

O `chat.html` agora renderiza imagens Markdown como cards responsivos.

Exemplo:

```md
![Poster](https://exemplo.com/poster.jpg)
```

Vira card com imagem, título e toque para abrir.

### 5. Micro-agentes mais fortes

Agentes disponíveis agora:

- `search` — pesquisa web.
- `entertainment` — filmes/séries.
- `images` — busca visual.
- `vision` — análise de imagem anexada.
- `analyze` — raciocínio, riscos e lacunas.
- `code` — programação.
- `drive` — arquivos Google Drive.
- `data` — tabela/dados.
- `document` — documento, relatório, PDF/DOC.

O roteador agora pode ativar até 8 agentes.

### 6. Cache atualizado

Service Worker novo:

```txt
gabriel-v17-format-premium
```

Depois do deploy, abra:

```txt
https://atlasgabriel.netlify.app/reset-google.html
```

Limpe o cache para garantir que o navegador use os arquivos novos.

## Variáveis opcionais no Netlify

```env
BRAVE_SEARCH_API_KEY=
TMDB_API_KEY=
PEXELS_API_KEY=
UNSPLASH_ACCESS_KEY=
```

Sem elas, o sistema continua funcionando com os fallbacks grátis.
