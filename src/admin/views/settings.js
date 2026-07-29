import { DEFAULT_SETTINGS, listenSettings, saveSettings } from "../../services/settings.js";
import { runSystemDiagnostics } from "../../services/diagnostics.js";
import { deleteImageByPath, uploadImage } from "../../services/storage.js";
import { escapeHtml } from "../../utils/format.js";
import { showErrorToast, showToast } from "../../utils/toast.js";

let unsub = null;
let settings = structuredClone(DEFAULT_SETTINGS);
let tab = "negocio";
let formDirty = false;

window.addEventListener("beforeunload", (event) => {
  if (!formDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

const DAYS = [
  ["lunes", "Lunes"],
  ["martes", "Martes"],
  ["miercoles", "Miércoles"],
  ["jueves", "Jueves"],
  ["viernes", "Viernes"],
  ["sabado", "Sábado"],
  ["domingo", "Domingo"],
];

export function mountSettings(root) {
  unmountSettings();
  tab = "negocio";
  formDirty = false;
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head"><h2>Configuración del negocio</h2></div>
      <div class="tabs" id="settingsTabs">
        <button type="button" class="tab is-active" data-tab="negocio">Negocio</button>
        <button type="button" class="tab" data-tab="contacto">Contacto</button>
        <button type="button" class="tab" data-tab="horarios">Horarios</button>
        <button type="button" class="tab" data-tab="redes">Redes</button>
        <button type="button" class="tab" data-tab="envio">Pedidos / Envío</button>
        <button type="button" class="tab" data-tab="mensajes">Mensajes</button>
        <button type="button" class="tab" data-tab="about">Nosotros</button>
        <button type="button" class="tab" data-tab="clientes">Clientes VIP</button>
        <button type="button" class="tab" data-tab="branding">Visual</button>
        <button type="button" class="tab" data-tab="sistema">Estado del sistema</button>
      </div>
      <form id="settingsForm"></form>
    </section>
  `;

  root.querySelector("#settingsTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    if (formDirty && !confirm("Hay cambios sin guardar. ¿Cambiar de pestaña?")) return;
    tab = btn.dataset.tab;
    formDirty = false;
    root.querySelectorAll(".tab").forEach((item) => {
      item.classList.toggle("is-active", item === btn);
    });
    renderForm(root);
  });

  unsub = listenSettings(
    (data) => {
      settings = data;
      if (!formDirty) renderForm(root);
    },
    (err) => showErrorToast(err, "Error al cargar configuración")
  );
}

export function unmountSettings() {
  if (unsub) unsub();
  unsub = null;
  formDirty = false;
}

export function canLeaveSettings() {
  return !formDirty || confirm("Hay cambios sin guardar. ¿Salir de esta sección?");
}

function renderForm(root) {
  const form = root.querySelector("#settingsForm");
  if (!form) return;
  const b = settings.business || {};
  const c = settings.contact || {};
  const s = settings.social || {};
  const ship = settings.shipping || {};
  const m = settings.messages || {};
  const br = settings.branding || {};
  const pay = settings.payment || {};
  const store = settings.store || {};
  const about = settings.about || {};
  const cust = settings.customers || {};

  if (tab === "negocio") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>Nombre</label><input name="business.name" value="${escapeHtml(b.name || "")}" /></div>
        <div class="field"><label>Slogan</label><input name="business.slogan" value="${escapeHtml(b.slogan || "")}" /></div>
        <div class="field full"><label>Descripción</label><textarea name="business.description" rows="3">${escapeHtml(b.description || "")}</textarea></div>
        <div class="field"><label>Dirección</label><input name="business.address" value="${escapeHtml(b.address || "")}" /></div>
        <div class="field"><label>Ciudad</label><input name="business.city" value="${escapeHtml(b.city || "")}" /></div>
        <div class="field"><label>Provincia</label><input name="business.province" value="${escapeHtml(b.province || "")}" /></div>
        <div class="field"><label>Código postal</label><input name="business.postalCode" value="${escapeHtml(b.postalCode || "")}" /></div>
        <div class="field"><label>Latitud local</label><input name="store.lat" type="number" step="any" value="${store.lat ?? ""}" /></div>
        <div class="field"><label>Longitud local</label><input name="store.lng" type="number" step="any" value="${store.lng ?? ""}" /></div>
        <div class="field full"><label>Link Google Maps</label><input name="store.mapsUrl" value="${escapeHtml(store.mapsUrl || "")}" placeholder="https://maps.google.com/..." /></div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "contacto") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>WhatsApp principal</label><input name="contact.whatsappPrimary" value="${escapeHtml(c.whatsappPrimary || c.whatsapp || "")}" /></div>
        <div class="field"><label>WhatsApp secundario</label><input name="contact.whatsappSecondary" value="${escapeHtml(c.whatsappSecondary || "")}" /></div>
        <div class="field"><label>Código país</label><input name="contact.whatsappCountryCode" value="${escapeHtml(c.whatsappCountryCode || "54")}" /></div>
        <div class="field"><label>Email</label><input name="contact.email" value="${escapeHtml(c.email || "")}" /></div>
        <div class="field"><label>Teléfono fijo</label><input name="contact.phoneLandline" value="${escapeHtml(c.phoneLandline || "")}" /></div>
        <div class="field"><label>Teléfono móvil</label><input name="contact.phoneMobile" value="${escapeHtml(c.phoneMobile || "")}" /></div>
        <div class="field"><label>Alias pago</label><input name="payment.alias" value="${escapeHtml(pay.alias || "")}" /></div>
        <div class="field"><label>CBU / CVU</label><input name="payment.cbu" value="${escapeHtml(pay.cbu || "")}" placeholder="00000031000..." /></div>
        <div class="field full"><label>Titular de la cuenta</label><input name="payment.holder" value="${escapeHtml(pay.holder || "")}" /></div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "horarios") {
    form.innerHTML = `
      <div class="form-grid">
        ${DAYS.map(([key, label]) => {
          const h = settings.hours?.[key] || { closed: true, open: "", close: "" };
          return `
            <div class="field full" style="border-bottom:1px solid var(--line);padding-bottom:.8rem">
              <strong>${label}</strong>
              <div class="switch-row">
                <span>Cerrado</span>
                <label class="switch"><input type="checkbox" name="hours.${key}.closed" ${h.closed ? "checked" : ""} /><span></span></label>
              </div>
              <div class="form-grid">
                <div class="field"><label>Apertura</label><input type="time" name="hours.${key}.open" value="${escapeHtml(h.open || "")}" /></div>
                <div class="field"><label>Cierre</label><input type="time" name="hours.${key}.close" value="${escapeHtml(h.close || "")}" /></div>
              </div>
            </div>`;
        }).join("")}
      </div>
      ${saveBar()}
    `;
  } else if (tab === "redes") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>Instagram</label><input name="social.instagram" value="${escapeHtml(s.instagram || "")}" /></div>
        <div class="field"><label>Threads</label><input name="social.threads" value="${escapeHtml(s.threads || s.facebook || "")}" /></div>
        <div class="field"><label>TikTok</label><input name="social.tiktok" value="${escapeHtml(s.tiktok || "")}" /></div>
        <div class="field"><label>X (Twitter)</label><input name="social.twitter" value="${escapeHtml(s.twitter || "")}" /></div>
        <div class="field full"><label>YouTube</label><input name="social.youtube" value="${escapeHtml(s.youtube || "")}" /></div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "envio") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field full">
          <div class="switch-row">
            <span>Envío gratuito activado</span>
            <label class="switch"><input type="checkbox" name="shipping.freeShippingEnabled" ${ship.freeShippingEnabled ? "checked" : ""} /><span></span></label>
          </div>
        </div>
        <div class="field"><label>Mínimo envío gratis</label><input type="number" name="shipping.freeShippingMin" value="${ship.freeShippingMin ?? 25000}" /></div>
        <div class="field"><label>Monto mínimo de pedido</label><input type="number" name="shipping.minOrderAmount" value="${ship.minOrderAmount ?? 0}" /></div>
        <div class="field"><label>Costo estándar / base</label><input type="number" name="shipping.baseCost" value="${ship.baseCost ?? ship.standardCost ?? 3000}" /></div>
        <div class="field"><label>Costo por km</label><input type="number" name="shipping.costPerKm" value="${ship.costPerKm ?? 3000}" /></div>
        <div class="field"><label>Radio máximo (km)</label><input type="number" name="shipping.maxRadiusKm" value="${ship.maxRadiusKm ?? 15}" /></div>
        <div class="field"><label>Tiempo estimado (min)</label><input type="number" name="shipping.estimatedMinutes" value="${ship.estimatedMinutes ?? 40}" /></div>
        <div class="field full">
          <label>Costos por zona</label>
          <p class="muted" style="margin:0 0 .4rem;font-size:.85rem">Una zona por línea: <code>kmMax,costo</code> (ej. <code>3,2000</code>). Si hay zonas, reemplazan el cálculo por km.</p>
          <textarea name="shipping.zoneCostsText" rows="4" placeholder="3,2000&#10;8,4500&#10;15,7000">${escapeHtml(
            (ship.zoneCosts || [])
              .map((z) => `${z.maxKm ?? z.untilKm ?? ""},${z.cost ?? z.price ?? ""}`)
              .join("\n")
          )}</textarea>
        </div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "mensajes") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field full"><label>Pedido recibido</label><textarea name="messages.received" rows="2">${escapeHtml(m.received || "")}</textarea></div>
        <div class="field full"><label>Pedido confirmado</label><textarea name="messages.confirmed" rows="2">${escapeHtml(m.confirmed || "Tu pedido fue confirmado.")}</textarea></div>
        <div class="field full"><label>En preparación</label><textarea name="messages.preparing" rows="2">${escapeHtml(m.preparing || "")}</textarea></div>
        <div class="field full"><label>Listo</label><textarea name="messages.ready" rows="2">${escapeHtml(m.ready || "Tu pedido está listo.")}</textarea></div>
        <div class="field full"><label>En camino</label><textarea name="messages.onTheWay" rows="2">${escapeHtml(m.onTheWay || "Tu pedido va en camino.")}</textarea></div>
        <div class="field full"><label>Entregado</label><textarea name="messages.delivered" rows="2">${escapeHtml(m.delivered || "")}</textarea></div>
        <div class="field full"><label>Cancelado</label><textarea name="messages.cancelled" rows="2">${escapeHtml(m.cancelled || "")}</textarea></div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "about") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field full"><label>Misión</label><textarea name="about.mission" rows="3">${escapeHtml(about.mission || "")}</textarea></div>
        <div class="field full"><label>Visión</label><textarea name="about.vision" rows="3">${escapeHtml(about.vision || "")}</textarea></div>
        <div class="field full"><label>Calidad</label><textarea name="about.quality" rows="3">${escapeHtml(about.quality || "")}</textarea></div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "clientes") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>VIP · gasto mínimo</label><input type="number" name="customers.vipMinSpent" value="${cust.vipMinSpent ?? 50000}" /></div>
        <div class="field"><label>VIP · pedidos mínimos</label><input type="number" name="customers.vipMinOrders" value="${cust.vipMinOrders ?? 5}" /></div>
        <div class="field"><label>Recurrente · pedidos mínimos</label><input type="number" name="customers.recurrentMinOrders" value="${cust.recurrentMinOrders ?? 2}" /></div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "branding") {
    form.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>Color primario</label><input type="color" name="branding.primaryColor" value="${br.primaryColor || "#d8c6a5"}" /></div>
        <div class="field"><label>Color secundario</label><input type="color" name="branding.secondaryColor" value="${br.secondaryColor || "#f2e8d8"}" /></div>
        <div class="field full"><label>URL Logo</label><input name="branding.logoUrl" value="${escapeHtml(br.logoUrl || "")}" /></div>
        <div class="field full"><label>URL Favicon</label><input name="branding.faviconUrl" value="${escapeHtml(br.faviconUrl || "")}" /></div>
        <div class="field full"><label>URL Hero</label><input name="branding.heroUrl" value="${escapeHtml(br.heroUrl || "")}" /></div>
        <div class="field full"><label>URL Portada</label><input name="branding.coverUrl" value="${escapeHtml(br.coverUrl || "")}" /></div>
        <div class="field full">
          <label>Subir logo</label>
          <input type="file" id="logoFile" accept="image/*" />
        </div>
        <div class="field full">
          <label>Subir hero</label>
          <input type="file" id="heroFile" accept="image/*" />
        </div>
      </div>
      ${saveBar()}
    `;
  } else if (tab === "sistema") {
    form.innerHTML = `
      <div class="system-health">
        <div class="panel__head">
          <div>
            <h3>Diagnóstico de producción</h3>
            <p class="muted">Comprueba sesión, Firestore y Firebase Storage sin modificar datos.</p>
          </div>
          <button type="button" class="btn btn-primary" id="runDiagnostics">Ejecutar diagnóstico</button>
        </div>
        <div class="system-health__grid" id="diagnosticsResult">
          <div class="skeleton"></div>
        </div>
      </div>
    `;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    await persist(form);
  };

  form.addEventListener("input", () => {
    formDirty = true;
  });
  form.addEventListener("change", () => {
    formDirty = true;
  });

  form.querySelector("#logoFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await uploadImage(file, "branding");
      if (!settings.branding) settings.branding = {};
      const previousPath = settings.branding.logoPath;
      settings.branding.logoUrl = up.url;
      settings.branding.logoPath = up.path;
      settings.branding.faviconUrl = settings.branding.faviconUrl || up.url;
      formDirty = false;
      await saveSettings(settings);
      if (previousPath) {
        deleteImageByPath(previousPath).catch(() => {});
      }
      showToast("Logo subido y guardado", "success");
      renderForm(root);
    } catch (err) {
      showErrorToast(err, "Error al subir");
    }
  });

  form.querySelector("#heroFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await uploadImage(file, "branding");
      if (!settings.branding) settings.branding = {};
      const previousPath = settings.branding.heroPath;
      settings.branding.heroUrl = up.url;
      settings.branding.heroPath = up.path;
      formDirty = false;
      await saveSettings(settings);
      if (previousPath) {
        deleteImageByPath(previousPath).catch(() => {});
      }
      showToast("Hero subido y guardado", "success");
      renderForm(root);
    } catch (err) {
      showErrorToast(err, "Error al subir");
    }
  });

  form.querySelector("#runDiagnostics")?.addEventListener("click", () => {
    executeDiagnostics(form);
  });
  if (tab === "sistema") executeDiagnostics(form);
}

