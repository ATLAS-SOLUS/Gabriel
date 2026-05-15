# Correção — Groq TPM / Request too large

Erro corrigido:

```txt
Request too large for model llama-3.3-70b-versatile ... tokens per minute (TPM): Limit 12000, Requested 14164
```

## Causa

O sistema estava pedindo uma saída grande demais (`max_tokens` alto) e ainda enviava junto:

- histórico longo da conversa;
- memórias demais;
- tarefas e eventos demais no prompt;
- contexto de agentes especializados;
- anexos de texto grandes;
- imagens em base64 muito pesadas;
- chamadas extras de auditoria e memória logo após a resposta.

No plano/on-demand da Groq, o limite de TPM pode ser baixo. Mesmo que o modelo aceite contexto grande, o serviço recusa quando o total por minuto passa do limite.

## Ajustes aplicados

### `groq.js`

- Reduzido `MAX_TOKENS_ACTIONS` de `12000` para limite seguro.
- Reduzido histórico usado pela IA.
- Criado estimador simples de tokens.
- Criada compactação automática de:
  - system prompt;
  - histórico;
  - mensagens longas;
  - anexos textuais;
  - respostas dos agentes.
- Criado retry automático em modo econômico quando o Groq recusar por tamanho/TPM.
- Reduzida auditoria final para não estourar token.
- Reduzida extração de memórias.
- Reduzida pesquisa web interna.

### `chat.html`

- Histórico enviado ao modelo agora é limitado.
- Texto de anexos agora é compactado.
- Imagens são redimensionadas e comprimidas com mais força antes de ir para visão.
- Retry de ações não reenvia imagem de novo sem necessidade.
- Mensagem de erro do Groq ficou mais clara.

### `memory.js`

- Extração automática de memória agora espera mais tempo.
- Se a conversa ficou grande demais, a memória automática é pulada para não gastar TPM extra no mesmo ciclo.

### `sw.js` e HTMLs

- Cache atualizado para `gabriel-v14-groq-token-safe`.
- Scripts com querystring nova para evitar navegador carregar `groq.js` antigo.

## Observação

Isso não tira completamente o limite do Groq. Nenhum código consegue ignorar limite do provedor.
O que foi feito é o correto: mandar menos lixo, preservar o essencial e impedir que o agente desperdice tokens com histórico/anexos gigantes.
