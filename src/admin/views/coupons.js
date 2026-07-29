import {
  createCoupon,
  deleteCoupon,
  duplicateCoupon,
  listenCoupons,
  updateCoupon,
} from "../../services/coupons.js";
import { escapeHtml, formatDate, formatMoney } from "../../utils/format.js";
import { confirmDialog, showToast } from "../../utils/toast.js";

let unsub = null;
let coupons = [];
let clickAbort = null;

function toInputDate(value) {
  if (!value) return "";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromInputDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function mountCoupons(root) {
  unmountCoupons();
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>Cupones de descuento</h2>
        <button type="button" class="btn btn-primary" id="newCoupon">+ Nuevo cupón</button>
      </div>
      <p class="panel-hint" style="margin:0 0 1rem;color:var(--muted);font-size:.9rem">
        Reglas: vigencia, usos máximos, compra mínima, tope de descuento, envío gratis y aplicar al envío.
        Los clientes los cargan en el paso de pago del pedido.
      </p>
      <div class="table-wrap" id="couponsTable"><div class="skeleton"></div></div>
    </section>
    <div id="couponFormHost"></div>
  `;

  clickAbort = new AbortController();
  const { signal } = clickAbort;
  root.querySelector("#newCoupon").addEventListener("click", () => openForm(root, null), { signal });

  unsub = listenCoupons(
    (data) => {
      coupons = data;
      renderTable(root);
    },
    (err) => {
      showToast(err.message || "Error al cargar cupones", "error");
      const wrap = root.querySelector("#couponsTable");
      if (wrap) wrap.innerHTML = '<div class="empty">No se pudieron cargar los cupones.</div>';
    }
  );

  root.addEventListener(
    "click",
    async (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");
      const toggle = e.target.closest("[data-toggle]");
      const dup = e.target.closest("[data-dup]");
      if (edit) openForm(root, coupons.find((c) => c.id === edit.dataset.edit));
      if (toggle) {
        const c = coupons.find((x) => x.id === toggle.dataset.toggle);
        if (!c) return;
        try {
          await updateCoupon(c.id, { active: !c.active });
          showToast(c.active ? "Cupón desactivado" : "Cupón activado", "success");
        } catch (err) {
          showToast(err.message || "Error", "error");
        }
      }
      if (dup) {
        const c = coupons.find((x) => x.id === dup.dataset.dup);
        if (!c) return;
        try {
          await duplicateCoupon(c);
          showToast("Cupón duplicado", "success");
        } catch (err) {
          showToast(err.message || "Error", "error");
        }
      }
      if (del) {
        if (!confirmDialog("¿Eliminar este cupón?")) return;
        try {
          await deleteCoupon(del.dataset.del);
          showToast("Cupón eliminado", "success");
        } catch (err) {
          showToast(err.message || "Error", "error");
        }
      }
    },
    { signal }
  );
}

export function unmountCoupons() {
  if (unsub) unsub();
  unsub = null;
  clickAbort?.abort();
  clickAbort = null;
  coupons = [];
}

function renderTable(root) {
  const wrap = root.querySelector("#couponsTable");
  if (!wrap) return;
  if (!coupons.length) {
    wrap.innerHTML = '<div class="empty">No hay cupones. Creá el primero.</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Descuento</th>
          <th>Reglas</th>
          <th>Vigencia</th>
          <th>Usos</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${coupons
          .map((c) => {
            const discount =
              c.type === "fixed"
                ? `$${Number(c.value || 0).toLocaleString("es-AR")}`
                : `${c.value || 0}%`;
            const uses =
              c.maxUses != null
                ? `${c.usedCount || 0} / ${c.maxUses}`
                : `${c.usedCount || 0} / ∞`;
            const rules = [];
            if (Number(c.minOrderAmount) > 0) rules.push(`Mín. ${formatMoney(c.minOrderAmount)}`);
            if (c.maxDiscount != null) rules.push(`Tope ${formatMoney(c.maxDiscount)}`);
            if (c.freeShipping) rules.push("Envío gratis");
            if (c.applyToShipping) rules.push("Incluye envío");
            return `<tr>
              <td><strong>${escapeHtml(c.code)}</strong></td>
              <td>${discount}</td>
              <td>${rules.length ? escapeHtml(rules.join(" · ")) : "—"}</td>
              <td>${formatDate(c.startDate)} → ${formatDate(c.endDate)}</td>
              <td>${uses}</td>
              <td><span class="badge ${c.active ? "badge-activo" : "badge-inactivo"}">${c.active ? "Activo" : "Inactivo"}</span></td>
              <td class="actions">
                <button class="btn btn-sm btn-ghost" data-edit="${c.id}">Editar</button>
                <button class="btn btn-sm btn-ghost" data-toggle="${c.id}">${c.active ? "Desactivar" : "Activar"}</button>
                <button class="btn btn-sm btn-ghost" data-dup="${c.id}">Duplicar</button>
                <button class="btn btn-sm btn-danger" data-del="${c.id}">Eliminar</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function openForm(root, coupon) {
  const host = root.querySelector("#couponFormHost");
  host.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>${coupon ? "Editar cupón" : "Nuevo cupón"}</h2>
        <button type="button" class="btn btn-ghost" id="cancelCoupon">Cancelar</button>
      </div>
      <form id="couponForm" class="form-grid">
        <div class="field"><label>Código *</label><input name="code" required value="${escapeHtml(coupon?.code || "")}" placeholder="NICK10" /></div>
        <div class="field">
          <label>Tipo</label>
          <select name="type">
            <option value="percent" ${coupon?.type !== "fixed" ? "selected" : ""}>Porcentaje</option>
            <option value="fixed" ${coupon?.type === "fixed" ? "selected" : ""}>Monto fijo</option>
          </select>
        </div>
        <div class="field"><label>Valor *</label><input type="number" name="value" min="0" step="any" required value="${coupon?.value ?? ""}" /></div>
        <div class="field"><label>Uso máximo</label><input type="number" name="maxUses" min="0" value="${coupon?.maxUses ?? ""}" placeholder="Ilimitado" /></div>
        <div class="field"><label>Compra mínima (sin envío)</label><input type="number" name="minOrderAmount" min="0" value="${coupon?.minOrderAmount ?? ""}" placeholder="0" /></div>
        <div class="field"><label>Tope descuento (solo %)</label><input type="number" name="maxDiscount" min="0" value="${coupon?.maxDiscount ?? ""}" placeholder="Sin tope" /></div>
        <div class="field"><label>Inicio</label><input type="date" name="startDate" value="${toInputDate(coupon?.startDate)}" /></div>
        <div class="field"><label>Fin</label><input type="date" name="endDate" value="${toInputDate(coupon?.endDate)}" /></div>
        <div class="field full"><label>Descripción</label><input name="description" value="${escapeHtml(coupon?.description || "")}" /></div>
        <div class="field">
          <div class="switch-row" style="border:0;padding-top:1.6rem">
            <span>Activo</span>
            <label class="switch"><input type="checkbox" name="active" ${coupon?.active !== false ? "checked" : ""} /><span></span></label>
          </div>
        </div>
        <div class="field">
          <div class="switch-row" style="border:0;padding-top:1.6rem">
            <span>Envío gratis</span>
            <label class="switch"><input type="checkbox" name="freeShipping" ${coupon?.freeShipping ? "checked" : ""} /><span></span></label>
          </div>
        </div>
        <div class="field">
          <div class="switch-row" style="border:0;padding-top:1.6rem">
            <span>Descuento también sobre el envío</span>
            <label class="switch"><input type="checkbox" name="applyToShipping" ${coupon?.applyToShipping ? "checked" : ""} /><span></span></label>
          </div>
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit">Guardar</button></div>
      </form>
    </section>`;

  host.querySelector("#cancelCoupon").onclick = () => {
    host.innerHTML = "";
  };
  host.querySelector("#couponForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      code: form.code.value.trim().toUpperCase(),
      type: form.type.value,
      value: Number(form.value.value),
      maxUses: form.maxUses.value === "" ? null : Number(form.maxUses.value),
      minOrderAmount: form.minOrderAmount.value === "" ? 0 : Number(form.minOrderAmount.value),
      maxDiscount: form.maxDiscount.value === "" ? null : Number(form.maxDiscount.value),
      startDate: fromInputDate(form.startDate.value),
      endDate: fromInputDate(form.endDate.value),
      description: form.description.value.trim(),
      active: form.active.checked,
      freeShipping: form.freeShipping.checked,
      applyToShipping: form.applyToShipping.checked,
    };
    if (!payload.code || payload.value < 0) {
      showToast("Código y valor son obligatorios", "error");
      return;
    }
    if (payload.type === "percent" && payload.value > 100) {
      showToast("El porcentaje no puede superar 100", "error");
      return;
    }
    try {
      if (coupon?.id) await updateCoupon(coupon.id, payload);
      else await createCoupon(payload);
      showToast("Cupón guardado", "success");
      host.innerHTML = "";
    } catch (err) {
      showToast(err.message || "Error al guardar", "error");
    }
  };
}
