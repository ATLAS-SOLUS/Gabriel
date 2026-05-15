# Correção final do Google OAuth — `deleted_client`

## Diagnóstico

A URL de callback chegou com `code=...`, então a primeira etapa do Google Login funcionou.

Quando aparece `The OAuth client was deleted` nessa fase, o erro normalmente acontece na troca do `code` por token dentro da Netlify Function `google-auth.js`.

A causa mais provável era variável antiga do Netlify (`GOOGLE_CLIENT_ID`) sobrescrevendo o Client ID novo do código. Esta versão força o Client ID novo diretamente nas Functions e ignora `process.env` para o OAuth.

## Client ID usado

```txt
864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com
```

## Redirect URI obrigatório no Google Cloud

```txt
https://atlasgabriel.netlify.app/auth/google/callback
```

## Depois do deploy

1. Publique este ZIP no Netlify.
2. Abra `/reset-google.html` e limpe cache/tokens.
3. Abra `/oauth-debug.html` e confira se `google_config_function.client_id` é igual ao Client ID acima.
4. Faça login novamente.

## Observação importante

O `code` OAuth da URL de callback expira rápido e só pode ser usado uma vez. Se uma tentativa deu erro, volte para o login e autorize novamente.
