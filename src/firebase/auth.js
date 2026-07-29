import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./config.js";

const BOOTSTRAP_ADMIN_UID = String(import.meta.env.VITE_ADMIN_UID || "").trim();

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

function isBootstrapAdmin(user) {
  return Boolean(BOOTSTRAP_ADMIN_UID && user?.uid === BOOTSTRAP_ADMIN_UID);
}

/**
 * API oficial de Firebase: espera a que Auth termine de hidratar IndexedDB.
 */
async function waitForAuthUser(timeoutMs = 10000) {
  try {
    await withTimeout(auth.authStateReady(), timeoutMs, "AUTH_TIMEOUT");
  } catch {
    // si timeout, igual devolvemos lo que haya
  }
  return auth.currentUser;
}

async function ensureAdminProfile(user) {
  const ref = doc(db, "users", user.uid);

  try {
    const snap = await withTimeout(
      getDoc(ref),
      10000,
      "No se pudo leer el perfil de administrador (timeout Firestore)."
    );
    if (snap.exists() && snap.data()?.role === "admin") return true;

    // Solo el UID bootstrap puede auto-crear su perfil admin (primera vez).
    if (!isBootstrapAdmin(user)) return false;

    await withTimeout(
      setDoc(
        ref,
        {
          email: user.email || "",
          role: "admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      10000,
      "No se pudo crear el perfil de administrador (timeout Firestore)."
    );
    return true;
  } catch (err) {
    if (err?.code === "permission-denied") {
      throw new Error(
        "Firestore rechazó la lectura/escritura del perfil admin. Verificá el documento users y publicá las reglas del proyecto."
      );
    }
    throw err;
  }
}

export async function loginAdmin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const ok = await ensureAdminProfile(cred.user);
  if (!ok) {
    await signOut(auth);
    throw new Error("No tenés permisos de administrador.");
  }
  return cred.user;
}

export async function logoutAdmin() {
  await signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function requireAdmin() {
  const user = await waitForAuthUser();
  if (!user) throw new Error("UNAUTHENTICATED");

  const ok = await ensureAdminProfile(user);
  if (!ok) {
    await signOut(auth);
    throw new Error("FORBIDDEN");
  }
  return user;
}
