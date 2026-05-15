# Correção de Formatação Premium do Chat — Gabriel

Versão: `gabriel-v17-format-premium`

## Problema corrigido

O chat estava mostrando resultado de busca e de micro-agentes de forma bagunçada:

- várias tentativas apareciam juntas;
- mensagens de ação vinham abertas com conteúdo gigante;
- imagens em Markdown com URL contendo parênteses quebravam;
- tabelas ficavam grudadas no texto;
- pedidos digitados/ditados como `tragra filmes` eram buscados literalmente;
- imagens de PDFs do Wikimedia podiam aparecer como se fossem pôster/imagem útil.

## Ajustes aplicados

### 1. Resultado final mais limpo

Agora o Gabriel tenta consolidar a resposta em uma entrega única e remove marcações internas como:

- `[RESULTADOS DOS MICRO-AGENTES]`
- `[RESULTADO DE IMAGENS]`
- `<gabriel_actions>`

Também evita repetir blocos como `Tabela de resultados` e `Cards de imagem/pôster`.

### 2. Ações ficam recolhidas por padrão

As ações executadas agora aparecem como um selo pequeno:

```txt
3 feita(s) · ver detalhes
```

Ao clicar, mostra detalhes resumidos. Isso impede que resultados enormes de pesquisa destruam a tela.

### 3. Correção de termos antes da busca

Antes de chamar APIs, o chat normaliza termos comuns de voz/digitação:

- `tragra` → `traga`
- `sereies` → `séries`
- `poster` → `pôster`

Pedidos genéricos como `traga filmes` viram:

```txt
filmes e séries populares recomendados para assistir hoje
```

Assim o sistema não tenta buscar `tragra filmes` como se fosse nome de empresa, filme ou série.

### 4. Imagens Markdown mais robustas

O renderizador agora aceita URLs com parênteses, muito comuns em Wikimedia/Commons.

Exemplo que antes quebrava:

```md
![Imagem](https://site.com/arquivo_(1906).jpg)
```

Agora vira card visual.

### 5. Filtro de imagens ruins

A função `image-search.js` agora ignora thumbnails de PDF/documentos quando a fonte é Wikimedia Commons, evitando resultados como página escaneada de jornal antigo quando o usuário pediu filme/série.

### 6. Menos duplicação em filmes/séries

A busca de entretenimento agora não pede para o modelo repetir cards de pôster duas vezes. Os cards são anexados uma vez e o resumo vem logo abaixo.

### 7. Cache atualizado

Service Worker atualizado para:

```txt
gabriel-v17-format-premium
```

Depois do deploy, abrir:

```txt
/reset-google.html
```

para limpar cache antigo.
