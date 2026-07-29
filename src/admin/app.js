import { showToast } from "../utils/toast.js";

/** @type {typeof import("../firebase/auth.js") | null} */
let authApi = null;

async function loadAuth() {
  if (authApi) return authApi;
  try {
    authApi = await import("../firebase/auth.js");
    return authApi;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/Faltan variables de Firebase/i.test(msg) || /VITE_FIREBASE/i.test(msg)) {
      throw new Error(
        "Faltan variables de Firebase en Vercel. En el proyecto → Settings → Environment Variables agregá VITE_FIREBASE_* y VITE_ADMIN_UID, después Redeploy."
      );
    }
    throw err;
  }
}

const titles = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  reservas: "Reservas",
  productos: "Productos",
  categorias: "Categorías",
  promociones: "Promociones",
  cupones: "Cupones",
  clientes: "Clientes",
  reportes: "Reportes",
  notificaciones: "Notificaciones",
  configuracion: "Configuración",
};

let current = "";
let alertUnsubs = [];
let appReady = false;
let authListenerBound = false;
let authUnsubscribe = null;
let routeSeq = 0;
const NOTIFICATIONS_SEEN_KEY = "burger_nick_admin_notifications_seen";
/** @type {null | (() => void)} */
let activeUnmount = null;
/** @type {null | (() => boolean)} */
let activeCanLeave = null;
let restoringRoute = false;

const bootEl = () => document.getElementById("bootLoading");
const loginEl = () => document.getElementById("loginView");
const appEl = () => document.getElementById("adminApp");

function setPhase(phase, message) {
  const boot = bootEl();
  const login = loginEl();
  const app = appEl();
  const isBoot = phase === "boot";
  const isLogin = phase === "login";
  const isApp = phase === "app";

  if (boot) {
    boot.hidden = !isBoot;
    const msg = document.getElementById("bootMessage");
    if (msg && message && isBoot) msg.textContent = message;
  }
  if (login) login.hidden = !isLogin;
  if (app) app.hidden = !isApp;

  document.body.classList.toggle("is-login", isLogin);
  document.body.classList.toggle("is-app", isApp);
  document.body.classList.toggle("is-boot", isBoot);
  document.body.classList.remove("login-page");
  document.body.classList.add("admin-body");
  appReady = isApp;
}

function showBoot(message) {
  setPhase("boot", message);
}

function showLogin(errorMessage = "") {
  setPhase("login");
  const err = document.getElementById("loginError");
  if (err) {
    if (errorMessage) {
      err.hidden = false;
      err.textContent = errorMessage;
    } else {
      err.hidden = true;
      err.textContent = "";
    }
  }
  const status = document.getElementById("loginStatus");
  if (status) status.textContent = "";
}

function showApp(user) {
  setPhase("app");
  const emailEl = document.getElementById("adminEmail");
  if (emailEl) emailEl.textContent = user?.email || "";
}

function showBootError(message) {
  setPhase("boot");
  const boot = bootEl();
  if (!boot) return;

  let panel = boot.querySelector("#bootErrorPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "bootErrorPanel";
    panel.style.cssText =
      "max-width:28rem;text-align:center;padding:0 1rem;display:grid;gap:.75rem;justify-items:center";
    boot.appendChild(panel);
  }

  const spinner = boot.querySelector(".spinner");
  const msg = document.getElementById("bootMessage");
  if (spinner) spinner.hidden = true;
  if (msg) msg.hidden = true;
  panel.hidden = false;
  panel.innerHTML = `
    <p style="margin:0">${message || "No se pudo verificar la sesión."}</p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center">
      <button type="button" class="btn btn-primary" id="bootRetry">Intentar nuevamente</button>
      <button type="button" class="btn btn-ghost" id="bootToLogin">Ir al login</button>
    </div>
  `;
  document.getElementById("bootRetry")?.addEventListener("click", () => window.location.reload());
  document.getElementById("bootToLogin")?.addEventListener("click", () => {
    panel.hidden = true;
    if (spinner) spinner.hidden = false;
    if (msg) {
      msg.hidden = false;
      msg.textContent = "Verificando sesión...";
    }
    showLogin();
    bindLoginForm();
  });
}

function clearNotifBadge() {
  const badge = document.getElementById("notifBadge");
  const dot = document.getElementById("bellDot");
  if (badge) {
    badge.hidden = true;
    badge.textContent = "0";
  }
  if (dot) dot.hidden = true;
}

function stopGlobalAlerts() {
  alertUnsubs.forEach((unsubscribe) => {
    unsubscribe?.();
  });
  alertUnsubs = [];
  clearNotifBadge();
}

function unmountActiveView() {
  try {
    activeUnmount?.();
  } catch {
    /* ignore teardown errors */
  }
  activeUnmount = null;
  activeCanLeave = null;
}

