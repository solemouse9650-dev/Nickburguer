let container;

function ensureContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.className = "toast-container";
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
  return container;
}

function isPermissionError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  return (
    code === "permission-denied"
    || code === "storage/unauthorized"
    || code === "storage/unknown"
    || /missing or insufficient permissions/i.test(message)
  );
}

/**
 * Traduce errores de Firebase. Nunca devuelve el texto en inglés
 * "Missing or insufficient permissions".
 */
export function formatAppError(error, fallback = "Ocurrió un error.") {
  if (error == null || error === "") return fallback;

  if (typeof error === "string") {
    if (/missing or insufficient permissions/i.test(error)) {
      return fallback;
    }
    return error;
  }

  const code = String(error.code || "");
  const message = String(error.message || "");

  if (isPermissionError(error)) {
    return fallback;
  }

  if (code === "auth/unauthorized-domain") {
    return "Dominio no autorizado en Firebase Authentication.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return "Email o contraseña incorrectos.";
  }
  if (code === "auth/too-many-requests") {
    return "Demasiados intentos. Probá más tarde.";
  }
  if (code === "failed-precondition") {
    return "Falta un índice en Firestore. Revisá la consola de Firebase.";
  }

  if (message && !/^7\s+PERMISSION_DENIED/i.test(message)) {
    return message.replace(/^FirebaseError:\s*/i, "");
  }

  return fallback;
}

export function showToast(message, type = "info") {
  if (message == null || message === "") return;
  if (/missing or insufficient permissions/i.test(String(message))) return;
  const root = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

/**
 * @param {unknown} error
 * @param {string | null} [fallback]
 *   Si es null/omitido y el error es de permisos, no se muestra toast (lecturas).
 *   Si hay fallback, se muestra ese texto en español (escrituras).
 */
export function showErrorToast(error, fallback = null) {
  if (isPermissionError(error)) {
    if (fallback) showToast(fallback, "error");
    return;
  }
  const message = formatAppError(error, fallback || "Ocurrió un error.");
  if (message) showToast(message, "error");
}

export function confirmDialog(message) {
  return window.confirm(message);
}
