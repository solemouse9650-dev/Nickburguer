# Burger Nick — Web + Panel Admin (Firebase)

Sitio público + panel administrativo con Firebase Auth, Firestore y Firebase Storage.

## Desarrollo

```bash
npm install
npm run check
npm run dev
```

Las reglas Firestore tienen pruebas de autorización en `tests/firestore.rules.test.mjs`. Para
ejecutarlas necesitás Java 21 y luego `npm run test:rules`.

- Sitio: http://localhost:5173/
- Login admin: http://localhost:5173/admin/
- Dashboard: http://localhost:5173/admin/#/dashboard

## Configuración

1. Copiá `.env.example` a `.env.local`.
2. Completá Firebase y el UID/email del administrador. El documento `users/{uid}` debe existir con
   `role: "admin"`; el frontend no crea ni eleva administradores.
3. En Firebase Authentication habilitá Email/Password y agregá el dominio de producción.
4. Publicá reglas e índices antes de iniciar sesión en el panel:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project nick-d259e
```

La API key web de Firebase termina en el bundle del navegador por diseño. La seguridad depende de
reglas, dominios autorizados y App Check; nunca uses claves privadas ni contraseñas en variables
`VITE_*`.

## Seed demo inicial

Carga productos, promociones, settings, clientes, pedidos, reservas y contador únicamente si la base está
vacía. Primero valida referencias, totales, IDs y cupones.

```bash
npm run validate:demo
$secure = Read-Host "Contraseña temporal" -AsSecureString
$env:SEED_PASSWORD = [Net.NetworkCredential]::new("", $secure).Password
npm run seed
Remove-Item Env:SEED_PASSWORD
```

No pases la contraseña como argumento: quedaría en el historial. En desarrollo también podés usar
“Cargar datos demo”. Esa opción no se incluye en producción salvo que se configure explícitamente
`VITE_ALLOW_DEMO_SEED=true`.

## Deploy

```bash
npm run build
npm run preview
npm run test:e2e
npx firebase-tools login
npx firebase-tools deploy --project nick-d259e
```

## Credenciales admin

Usá el usuario creado en Firebase Authentication (email/password). No guardes la contraseña en el repositorio.

## Checklist de producción

- `npm run check` finaliza sin errores.
- Firestore Rules e índices están desplegados.
- El dominio está autorizado en Firebase Authentication.
- Las variables de entorno están configuradas en el hosting.
- Firebase Storage está habilitado y `storage.rules` fue desplegado.
- Se reemplazó o eliminó cualquier dato demo antes de operar con clientes reales.
- Se activó Firebase App Check y se rotaron credenciales compartidas por canales inseguros.
