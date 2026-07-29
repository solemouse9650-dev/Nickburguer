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
  ];

  const firestoreResult = await Promise.allSettled([
    getDocs(query(collection(db, "business_settings"), limit(1))),
    getDocs(query(collection(db, "products"), limit(1))),
    getDocs(query(collection(db, "orders"), limit(1))),
  ]);
  const firestoreError = firestoreResult.find((result) => result.status === "rejected");
  checks.push({
    id: "firestore",
    label: "Firestore y permisos",
    ok: !firestoreError,
    detail: firestoreError
      ? errorMessage(firestoreError.reason)
      : "Configuración, productos y pedidos accesibles",
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