function saveBar() {
  return `<div style="margin-top:1rem"><button class="btn btn-primary" type="submit">Guardar cambios</button></div>`;
}

async function persist(form) {
  const next = structuredClone(settings);
  const fd = new FormData(form);

  for (const [key, raw] of fd.entries()) {
    setPath(next, key, raw);
  }

  // checkboxes no enviados
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    setPath(next, input.name, input.checked);
  });

  // sync whatsapp
  if (next.contact?.whatsappPrimary) {
    next.contact.whatsapp = next.contact.whatsappPrimary;
  }
  if (next.shipping) {
    next.shipping.standardCost = Number(next.shipping.baseCost || next.shipping.standardCost || 0);
    next.shipping.baseCost = Number(next.shipping.baseCost || 0);
    next.shipping.costPerKm = Number(next.shipping.costPerKm || 0);
    next.shipping.freeShippingMin = Number(next.shipping.freeShippingMin || 0);
    next.shipping.maxRadiusKm = Number(next.shipping.maxRadiusKm || 15);
    next.shipping.minOrderAmount = Number(next.shipping.minOrderAmount || 0);
    next.shipping.estimatedMinutes = Number(next.shipping.estimatedMinutes || 40);
    const zonesRaw = String(next.shipping.zoneCostsText || "").trim();
    if (zonesRaw) {
      next.shipping.zoneCosts = zonesRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [maxKm, cost] = line.split(/[,;\s]+/).map((x) => Number(x));
          return { maxKm, cost };
        })
        .filter((z) => Number.isFinite(z.maxKm) && Number.isFinite(z.cost));
    } else if (typeof next.shipping.zoneCosts === "string") {
      try {
        next.shipping.zoneCosts = JSON.parse(next.shipping.zoneCosts || "[]");
      } catch {
        next.shipping.zoneCosts = [];
      }
    } else {
      next.shipping.zoneCosts = Array.isArray(next.shipping.zoneCosts)
        ? next.shipping.zoneCosts
        : [];
    }
    delete next.shipping.zoneCostsText;
  }
  if (next.store) {
    next.store.lat = Number(next.store.lat);
    next.store.lng = Number(next.store.lng);
  }
  if (next.customers) {
    next.customers.vipMinSpent = Number(next.customers.vipMinSpent || 50000);
    next.customers.vipMinOrders = Number(next.customers.vipMinOrders || 5);
    next.customers.recurrentMinOrders = Number(next.customers.recurrentMinOrders || 2);
  }

  try {
    validateSettings(next);
    await saveSettings(next);
    settings = next;
    formDirty = false;
    showToast("Configuración guardada", "success");
  } catch (err) {
    showErrorToast(err, "No se pudo guardar");
  }
}

