# Correção do erro Google OAuth `401: deleted_client`

Esse erro acontece quando o Client ID OAuth usado pelo app foi apagado, pertence a outro projeto removido ou o app ainda está apontando para um Client ID antigo.

## O que foi ajustado no código

- Removido o Client ID fixo antigo de `google.js`.
- Adicionada a Netlify Function `netlify/functions/google-config.js`.
- O frontend agora busca o Client ID atual em `/.netlify/functions/google-config`.
- O callback reaproveita o mesmo `redirect_uri` usado no início do login.
- A tela de callback mostra erro mais claro quando o Google retorna `deleted_client`.

## Variáveis obrigatórias no Netlify

Configure em **Site configuration → Environment variables**:

```env
GOOGLE_CLIENT_ID=SEU_NOVO_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=SEU_NOVO_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://atlasgabriel.netlify.app/auth/google/callback
```

Se você usar outro domínio, troque o `GOOGLE_REDIRECT_URI` para o domínio real.

## Google Cloud Console

Crie um novo OAuth Client do tipo **Web application** e adicione este redirect autorizado:

```txt
https://atlasgabriel.netlify.app/auth/google/callback
```

Em desenvolvimento local, adicione também algo como:

```txt
http://localhost:8888/auth/google/callback
http://localhost:5173/auth/google/callback
```

## APIs que precisam estar ativadas

Ative no mesmo projeto Google Cloud usado pelo OAuth:

- Gmail API
- Google Calendar API
- Google Drive API
- People API / OAuth userinfo quando necessário

## Depois de configurar

1. Faça deploy novamente no Netlify.
2. Abra o site em janela anônima.
3. Clique em conectar Google.
4. Autorize novamente a conta.
5. Se ainda aparecer conta antiga, limpe localStorage do navegador para o domínio do app.
