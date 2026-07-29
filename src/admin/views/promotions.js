import {
  createPromotion,
  deletePromotion,
  listenPromotions,
  updatePromotion,
} from "../../services/promotions.js";
import { deleteImageByPath, uploadImage } from "../../services/storage.js";
import { escapeHtml, formatDate } from "../../utils/format.js";
import { confirmDialog, showErrorToast, showToast } from "../../utils/toast.js";

function toInputDate(value) {
  if (!value) return "";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromInputDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

let unsub = null;
let promos = [];
let editing = null;
let imageFile = null;
let imagePreview = "";
let imagePath = "";
let clickAbort = null;

function revokeImagePreview() {
  if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
  imagePreview = "";
}

export function mountPromotions(root) {
  unmountPromotions();
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>Promociones</h2>
        <button type="button" class="btn btn-primary" id="newPromoBtn">+ Nueva promoción</button>
      </div>
      <div class="table-wrap" id="promosTable"><div class="skeleton"></div></div>
    </section>
    <div id="promoFormHost"></div>
  `;

  clickAbort = new AbortController();
  const { signal } = clickAbort;

  root.querySelector("#newPromoBtn").addEventListener("click", () => openForm(root, null), { signal });
  unsub = listenPromotions(
    (data) => {
      promos = data;
      renderTable(root);
    },
    (err) => {
      showErrorToast(err, "Error al cargar promociones");
      const wrap = root.querySelector("#promosTable");
      if (wrap) wrap.innerHTML = '<div class="empty">No se pudieron cargar las promociones.</div>';
    }
  );

  root.addEventListener(
    "click",
    async (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");
      const toggle = e.target.closest("[data-toggle]");
      if (edit) openForm(root, promos.find((p) => p.id === edit.dataset.edit));
      if (toggle) {
        const p = promos.find((x) => x.id === toggle.dataset.toggle);
        if (!p) return;
        try {
          await updatePromotion(p.id, { active: !p.active });
          showToast(p.active ? "Promoción desactivada" : "Promoción activada", "success");
        } catch (err) {
          showErrorToast(err, "Error");
        }
      }
      if (del) {
        if (!confirmDialog("¿Eliminar esta promoción?")) return;
        try {
          const p = promos.find((x) => x.id === del.dataset.del);
          await deletePromotion(del.dataset.del);
          if (p?.imagePath) deleteImageByPath(p.imagePath).catch(() => {});
          showToast("Promoción eliminada", "success");
        } catch (err) {
          showErrorToast(err, "Error al eliminar");
        }
      }
    },
    { signal }
  );
}

export function unmountPromotions() {
  if (unsub) unsub();
  unsub = null;
  clickAbort?.abort();
  clickAbort = null;
  promos = [];
  editing = null;
  imageFile = null;
  revokeImagePreview();
  imagePath = "";
}

function renderTable(root) {
  const wrap = root.querySelector("#promosTable");
  if (!wrap) return;
  if (!promos.length) {
    wrap.innerHTML = '<div class="empty">No hay promociones.</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th></th><th>Título</th><th>Estado</th><th>Fechas</th><th>CTA</th><th>Acciones</th></tr></thead>
      <tbody>
        ${promos
          .map(
            (p) => `<tr>
              <td><img class="thumb" src="${escapeHtml(p.imageUrl || "/burger-nick-logo.png")}" alt="" onerror="this.onerror=null;this.src='/burger-nick-logo.png'" /></td>
              <td>${escapeHtml(p.title)}<br><small style="color:#9a9590">${escapeHtml(p.description || "")}</small></td>
              <td><span class="badge ${p.active ? "badge-activo" : "badge-inactivo"}">${p.active ? "Activa" : "Inactiva"}</span></td>
              <td>${formatDate(p.startDate)} → ${formatDate(p.endDate)}</td>
              <td>${escapeHtml(p.cta || "—")}</td>
              <td class="actions">
                <button class="btn btn-sm btn-ghost" data-edit="${p.id}">Editar</button>
                <button class="btn btn-sm btn-ghost" data-toggle="${p.id}">${p.active ? "Desactivar" : "Activar"}</button>
                <button class="btn btn-sm btn-danger" data-del="${p.id}">Eliminar</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function openForm(root, promo) {
  revokeImagePreview();
  editing = promo;
  imageFile = null;
  imagePreview = promo?.imageUrl || "";
  imagePath = promo?.imagePath || "";
  const host = root.querySelector("#promoFormHost");
  host.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>${promo ? "Editar promoción" : "Nueva promoción"}</h2>
        <button type="button" class="btn btn-ghost" id="cancelPromo">Cancelar</button>
      </div>
      <form id="promoForm" class="form-grid">
        <div class="field"><label>Título *</label><input name="title" required value="${escapeHtml(promo?.title || "")}" /></div>
        <div class="field"><label>Badge</label><input name="badge" value="${escapeHtml(promo?.badge || "")}" /></div>
        <div class="field full"><label>Descripción</label><textarea name="description" rows="3">${escapeHtml(promo?.description || "")}</textarea></div>
        <div class="field"><label>CTA</label><input name="cta" value="${escapeHtml(promo?.cta || "Pedir ahora")}" /></div>
        <div class="field"><label>Link</label><input name="link" value="${escapeHtml(promo?.link || "#menu")}" /></div>
        <div class="field"><label>Fecha inicio</label><input type="date" name="startDate" value="${toInputDate(promo?.startDate)}" /></div>
        <div class="field"><label>Fecha fin</label><input type="date" name="endDate" value="${toInputDate(promo?.endDate)}" /></div>
        <div class="field"><label>Precio (opcional)</label><input type="number" name="price" value="${promo?.price ?? ""}" /></div>
        <div class="field full"><p class="muted">Las promociones son piezas informativas. Para aplicar descuentos en el checkout, creá un cupón.</p></div>
        <div class="field">
          <div class="switch-row" style="border:0;padding-top:1.6rem">
            <span>Activa</span>
            <label class="switch"><input type="checkbox" name="active" ${promo?.active !== false ? "checked" : ""} /><span></span></label>
          </div>
        </div>
        <div class="field full">
          <label>Imagen</label>
          <div class="dropzone" id="promoDrop">${imagePreview ? `<img src="${escapeHtml(imagePreview)}" alt="" />` : "<p>Arrastrá o seleccioná imagen</p>"}</div>
          <input type="file" id="promoImage" accept="image/*" hidden />
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit">Guardar</button></div>
      </form>
    </section>
  `;

  const dz = host.querySelector("#promoDrop");
  const input = host.querySelector("#promoImage");
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files?.[0]) {
      revokeImagePreview();
      imageFile = input.files[0];
      imagePreview = URL.createObjectURL(imageFile);
      dz.innerHTML = `<img src="${imagePreview}" alt="" />`;
    }
  });
  host.querySelector("#cancelPromo").addEventListener("click", () => {
    revokeImagePreview();
    host.innerHTML = "";
  });
  host.querySelector("#promoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    let uploadedPath = "";
    let saved = false;
    try {
      let imageUrl = imagePreview.startsWith("blob:") ? editing?.imageUrl || "" : imagePreview;
      let nextPath = imagePath;
      if (imageFile) {
        const up = await uploadImage(imageFile, "promotions");
        imageUrl = up.url;
        nextPath = up.path;
        uploadedPath = up.path;
      }
      const payload = {
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        badge: form.badge.value.trim(),
        cta: form.cta.value.trim(),
        link: form.link.value.trim(),
        active: form.active.checked,
        price: form.price.value ? Number(form.price.value) : null,
        startDate: fromInputDate(form.startDate.value),
        endDate: fromInputDate(form.endDate.value),
        imageUrl,
        imagePath: nextPath || "",
      };
      if (editing?.id) await updatePromotion(editing.id, payload);
      else await createPromotion(payload);
      saved = true;
      if (imageFile && editing?.imagePath && editing.imagePath !== nextPath) {
        deleteImageByPath(editing.imagePath).catch(() => {});
      }
      showToast("Promoción guardada", "success");
      revokeImagePreview();
      host.innerHTML = "";
    } catch (err) {
      if (!saved && uploadedPath) deleteImageByPath(uploadedPath).catch(() => {});
      showErrorToast(err, "Error al guardar");
    } finally {
      btn.disabled = false;
    }
  });
}
