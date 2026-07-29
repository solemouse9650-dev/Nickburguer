import { logoutAdmin } from "../firebase/auth.js";

/** @deprecated El gate vive en app.js (SPA). Se mantiene por compatibilidad. */
export async function guardAdminPage() {
  const { requireAdmin } = await import("../firebase/auth.js");
  return requireAdmin();
}

export async function handleLogout() {
  try {
    await logoutAdmin();
  } finally {
    window.location.replace("/admin/");
  }
}
