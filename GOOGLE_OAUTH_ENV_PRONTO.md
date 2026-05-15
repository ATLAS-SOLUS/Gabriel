# Google OAuth configurado no código

O projeto foi ajustado para usar o novo Client ID OAuth:

```txt
864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com
```

## O que já está aplicado no código

- `netlify/functions/google-config.js` agora usa esse Client ID como fallback público.
- `netlify/functions/google-auth.js` usa o mesmo Client ID como fallback público.
- O `client_secret` **não foi colocado no JavaScript público**, porque isso vazaria a credencial.
- Foi criado `.env.example` com os nomes corretos das variáveis.
- Foi criado `.gitignore` para evitar subir `.env` por acidente.

## O que precisa estar no Netlify

Em **Netlify > Site configuration > Environment variables**, configure:

```env
GOOGLE_CLIENT_ID=864884431271-d7titgkf021ljjjsueh1vrii9erh6fbv.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=SUA_CHAVE_SECRETA_DO_CLIENTE
GOOGLE_REDIRECT_URI=https://atlasgabriel.netlify.app/auth/google/callback
```

Depois faça **novo deploy**.

## Google Cloud

No OAuth Client do Google, confirme:

### Origens JavaScript autorizadas

```txt
https://atlasgabriel.netlify.app
```

### URIs de redirecionamento autorizados

```txt
https://atlasgabriel.netlify.app/auth/google/callback
```
