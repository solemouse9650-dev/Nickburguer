import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./config.js";

const BOOTSTRAP_ADMIN_UID = import.meta.env.VITE_ADMIN_UID || "";

function isBootstrapAdmin(user) {
  return Boolean(BOOTSTRAP_ADMIN_UID && user?.uid === BOOTSTRAP_ADMIN_UID);
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

/**
 * API oficial de Firebase: espera a que Auth termine de hidratar IndexedDB.
 */
export async function waitForAuthUser(timeoutMs = 10000) {
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
    if (!isBootstrapAdmin(user)) return false;

    await withTimeout(
      setDoc(
        ref,
        {
          uid: user.uid,
          email: user.email,
          role: "admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      10000,
      "No se pudo crear el perfil admin (timeout Firestore)."
    );
    return true;
  } catch (err) {
    if (!isBootstrapAdmin(user)) throw err;
    try {
      await withTimeout(
        setDoc(
          ref,
          {
            uid: user.uid,
            email: user.email,
            role: "admin",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
        10000,
        "No se pudo crear el perfil admin (timeout Firestore)."
      );
      return true;
    } catch (writeErr) {
      const code = writeErr?.code || err?.code || "";
      if (code === "permission-denied") {
        throw new Error(
          "Firestore rechazó el perfil admin. Publicá firestore.rules en https://console.firebase.google.com/project/nick-d259e/firestore/rules"
        );
      }
      throw new Error(writeErr?.message || err?.message || "Error de permisos");
    }
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

export function getCurrentUser() {
  return auth.currentUser;
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
