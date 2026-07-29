# Desplegar reglas Firebase + dominio Vercel

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
firebase deploy --only firestore:rules
```

**Crítico para el checkout:** las reglas de `/customers` deben permitir create/update desde invitados (sin Auth) **sin** permitir `getDoc`/`read` público. Si no publicás estas reglas, el pedido se guarda pero el cliente puede ver `Missing or insufficient permissions` al finalizar (y antes se cortaba la pantalla de pago).

Incluye también: lectura pública de cupones e incremento de usos al aplicar un cupón en el checkout.

## 3) Supabase Storage

Ver `SUPABASE_SETUP.md` (bucket público `media`).

## 4) Vercel

- Framework: Other
- Build Command: `npm run build`
- Output Directory: `dist`
- El repo ya incluye `vercel.json` con rewrites de `/admin`