function teardownApp() {
  routeSeq += 1;
  unmountActiveView();
  stopGlobalAlerts();
  current = "";
  const root = document.getElementById("viewRoot");
  if (root) root.innerHTML = "";
}

function bindShell() {
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
      const { logoutAdmin } = await loadAuth();
      await logoutAdmin();
    } finally {
      teardownApp();
      showLogin();
      history.replaceState(null, "", "/admin/");
    }
  });
  document.getElementById("menuToggle")?.addEventListener("click", () => {
    const open = document.getElementById("sidebar")?.classList.toggle("is-open");
    document.getElementById("menuToggle")?.setAttribute("aria-expanded", String(Boolean(open)));
  });
  document.getElementById("sidebarBackdrop")?.addEventListener("click", () => {
    document.getElementById("sidebar")?.classList.remove("is-open");
    document.getElementById("menuToggle")?.setAttribute("aria-expanded", "false");
  });
  document.getElementById("notifBell")?.addEventListener("click", () => {
    markNotificationsSeen();
    location.hash = "#/notificaciones";
  });
}

function bindLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("loginError");
    const statusEl = document.getElementById("loginStatus");
    const btn = document.getElementById("loginBtn");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if (!email || !password) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = "Completá email y contraseña.";
      }
      return;
    }

    btn.disabled = true;
    btn.textContent = "Ingresando...";
    if (statusEl) statusEl.textContent = "Autenticando...";

    try {
      const { loginAdmin } = await loadAuth();
      const user = await loginAdmin(email, password);
      showToast("Sesión iniciada", "success");
      if (statusEl) statusEl.textContent = "";
      await enterApp(user);
    } catch (err) {
      let msg = "No se pudo iniciar sesión.";
      if (err?.code === "auth/unauthorized-domain") {
        msg =
          "Dominio no autorizado en Firebase. Agregá el dominio actual en Authentication → Settings → Authorized domains.";
      } else if (err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password") {
        msg = "Email o contraseña incorrectos.";
      } else if (err?.code === "auth/too-many-requests") {
        msg = "Demasiados intentos. Probá más tarde.";
      } else if (err?.message) {
        msg = err.message;
      }
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = msg;
      }
      if (statusEl) statusEl.textContent = "";
    } finally {
      btn.disabled = false;
      btn.textContent = "Iniciar sesión";
    }
  });
}

async function enterApp(user) {
  showApp(user);
  if (!location.hash || location.hash === "#") location.hash = "#/dashboard";
  await route(true);
  startGlobalAlerts().catch(() => {});
}

async function boot() {
  showBoot("Verificando sesión...");
  bindLoginForm();
  bindShell();

  // Evita spinner eterno si Auth/Firestore se cuelga.
  const bootWatchdog = setTimeout(() => {
    if (!appReady && loginEl()?.hidden !== false) {
      showBootError(
        "La verificación de sesión está tardando demasiado. Revisá la conexión o intentá nuevamente."
      );
    }
  }, 15000);

  window.addEventListener("hashchange", () => {
    if (!appReady) return;
    route().catch((err) => {
      const root = document.getElementById("viewRoot");
      if (root) root.innerHTML = `<div class="empty">${err?.message || "Error al cargar la sección."}</div>`;
    });
  });

  try {
    const { requireAdmin, watchAuth } = await loadAuth();

    if (!authListenerBound) {
      authListenerBound = true;
      authUnsubscribe = watchAuth((user) => {
        if (!appReady) return;
        if (!user) {
          teardownApp();
          showLogin("Sesión finalizada.");
        }
      });
    }

    const user = await requireAdmin();
    clearTimeout(bootWatchdog);
    await enterApp(user);
  } catch (err) {
    clearTimeout(bootWatchdog);
    const code = err?.message || "";
    if (code === "UNAUTHENTICATED" || code === "FORBIDDEN") {
      showLogin(code === "FORBIDDEN" ? "No tenés permisos de administrador." : "");
      return;
    }
    showBootError(err?.message || "No se pudo verificar la sesión. Intentá nuevamente.");
  }
}

async function startGlobalAlerts() {
  stopGlobalAlerts();
  if (!localStorage.getItem(NOTIFICATIONS_SEEN_KEY)) {
    localStorage.setItem(NOTIFICATIONS_SEEN_KEY, String(Date.now()));
  }

  const [
    { listenOrders },
    { listenReservations },
    { buildNotifications },
  ] =
    await Promise.all([
      import("../services/orders.js"),
      import("../services/reservations.js"),
      import("../services/notifications.js"),
    ]);

  let orders = [];
  let reservations = [];

  const paint = () => {
    const alerts = buildNotifications({ orders, reservations });
    const seenAt = Number(localStorage.getItem(NOTIFICATIONS_SEEN_KEY) || 0);
    // Solo pedidos posteriores a la última visita + alertas operativas.
    const count = alerts.filter(
      (a) =>
        a.level === "warn"
        || (["Nuevo pedido", "Nueva reserva"].includes(a.title) && a.at > seenAt)
    ).length;
    const badge = document.getElementById("notifBadge");
    const dot = document.getElementById("bellDot");
    if (badge) {
      badge.hidden = count === 0;
      badge.textContent = String(Math.min(count, 99));
    }
    if (dot) dot.hidden = count === 0;
  };

  alertUnsubs = [
    listenOrders(
      (d) => {
        orders = d;
        paint();
      },
      () => {}
    ),
    listenReservations(
      (d) => {
        reservations = d;
        paint();
      },
      () => {}
    ),
  ];
}