function validateSettings(next) {
  const businessName = String(next.business?.name || "").trim();
  if (businessName.length < 2) throw new Error("El nombre del negocio es obligatorio.");
  next.business.name = businessName;

  const primary = String(next.contact?.whatsappPrimary || "").replace(/\D/g, "");
  const secondary = String(next.contact?.whatsappSecondary || "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(primary)) {
    throw new Error("El WhatsApp principal debe tener entre 8 y 15 dígitos.");
  }
  if (secondary && !/^\d{8,15}$/.test(secondary)) {
    throw new Error("El WhatsApp secundario debe tener entre 8 y 15 dígitos.");
  }
  next.contact.whatsappPrimary = primary;
  next.contact.whatsappSecondary = secondary;
  next.contact.whatsapp = primary;

  const lat = Number(next.store?.lat);
  const lng = Number(next.store?.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("La latitud del local no es válida.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("La longitud del local no es válida.");
  }

  const urlFields = [
    ["Google Maps", next.store?.mapsUrl],
    ["Instagram", next.social?.instagram],
    ["Threads", next.social?.threads],
    ["TikTok", next.social?.tiktok],
    ["X", next.social?.twitter],
    ["YouTube", next.social?.youtube],
    ["Logo", next.branding?.logoUrl],
    ["Favicon", next.branding?.faviconUrl],
    ["Hero", next.branding?.heroUrl],
    ["Portada", next.branding?.coverUrl],
  ];
  urlFields.forEach(([label, value]) => {
    const text = String(value || "").trim();
    if (!text || text.startsWith("/") || text.startsWith("data:image/")) return;
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`${label}: usá una URL HTTPS válida.`);
    }
  });

  const shipping = next.shipping || {};
  ["baseCost", "costPerKm", "freeShippingMin", "minOrderAmount"].forEach((field) => {
    if (Number(shipping[field]) < 0) throw new Error("Los importes de envío no pueden ser negativos.");
  });
  if (Number(shipping.maxRadiusKm) <= 0) {
    throw new Error("El radio máximo de delivery debe ser mayor a cero.");
  }
  if (Number(shipping.estimatedMinutes) <= 0) {
    throw new Error("El tiempo estimado debe ser mayor a cero.");
  }

  Object.entries(next.hours || {}).forEach(([day, hours]) => {
    if (!hours.closed && (!hours.open || !hours.close)) {
      throw new Error(`Completá apertura y cierre para ${day}.`);
    }
  });

  const cbu = String(next.payment?.cbu || "").replace(/\D/g, "");
  if (cbu && cbu.length !== 22) throw new Error("El CBU/CVU debe tener 22 dígitos.");
  next.payment.cbu = cbu;
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  const last = parts[parts.length - 1];
  if (value === "true") cur[last] = true;
  else if (value === "false") cur[last] = false;
  else cur[last] = value;
}

async function executeDiagnostics(form) {
  const root = form.querySelector("#diagnosticsResult");
  const button = form.querySelector("#runDiagnostics");
  if (!root) return;
  if (button) {
    button.disabled = true;
    button.textContent = "Comprobando...";
  }
  root.innerHTML = '<div class="skeleton"></div>';
  try {
    const result = await runSystemDiagnostics();
    root.innerHTML = result.checks
      .map(
        (check) => `
          <article class="system-health__item ${check.ok ? "is-ok" : "is-error"}">
            <span class="system-health__dot" aria-hidden="true"></span>
            <div>
              <strong>${escapeHtml(check.label)}</strong>
              <p>${escapeHtml(check.detail)}</p>
            </div>
          </article>`
      )
      .join("");
    showToast(
      result.ok ? "Todos los servicios están operativos" : "Hay servicios que requieren atención",
      result.ok ? "success" : "error"
    );
  } catch (error) {
    root.innerHTML = `<div class="empty">${escapeHtml(error.message || "No se pudo ejecutar el diagnóstico.")}</div>`;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Ejecutar diagnóstico";
    }
  }
}
