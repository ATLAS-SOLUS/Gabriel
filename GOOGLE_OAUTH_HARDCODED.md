# Google OAuth hardcoded — correção `deleted_client`

Atualização aplicada em 15/05/2026.

## O que foi alterado

- O `google.js` agora usa diretamente o Client ID novo.
- A Function `netlify/functions/google-auth.js` agora possui fallback interno para Client ID, Client Secret e Redirect URI.
- A Function `netlify/functions/google-config.js` retorna o Client ID novo com `Cache-Control: no-store`.
- O `sw.js` mudou para `gabriel-v12-google-oauth-hardcoded` e passou a usar Network First para HTML/JS/CSS.
- Todos os HTMLs que carregam `google.js` ganharam versão/cache busting.
- Foi adicionado `reset-google.html` para limpar cache, tokens antigos e service worker.

## Configuração Google Cloud esperada

### Origem JavaScript autorizada

```txt
https://atlasgabriel.netlify.app
```

### URI de redirecionamento autorizado

```txt
https://atlasgabriel.netlify.app/auth/google/callback
```

## Se ainda aparecer `deleted_client`

1. Publique este ZIP novo no Netlify.
2. Abra:

```txt
https://atlasgabriel.netlify.app/reset-google.html
```

3. Clique em limpar cache.
4. Faça login novamente.

Se o erro continuar, o navegador ou Netlify ainda está servindo arquivo antigo. Verifique se `google.js` contém o Client ID novo abaixo:

```txt
864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com
```
