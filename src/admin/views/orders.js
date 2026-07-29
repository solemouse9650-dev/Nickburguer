import {
  createOrderFromCheckout,
  deleteOrder,
  listenOrders,
  updateOrder,
  updateOrderStatus,
} from "../../services/orders.js";
import { listenProducts } from "../../services/products.js";
import { listenSettings } from "../../services/settings.js";
import { printOrderTicket } from "../../utils/analytics.js";
import {
  ORDER_STATUSES,
  buildCustomerWhatsAppUrl,
  escapeHtml,
  formatDate,
  formatMoney,
  getStatusMessage,
  normalizeOrderStatus,
  normalizePhone,
  productUnitPrice,
  statusLabel,
} from "../../utils/format.js";
import { confirmDialog, showErrorToast, showToast } from "../../utils/toast.js";

let unsub = null;
let unsubProducts = null;
let unsubSettings = null;
let allOrders = [];
let products = [];
let settings = {};
let filter = "todos";
let search = "";
let dateFrom = "";
let dateTo = "";
let sortKey = "date_desc";
let clickAbort = null;

export function mountOrders(root) {
  unmountOrders();
  filter = "todos";
  search = "";
  dateFrom = "";
  dateTo = "";
  sortKey = "date_desc";

  root.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>Gestión de pedidos</h2>
        <button type="button" class="btn btn-primary" id="newOrderBtn">+ Crear pedido</button>
      </div>
      <div class="table-tools table-tools--wrap">
        <input type="search" id="orderSearch" placeholder="Buscar cliente, teléfono u orden..." />
        <select id="orderFilter">
          <option value="todos">Todos los estados</option>
          ${ORDER_STATUSES.map((s) => `<option value="${s}">${statusLabel(s)}</option>`).join("")}
        </select>
        <select id="orderSort">
          <option value="date_desc">Más recientes</option>
          <option value="date_asc">Más antiguos</option>
          <option value="total_desc">Mayor total</option>
          <option value="total_asc">Menor total</option>
        </select>
        <input type="date" id="orderFrom" aria-label="Desde" />
        <input type="date" id="orderTo" aria-label="Hasta" />
      </div>
      <div class="table-wrap" id="ordersTable"><div class="skeleton"></div></div>
    </section>
  `;

  clickAbort = new AbortController();
  const { signal } = clickAbort;

  root.querySelector("#newOrderBtn").addEventListener("click", () => openOrderForm(null), { signal });
  root.querySelector("#orderSearch").addEventListener(
    "input",
    (e) => {
      search = e.target.value.trim().toLowerCase();
      renderTable(root);
    },
    { signal }
  );
  root.querySelector("#orderFilter").addEventListener(
    "change",
    (e) => {
      filter = e.target.value;
      renderTable(root);
    },
    { signal }
  );
  root.querySelector("#orderSort").addEventListener(
    "change",
    (e) => {
      sortKey = e.target.value;
      renderTable(root);
    },
    { signal }
  );
  root.querySelector("#orderFrom").addEventListener(
    "change",
    (e) => {
      dateFrom = e.target.value;
      renderTable(root);
    },
    { signal }
  );
  root.querySelector("#orderTo").addEventListener(
    "change",
    (e) => {
      dateTo = e.target.value;
      renderTable(root);
    },
    { signal }
  );

  unsub = listenOrders(
    (data) => {
      allOrders = data;
      renderTable(root);
    },
    (err) => {
      showErrorToast(err, "Error al cargar pedidos");
      root.querySelector("#ordersTable").innerHTML =
        '<div class="empty">No se pudieron cargar los pedidos.</div>';
    }
  );
  unsubProducts = listenProducts((data) => {
    products = data.filter((p) => p.available !== false);
  });
  unsubSettings = listenSettings((data) => {
    settings = data;
  });

  root.addEventListener(
    "click",
    async (e) => {
      const detailBtn = e.target.closest("[data-detail]");
      const editBtn = e.target.closest("[data-edit]");
      const delBtn = e.target.closest("[data-delete]");
      const printBtn = e.target.closest("[data-print]");
      const waBtn = e.target.closest("[data-wa]");
      if (detailBtn) {
        const order = allOrders.find((o) => o.id === detailBtn.dataset.detail);
        if (order) openDetail(order);
        return;
      }
      if (editBtn) {
        const order = allOrders.find((o) => o.id === editBtn.dataset.edit);
        if (order) openOrderForm(order);
        return;
      }
      if (waBtn) {
        const order = allOrders.find((o) => o.id === waBtn.dataset.wa);
        if (order) notifyCustomer(order, normalizeOrderStatus(order.status));
        return;
      }
      if (printBtn) {
        const order = allOrders.find((o) => o.id === printBtn.dataset.print);
        if (order) printOrderTicket(order);
        return;
      }
      if (delBtn) {
        if (!confirmDialog("¿Eliminar este pedido? No se puede deshacer.")) return;
        try {
          await deleteOrder(delBtn.dataset.delete);
          showToast("Pedido eliminado", "success");
        } catch (err) {
          showErrorToast(err, "No se pudo eliminar");
        }
      }
    },
    { signal }
  );

  root.addEventListener(
    "change",
    async (e) => {
      const sel = e.target.closest("[data-status-select]");
      if (!sel) return;
      const order = allOrders.find((o) => o.id === sel.dataset.statusSelect);
      try {
        await updateOrderStatus(sel.dataset.statusSelect, sel.value);
        showToast("Estado actualizado", "success");
        if (order && confirmDialog("¿Avisar al cliente por WhatsApp?")) {
          notifyCustomer({ ...order, status: sel.value }, sel.value);
        }
      } catch (err) {
        showErrorToast(err, "No se pudo actualizar");
      }
    },
    { signal }
  );
}

export function unmountOrders() {
  if (unsub) unsub();
  if (unsubProducts) unsubProducts();
  if (unsubSettings) unsubSettings();
  unsub = null;
  unsubProducts = null;
  unsubSettings = null;
  clickAbort?.abort();
  clickAbort = null;
  allOrders = [];
  products = [];
  const modal = document.getElementById("modalRoot");
  if (modal) {
    modal.hidden = true;
    modal.innerHTML = "";
  }
}

function notifyCustomer(order, status) {
  const msg =
    getStatusMessage(settings, status) ||
    `Actualización de tu pedido ${order.orderNumber || ""}: ${statusLabel(status)}`;
  const text = `Hola ${order.firstName || ""}!\n\n${msg}\n\nOrden: ${order.orderNumber || ""}\nTotal: ${formatMoney(order.total)}`;
  const url = buildCustomerWhatsAppUrl(settings, order.phone, text);
  if (!url) {
    showToast("El pedido no tiene teléfono válido", "error");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function filtered() {
  let list = allOrders.filter((o) => {
    const st = normalizeOrderStatus(o.status);
    if (filter !== "todos" && st !== filter) return false;
    if (search) {
      const hay = `${o.firstName || ""} ${o.lastName || ""} ${o.phone || ""} ${o.orderNumber || ""} ${o.email || ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    const d = o.createdAt?.toDate?.() || (o.date?.toDate ? o.date.toDate() : null);
    if (dateFrom || dateTo) {
      if (!d) return false;
      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`);
        if (d < from) return false;
      }
      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59`);
        if (d > to) return false;
      }
    }
    return true;
  });

  list = [...list].sort((a, b) => {
    if (sortKey === "total_desc") return Number(b.total || 0) - Number(a.total || 0);
    if (sortKey === "total_asc") return Number(a.total || 0) - Number(b.total || 0);
    const ta = a.createdAt?.toMillis?.() || a.date?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || b.date?.toMillis?.() || 0;
    return sortKey === "date_asc" ? ta - tb : tb - ta;
  });
  return list;
}

