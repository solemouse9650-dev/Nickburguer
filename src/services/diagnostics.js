import { collection, getDocs, limit, query } from "firebase/firestore";
import { getStorage, list, ref } from "firebase/storage";
import { app, auth, db } from "../firebase/config.js";

const storage = getStorage(app);

function errorMessage(error) {
  const code = error?.code ? `${error.code}: ` : "";
  return `${code}${error?.message || "Error desconocido"}`;
}

export async function runSystemDiagnostics() {
  const checks = [
    {
      id: "firebase",
      label: "Proyecto Firebase",
      ok: Boolean(app.options.projectId && app.options.appId),
      detail: app.options.projectId || "Sin configurar",
    },
    {
      id: "auth",
      label: "Sesión administrativa",
      ok: Boolean(auth.currentUser),
      detail: auth.currentUser?.email || "Sin sesión",
    },
    {
      id: "network",
      label: "Conexión del navegador",
      ok: navigator.onLine,
      detail: navigator.onLine ? "En línea" : "Sin conexión",
    },
    {
      id: "app-check",
      label: "Firebase App Check",
      ok: Boolean(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY),
      detail: import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY
        ? "Clave del sitio configurada"
        : "Falta VITE_FIREBASE_APPCHECK_SITE_KEY en el entorno de producción",
    },
  ];

  const firestoreResult = await Promise.allSettled([
    getDocs(query(collection(db, "business_settings"), limit(1))),
    getDocs(query(collection(db, "products"), limit(1))),
    getDocs(query(collection(db, "orders"), limit(1))),
    getDocs(query(collection(db, "reservations"), limit(1))),
  ]);
  const firestoreError = firestoreResult.find((result) => result.status === "rejected");
  checks.push({
    id: "firestore",
    label: "Firestore y permisos",
    ok: !firestoreError,
    detail: firestoreError
      ? errorMessage(firestoreError.reason)
      : "Configuración, productos, pedidos y reservas accesibles",
  });

  try {
    await list(ref(storage, "products"), { maxResults: 1 });
    checks.push({
      id: "storage",
      label: "Firebase Storage",
      ok: true,
      detail: app.options.storageBucket || "Bucket accesible",
    });
  } catch (error) {
    checks.push({
      id: "storage",
      label: "Firebase Storage",
      ok: false,
      detail: errorMessage(error),
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date(),
    checks,
  };
}
