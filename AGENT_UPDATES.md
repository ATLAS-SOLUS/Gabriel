# Atualizações do Agente Gabriel

## O que foi corrigido

- O agente agora usa um fluxo mais rígido de execução: entender, executar ações, conferir pendências e melhorar a resposta final.
- Foi adicionada auditoria automática para reduzir respostas pela metade ou tarefas incompletas.
- O envio de imagem agora é preparado para análise visual real pelo modelo multimodal.
- Arquivos de texto pequenos agora têm o conteúdo extraído e enviado para a IA como contexto.
- O histórico enviado para a IA foi ajustado para evitar duplicar a última mensagem do usuário.
- A memória agora usa memórias relevantes ao pedido atual, não apenas as últimas salvas.
- As notas criadas pelo agente passam por reforço de conteúdo completo quando vierem rasas demais.

## Melhorias Google

- Renovação automática de token Google via `refresh_token` usando Netlify Function.
- Gmail agora tem leitura completa de e-mails e criação de rascunho.
- Google Agenda ganhou consulta de eventos de hoje e remoção de evento por ID.
- Google Drive ganhou criação de pasta, leitura/exportação de texto e busca com tratamento melhor de caracteres.
- Uploads para Drive passam a tentar garantir token válido antes de enviar.

## Novas ações disponíveis

- `memory_add`
- `gmail_read`
- `gmail_draft`
- `gcal_today`
- `gcal_delete`
- `drive_create_folder`
- `drive_read_text`

## Arquivos alterados

- `groq.js`
- `chat.html`
- `actions.js`
- `google.js`
- `netlify/functions/google-auth.js`
- `memory.js`
- `sw.js`

## Observação importante

A análise visual depende do modelo configurado na Groq aceitar imagem. O sistema usa por padrão `meta-llama/llama-4-scout-17b-16e-instruct` para visão e mantém fallback textual caso o modelo de visão falhe.
