# Desplegar Firebase + dominio de producción

## 1) Firebase Auth — dominio autorizado (obligatorio en Vercel)

1. Abrí https://console.firebase.google.com/project/nick-d259e/authentication/settings
2. En **Authorized domains** → Add domain
3. Agregá exactamente el dominio definitivo de producción.
4. Si usás un dominio propio, agregalo también

Sin esto, el login en Vercel falla con `auth/unauthorized-domain`.

## 2) Firestore rules (obligatorio tras cada cambio de reglas)

Publicá el contenido de `firestore.rules` en:
https://console.firebase.google.com/project/nick-d259e/firestore/rules

O desde la raíz del repo (con Firebase CLI logueado):

```bash
npx firebase-tools login
npx firebase-tools use nick-d259e
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project nick-d259e
```

**Importante:** la cuenta de Firebase CLI debe figurar en `projects:list` con acceso a
`nick-d259e`. Si el deploy da 403, publicá las reglas a mano:

1. Abrí https://console.firebase.google.com/project/nick-d259e/firestore/rules
2. Pegá el contenido completo de `firestore.rules` del repo
3. Publish

Sin esto pueden aparecer errores de permisos en pedidos, panel o reservas.

## 3) Firebase Storage

1. Habilitá Storage en https://console.firebase.google.com/project/nick-d259e/storage
2. Desplegá `storage.rules` con el comando anterior.
3. El panel guarda imágenes en `products/`, `promotions/`, `categories/` y `branding/`.
4. Solo el administrador definido en Firestore puede subir o borrar; la lectura es pública.

## 4) Vercel

- Framework: Other
- Build Command: `npm run build`
- Output Directory: `dist`
- El repo ya incluye `vercel.json` con rewrites de `/admin`
- Cargá todas las variables de `.env.example` en Production y Preview.

## 5) App Check

Creá una clave reCAPTCHA v3, guardala como `VITE_FIREBASE_APPCHECK_SITE_KEY`, verificá el tráfico
y recién después activá enforcement para Firestore y Storage. Activarlo sin la variable publicada
bloquea los pedidos.