/**
 * @returns {Promise<{ unmount: () => void } | null>}
 */
async function loadModule(name) {
  switch (name) {
    case "pedidos": {
      const m = await import("./views/orders.js");
      return {
        mount: (root) => m.mountOrders(root),
        unmount: () => m.unmountOrders?.(),
      };
    }
    case "reservas": {
      const m = await import("./views/reservations.js");
      return {
        mount: (root) => m.mountReservations(root),
        unmount: () => m.unmountReservations?.(),
      };
    }
    case "productos": {
      const m = await import("./views/products.js");
      return {
        mount: (root) => m.mountProducts(root),
        unmount: () => m.unmountProducts?.(),
      };
    }
    case "categorias": {
      const m = await import("./views/categories.js");
      return {
        mount: (root) => m.mountCategories(root),
        unmount: () => m.unmountCategories?.(),
      };
    }
    case "promociones": {
      const m = await import("./views/promotions.js");
      return {
        mount: (root) => m.mountPromotions(root),
        unmount: () => m.unmountPromotions?.(),
      };
    }
    case "cupones": {
      const m = await import("./views/coupons.js");
      return {
        mount: (root) => m.mountCoupons(root),
        unmount: () => m.unmountCoupons?.(),
      };
    }
    case "clientes": {
      const m = await import("./views/customers.js");
      return {
        mount: (root) => m.mountCustomers(root),
        unmount: () => m.unmountCustomers?.(),
      };
    }
    case "reportes": {
      const m = await import("./views/reports.js");
      return {
        mount: (root) => m.mountReports(root),
        unmount: () => m.unmountReports?.(),
      };
    }
    case "notificaciones": {
      const m = await import("./views/notifications.js");
      return {
        mount: (root) => m.mountNotifications(root),
        unmount: () => m.unmountNotifications?.(),
      };
    }
    case "configuracion": {
      const m = await import("./views/settings.js");
      return {
        mount: (root) => m.mountSettings(root),
        unmount: () => m.unmountSettings?.(),
        canLeave: () => m.canLeaveSettings?.() ?? true,
      };
    }
    default: {
      const m = await import("./views/dashboard.js");
      return {
        mount: (root) => m.mountDashboard(root),
        unmount: () => m.unmountDashboard?.(),
      };
    }
  }
}

async function route(force = false) {
  const hash = (location.hash || "#/dashboard").replace(/^#\/?/, "");
  let name = hash.split("?")[0] || "dashboard";
  if (!Object.hasOwn(titles, name)) {
    name = "dashboard";
    history.replaceState(null, "", `${location.pathname}#/dashboard`);
    showToast("La sección solicitada no existe.", "error");
  }
  if (name === "notificaciones") markNotificationsSeen();
  if (!force && name === current) return;
  if (!force && !restoringRoute && activeCanLeave && !activeCanLeave()) {
    restoringRoute = true;
    location.hash = `#/${current || "dashboard"}`;
    queueMicrotask(() => {
      restoringRoute = false;
    });
    return;
  }

  const seq = ++routeSeq;
  unmountActiveView();
  current = name;

  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.route === name);
  });
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = titles[name] || "Admin";
  document.getElementById("sidebar")?.classList.remove("is-open");
  document.getElementById("menuToggle")?.setAttribute("aria-expanded", "false");

  const root = document.getElementById("viewRoot");
  if (!root) return;
  root.innerHTML = `<div class="view-loading"><div class="spinner"></div><p>Cargando...</p></div>`;

  try {
    const mod = await loadModule(name);
    if (seq !== routeSeq) return;
    root.innerHTML = "";
    mod.mount(root);
    activeUnmount = mod.unmount;
    activeCanLeave = mod.canLeave || null;
  } catch (err) {
    if (seq !== routeSeq) return;
    root.innerHTML = `<div class="empty">${err?.message || "No se pudo cargar esta sección."}</div>`;
  }
}

function markNotificationsSeen() {
  localStorage.setItem(NOTIFICATIONS_SEEN_KEY, String(Date.now()));
  const badge = document.getElementById("notifBadge");
  const dot = document.getElementById("bellDot");
  if (badge) badge.hidden = true;
  if (dot) dot.hidden = true;
}

boot();

window.addEventListener("pagehide", () => {
  teardownApp();
  authUnsubscribe?.();
  authUnsubscribe = null;
  authListenerBound = false;
});