function renderTable(root) {
  const wrap = root.querySelector("#ordersTable");
  if (!wrap) return;
  const rows = filtered();
  if (!rows.length) {
    wrap.innerHTML = '<div class="empty">No hay pedidos con estos filtros.<br><button type="button" class="btn btn-primary" id="emptyNewOrder" style="margin-top:.8rem">Crear pedido</button></div>';
    wrap.querySelector("#emptyNewOrder")?.addEventListener("click", () => openOrderForm(null));
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Orden</th><th>Cliente</th><th>Teléfono</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((o) => {
            const name = `${o.firstName || ""} ${o.lastName || ""}`.trim();
            const st = normalizeOrderStatus(o.status);
            return `<tr>
              <td>${escapeHtml(o.orderNumber || o.id)}</td>
              <td>${escapeHtml(name)}</td>
              <td>${escapeHtml(o.phone || "")}</td>
              <td>${formatMoney(o.total)}</td>
              <td>
                <select data-status-select="${o.id}">
                  ${ORDER_STATUSES.map(
                    (s) =>
                      `<option value="${s}" ${st === s ? "selected" : ""}>${statusLabel(s)}</option>`
                  ).join("")}
                </select>
              </td>
              <td>${formatDate(o.createdAt || o.date)}</td>
              <td class="actions">
                <button type="button" class="btn btn-sm btn-ghost" data-detail="${o.id}">Ver</button>
                <button type="button" class="btn btn-sm btn-ghost" data-edit="${o.id}">Editar</button>
                <button type="button" class="btn btn-sm btn-ghost" data-wa="${o.id}" title="WhatsApp">WA</button>
                <button type="button" class="btn btn-sm btn-ghost" data-print="${o.id}">Imprimir</button>
                <button type="button" class="btn btn-sm btn-danger" data-delete="${o.id}">Eliminar</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function productOptions(selectedId = "") {
  if (!products.length) {
    return `<option value="">Sin productos disponibles</option>`;
  }
  return products
    .map((p) => {
      const price = productUnitPrice(p);
      return `<option value="${escapeHtml(p.id)}" data-price="${price}" data-name="${escapeHtml(p.name)}" ${
        selectedId === p.id ? "selected" : ""
      }>${escapeHtml(p.name)} · ${formatMoney(price)}</option>`;
    })
    .join("");
}

function openOrderForm(order) {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  const isEdit = Boolean(order?.id);
  const items = order?.items?.length
    ? order.items
    : order?.productId
      ? [
          {
            productId: order.productId,
            name: order.productName,
            quantity: order.quantity || 1,
            unitPrice: order.unitPrice || order.total,
          },
        ]
      : [{ productId: "", name: "", quantity: 1, unitPrice: 0 }];

  root.hidden = false;
  root.innerHTML = `
    <div class="modal-card modal-card--lg">
      <h3>${isEdit ? "Editar pedido" : "Crear pedido"}</h3>
      <form id="adminOrderForm" class="form-grid">
        <div class="field"><label>Nombre *</label><input name="firstName" required value="${escapeHtml(order?.firstName || "")}" /></div>
        <div class="field"><label>Apellido *</label><input name="lastName" required value="${escapeHtml(order?.lastName || "")}" /></div>
        <div class="field"><label>Teléfono *</label><input name="phone" required value="${escapeHtml(order?.phone || "")}" /></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(order?.email || "")}" /></div>
        <div class="field full"><label>Dirección</label><input name="address" value="${escapeHtml(order?.address || "")}" /></div>
        <div class="field full"><label>Observaciones</label><textarea name="notes" rows="2">${escapeHtml(order?.notes || "")}</textarea></div>
        <div class="field">
          <label>Método de pago</label>
          <select name="paymentMethod">
            ${["Mercado Pago", "Transferencia", "Tarjeta", "Efectivo"]
              .map(
                (p) =>
                  `<option value="${p}" ${
                    (order?.paymentMethod || "Efectivo") === p ? "selected" : ""
                  }>${p}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field">
          <label>Entrega</label>
          <select name="deliveryMethod">
            <option value="Retirar en el local" ${
              !String(order?.deliveryMethod || "").toLowerCase().includes("delivery") ? "selected" : ""
            }>Retiro en local</option>
            <option value="Delivery" ${
              String(order?.deliveryMethod || "").toLowerCase().includes("delivery") ? "selected" : ""
            }>Delivery</option>
          </select>
        </div>
        <div class="field"><label>Costo envío</label><input type="number" name="deliveryCost" min="0" value="${
          order?.deliveryCost ?? 0
        }" /></div>
        <div class="field">
          <label>Estado</label>
          <select name="status">
            ${ORDER_STATUSES.map(
              (s) =>
                `<option value="${s}" ${
                  normalizeOrderStatus(order?.status || "pendiente") === s ? "selected" : ""
                }>${statusLabel(s)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="field full">
          <label>Productos</label>
          <div id="orderItemsHost" class="order-items-editor"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="addOrderItem" style="margin-top:.5rem">+ Agregar producto</button>
        </div>
        <div class="field"><label>Descuento</label><input type="number" name="discount" min="0" value="${
          order?.discount ?? 0
        }" /></div>
        <div class="field"><label>Total estimado</label><strong id="adminOrderTotal">${formatMoney(
          order?.total || 0
        )}</strong></div>
        <div class="field full modal-actions" style="margin:0;border:0;padding:0">
          <button type="submit" class="btn btn-primary">${isEdit ? "Guardar cambios" : "Crear pedido"}</button>
          <button type="button" class="btn btn-ghost" id="closeOrderForm">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  const host = root.querySelector("#orderItemsHost");
  const renderItems = (list) => {
    host.innerHTML = list
      .map(
        (it, idx) => `
      <div class="order-item-row" data-idx="${idx}">
        <select data-product>${productOptions(it.productId)}</select>
        <input type="number" data-qty min="1" value="${it.quantity || 1}" aria-label="Cantidad" />
        <input type="number" data-price min="0" value="${it.unitPrice || 0}" aria-label="Precio" />
        <button type="button" class="btn btn-sm btn-danger" data-remove-item>×</button>
      </div>`
      )
      .join("");
  };
  renderItems(items);

  const recalc = () => {
    const rows = [...host.querySelectorAll(".order-item-row")];
    let subtotal = 0;
    rows.forEach((row) => {
      const qty = Number(row.querySelector("[data-qty]").value) || 1;
      const price = Number(row.querySelector("[data-price]").value) || 0;
      subtotal += qty * price;
    });
    const delivery = Number(root.querySelector('[name="deliveryCost"]').value) || 0;
    const discount = Number(root.querySelector('[name="discount"]').value) || 0;
    const total = Math.max(0, subtotal + delivery - discount);
    root.querySelector("#adminOrderTotal").textContent = formatMoney(total);
    return { subtotal, delivery, discount, total, rows };
  };

  host.addEventListener("change", (e) => {
    const row = e.target.closest(".order-item-row");
    if (!row) return;
    if (e.target.matches("[data-product]")) {
      const opt = e.target.selectedOptions[0];
      if (opt) {
        row.querySelector("[data-price]").value = opt.dataset.price || 0;
      }
    }
    recalc();
  });
  host.addEventListener("input", () => recalc());
  root.querySelector('[name="deliveryCost"]').addEventListener("input", recalc);
  root.querySelector('[name="discount"]').addEventListener("input", recalc);

  root.querySelector("#addOrderItem").onclick = () => {
    const row = document.createElement("div");
    row.className = "order-item-row";
    row.innerHTML = `
      <select data-product>${productOptions("")}</select>
      <input type="number" data-qty min="1" value="1" />
      <input type="number" data-price min="0" value="0" />
      <button type="button" class="btn btn-sm btn-danger" data-remove-item>×</button>`;
    host.appendChild(row);
    const opt = row.querySelector("[data-product]")?.selectedOptions?.[0];
    if (opt) row.querySelector("[data-price]").value = opt.dataset.price || 0;
    recalc();
  };

  host.addEventListener("click", (e) => {
    if (e.target.closest("[data-remove-item]")) {
      const rows = host.querySelectorAll(".order-item-row");
      if (rows.length <= 1) {
        showToast("El pedido necesita al menos un producto", "error");
        return;
      }
      e.target.closest(".order-item-row").remove();
      recalc();
    }
  });

  root.querySelector("#closeOrderForm").onclick = () => {
    root.hidden = true;
    root.innerHTML = "";
  };

  root.querySelector("#adminOrderForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const { subtotal, delivery, discount, total, rows } = recalc();
    const lineItems = rows
      .map((row) => {
        const sel = row.querySelector("[data-product]");
        const opt = sel?.selectedOptions?.[0];
        if (!opt?.value) return null;
        return {
          productId: opt.value,
          name: opt.dataset.name || opt.textContent.split(" · ")[0],
          quantity: Number(row.querySelector("[data-qty]").value) || 1,
          unitPrice: Number(row.querySelector("[data-price]").value) || 0,
        };
      })
      .filter(Boolean);

    if (!lineItems.length) {
      showToast("Agregá al menos un producto", "error");
      return;
    }

    const payload = {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      phone: normalizePhone(form.phone.value),
      email: form.email.value.trim().toLowerCase(),
      address: form.address.value.trim() || "Retiro en el local",
      notes: form.notes.value.trim(),
      observations: form.notes.value.trim(),
      paymentMethod: form.paymentMethod.value,
      deliveryMethod: form.deliveryMethod.value,
      deliveryCost: delivery,
      discount,
      subtotal,
      total,
      status: form.status.value,
      items: lineItems,
      productName: lineItems.map((i) => i.name).join(", "),
      productId: lineItems[0].productId,
      quantity: lineItems.reduce((s, i) => s + i.quantity, 0),
      unitPrice: lineItems[0].unitPrice,
      couponId: order?.couponId || null,
      couponCode: order?.couponCode || "",
      clientLat: order?.clientLat ?? null,
      clientLng: order?.clientLng ?? null,
      distanceKm: order?.distanceKm || 0,
    };

    if (!payload.firstName || !payload.lastName || !payload.phone) {
      showToast("Completá nombre, apellido y teléfono", "error");
      return;
    }

    try {
      if (isEdit) {
        await updateOrder(order.id, payload);
        showToast("Pedido actualizado", "success");
      } else {
        const result = await createOrderFromCheckout({ ...payload, status: "pendiente" });
        if (payload.status && payload.status !== "pendiente") {
          await updateOrderStatus(result.orderId, payload.status);
        }
        showToast("Pedido creado", "success");
      }
      root.hidden = true;
      root.innerHTML = "";
    } catch (err) {
      showErrorToast(err, "No se pudo guardar el pedido");
    }
  };

  recalc();
}

function openDetail(order) {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  const items = order.items || [];
  const st = normalizeOrderStatus(order.status);
  root.hidden = false;
  root.innerHTML = `
    <div class="modal-card modal-card--lg">
      <h3>Pedido ${escapeHtml(order.orderNumber || "")}</h3>
      <div class="form-grid">
        <div class="field"><label>Cliente</label><div>${escapeHtml(`${order.firstName || ""} ${order.lastName || ""}`)}</div></div>
        <div class="field"><label>Teléfono</label><div>${escapeHtml(order.phone || "")}</div></div>
        <div class="field"><label>Email</label><div>${escapeHtml(order.email || "—")}</div></div>
        <div class="field"><label>Estado</label><div><span class="badge badge-${st}">${statusLabel(st)}</span></div></div>
        <div class="field full"><label>Dirección</label><div>${escapeHtml(order.address || "Retiro en local")}</div></div>
        <div class="field full"><label>Observaciones</label><div>${escapeHtml(order.notes || "—")}</div></div>
        <div class="field"><label>Entrega</label><div>${escapeHtml(order.deliveryMethod || "—")}</div></div>
        <div class="field"><label>Pago</label><div>${escapeHtml(order.paymentMethod || "—")}</div></div>
        <div class="field"><label>Subtotal</label><div>${formatMoney(order.subtotal)}</div></div>
        <div class="field"><label>Envío</label><div>${formatMoney(order.deliveryCost || 0)}</div></div>
        <div class="field"><label>Cupón</label><div>${
          order.couponCode
            ? `${escapeHtml(order.couponCode)} (−${formatMoney(order.discount || 0)})`
            : order.discount
              ? `−${formatMoney(order.discount)}`
              : "—"
        }</div></div>
        <div class="field"><label>Total</label><div><strong>${formatMoney(order.total)}</strong></div></div>
        <div class="field"><label>Fecha</label><div>${formatDate(order.createdAt || order.date)}</div></div>
      </div>
      <h4 style="margin:1rem 0 .5rem">Productos</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Producto</th><th>Cant.</th><th>P. unit.</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${
              items
                .map(
                  (it) => `<tr>
                  <td>${escapeHtml(it.name)}</td>
                  <td>${it.quantity || 1}</td>
                  <td>${formatMoney(it.unitPrice)}</td>
                  <td>${formatMoney((it.unitPrice || 0) * (it.quantity || 1))}</td>
                </tr>`
                )
                .join("") || "<tr><td colspan='4'>Sin ítems</td></tr>"
            }
          </tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" id="printTicket">Imprimir</button>
        <button type="button" class="btn btn-ghost" id="waNotify">WhatsApp cliente</button>
        <button type="button" class="btn btn-ghost" id="editFromDetail">Editar</button>
        <button type="button" class="btn btn-ghost" id="closeModal">Cerrar</button>
      </div>
    </div>
  `;
  root.querySelector("#printTicket")?.addEventListener("click", () => printOrderTicket(order));
  root.querySelector("#waNotify")?.addEventListener("click", () => notifyCustomer(order, st));
  root.querySelector("#editFromDetail")?.addEventListener("click", () => openOrderForm(order));
  root.querySelector("#closeModal")?.addEventListener("click", () => {
    root.hidden = true;
    root.innerHTML = "";
  });
  root.addEventListener(
    "click",
    (e) => {
      if (e.target === root) {
        root.hidden = true;
        root.innerHTML = "";
      }
    },
    { once: true }
  );
}
