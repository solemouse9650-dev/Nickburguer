# Burger Nick — Web + Panel Admin (Firebase)

Sitio público + panel administrativo con Firebase Auth, Firestore y Storage.

## Desarrollo

```bash
npm install
npm run dev
```

- Sitio: http://localhost:5173/
- Login admin: http://localhost:5173/admin/
- Dashboard: http://localhost:5173/admin/dashboard.html

## Seed inicial (una vez)

Carga productos, promociones, settings y contador:

```bash
npm run seed -- --password=TU_PASSWORD_ADMIN
```

También podés iniciar sesión en `/admin` con el usuario admin: el perfil se crea automáticamente la primera vez.

## Deploy

```bash
npm run build
npx firebase login
npx firebase deploy
```

## Credenciales admin

Usá el usuario creado en Firebase Authentication (email/password). No guardes la contraseña en el repositorio.
