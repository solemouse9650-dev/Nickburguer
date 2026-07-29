import { deleteCustomer, listenCustomers, updateCustomer } from "../../services/customers.js";
import { listenOrdersByPhone } from "../../services/orders.js";
import { listenSettings } from "../../services/settings.js";
import {
  escapeHtml,
  formatDate,
  formatMoney,
  normalizeOrderStatus,
  statusLabel,
} from "../../utils/format.js";
import { confirmDialog, showToast } from "../../utils/toast.js";

let unsub = null;
let unsubSettings = null;
let customers = [];
let vipMinSpent = 50000;
let vipMinOrders = 5;
let recurrentMinOrders = 2;
let search = "";
let sortKey = "totalSpent";
let page = 1;
const pageSize = 10;
let profileUnsub = null;
let clickAbort = null;

export function mountCustomers(root) {
  unmountCustomers();
  search = "";
  sortKey = "totalSpent";
  page = 1;
  root.innerHTML = `
    <div class="stats-grid" id="customerMetrics"></div>
    <section class="panel">
      <div class="panel__head"><h2>Clientes</h2></div>
      <div class="table-tools">
        <input type="search" id="customerSearch" placeholder="Buscar por nombre o teléfono..." />
        <select id="customerSort">
          <option value="totalSpent" selected>Mayor gasto</option>
          <option value="totalOrders">Más pedidos</option>
          <option value="lastPurchaseAt">Última compra</option>
          <option value="registeredAt">Más recientes</option>
        </select>
      </div>
      <div class="table-wrap" id="customersTable"><div class="skeleton"></div></div>
      <div class="pagination" id="customerPager"></div>
    </section>
    <div id="customerProfile"></div>
  `;

  clickAbort = new AbortController();
  const { signal } = clickAbort;

  root.querySelector("#customerSearch").addEventListener(
    "input",
    (e) => {
      search = e.target.value.trim().toLowerCase();
      page = 1;
      renderTable(root);
    },
    { signal }
  );
  root.querySelector("#customerSort").addEventListener(
    "change",
    (e) => {
      sortKey = e.target.value;
      page = 1;
      renderTable(root);
    },
    { signal }
  );

  unsub = listenCustomers(
    (data) => {
      customers = data;
      paintMetrics(root);
      renderTable(root);
    },
    (err) => {
      showToast(err.message || "Error al cargar clientes", "error");
      const wrap = root.querySelector("#customersTable");
      if (wrap) wrap.innerHTML = '<div class="empty">No se pudieron cargar los clientes.</div>';
    }
  );
  unsubSettings = listenSettings((data) => {
    vipMinSpent = Number(data.customers?.vipMinSpent ?? 50000);
    vipMinOrders = Number(data.customers?.vipMinOrders ?? 5);
    recurrentMinOrders = Number(data.customers?.recurrentMinOrders ?? 2);
    paintMetrics(root);
    renderTable(root);
  });

  root.addEventListener(
    "click",
    (e) => {
      const open = e.target.closest("[data-profile]");
      const prev = e.target.closest("[data-prev]");
      const next = e.target.closest("[data-next]");
      if (prev) {
        page = Math.max(1, page - 1);
        renderTable(root);
      }
      if (next) {
        page += 1;
        renderTable(root);
      }
      if (open) {
        const customer = customers.find((c) => c.id === open.dataset.profile);
        if (customer) openProfile(root, customer);
      }
    },
    { signal }
  );
}

export function unmountCustomers() {
  if (unsub) unsub();
  unsub = null;
  if (unsubSettings) unsubSettings();
  unsubSettings = null;
  if (profileUnsub) profileUnsub();
  profileUnsub = null;
  clickAbort?.abort();
  clickAbort = null;
  customers = [];
  search = "";
  sortKey = "totalSpent";
  page = 1;
}

function paintMetrics(root) {
  const el = root.querySelector("#customerMetrics");
  if (!el) return;
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const neuvos = customers.filter((c) => (c.registeredAt?.toMillis?.() || 0) >= monthAgo).length;
  const recurrentes = customers.filter((c) => Number(c.totalOrders || 0) >= recurrentMinOrders).length;
  const vip = customers.filter(
    (c) => Number(c.totalSpent || 0) >= vipMinSpent || Number(c.totalOrders || 0) >= vipMinOrders
  ).length;
  el.innerHTML = `
    <article class="stat-card"><span>Registrados</span><strong>${customers.length}</strong></article>
    <article class="stat-card"><span>Nuevos (30 días)</span><strong>${neuvos}</strong></article>
    <article class="stat-card"><span>Recurrentes</span><strong>${recurrentes}</strong></article>
    <article class="stat-card"><span>VIP</span><strong>${vip}</strong></article>
  `;
}

function vipBadge(c) {
  if (Number(c.totalSpent || 0) >= vipMinSpent || Number(c.totalOrders || 0) >= vipMinOrders) {
    return '<span class="badge badge-vip">VIP</span>';
  }
  if (Number(c.totalOrders || 0) >= recurrentMinOrders) {
    return '<span class="badge badge-recurrente">Recurrente</span>';
  }
  return '<span class="badge badge-nuevo-cli">Nuevo</span>';
}

function sortedFiltered() {
  const list = customers.filter((c) => {
    if (!search) return true;
    const hay = `${c.firstName || ""} ${c.lastName || ""} ${c.phone || ""} ${c.email || ""}`.toLowerCase();
    return hay.includes(search);
  });
  list.sort((a, b) => {
    if (sortKey === "totalSpent" || sortKey === "totalOrders") {
      return Number(b[sortKey] || 0) - Number(a[sortKey] || 0);
    }
    return (b[sortKey]?.toMillis?.() || 0) - (a[sortKey]?.toMillis?.() || 0);
  });
  return list;
}

function renderTable(root) {
  const wrap = root.querySelector("#customersTable");
  const pager = root.querySelector("#customerPager");
  if (!wrap) return;
  const list = sortedFiltered();
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (page > totalPages) page = totalPages;
  const slice = list.slice((page - 1) * pageSize, page * pageSize);

  if (!slice.length) {
    wrap.innerHTML = '<div class="empty">No hay clientes.</div>';
    pager.innerHTML = "";
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Nombre</th><th>Teléfono</th><th>Pedidos</th><th>Total gastado</th><th>Última compra</th><th></th></tr>
      </thead>
      <tbody>
        ${slice
          .map((c) => {
            const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || "—";
            return `<tr>
              <td>${escapeHtml(name)} ${vipBadge(c)}</td>
              <td>${escapeHtml(c.phone || "")}</td>
              <td>${c.totalOrders || 0}</td>
              <td>${formatMoney(c.totalSpent || 0)}</td>
              <td>${formatDate(c.lastPurchaseAt)}</td>
              <td><button class="btn btn-sm btn-ghost" data-profile="${c.id}">Ver perfil</button></td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;

  pager.innerHTML = `
    <button class="btn btn-sm btn-ghost" data-prev ${page <= 1 ? "disabled" : ""}>Anterior</button>
    <span>Página ${page} / ${totalPages}</span>
    <button class="btn btn-sm btn-ghost" data-next ${page >= totalPages ? "disabled" : ""}>Siguiente</button>
  `;
}

function openProfile(root, customer) {
  if (profileUnsub) profileUnsub();
  const host = root.querySelector("#customerProfile");
  const name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
  const avg =
    customer.totalOrders > 0
      ? Number(customer.totalSpent || 0) / Number(customer.totalOrders)
      : 0;

  host.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>Perfil: ${escapeHtml(name || customer.phone)}</h2>
        <button type="button" class="btn btn-ghost" id="closeProfile">Cerrar</button>
      </div>
      <div class="stats-grid">
        <article class="stat-card"><span>Pedidos</span><strong>${customer.totalOrders || 0}</strong></article>
        <article class="stat-card"><span>Total gastado</span><strong>${formatMoney(customer.totalSpent || 0)}</strong></article>
        <article class="stat-card"><span>Ticket promedio</span><strong>${formatMoney(avg)}</strong></article>
        <article class="stat-card"><span>Última compra</span><strong style="font-size:1.1rem">${formatDate(customer.lastPurchaseAt)}</strong></article>
      </div>
      <div class="form-grid" style="margin-bottom:1rem" id="customerEditForm">
        <div class="field"><label>Nombre</label><input id="editFirst" value="${escapeHtml(customer.firstName || "")}" /></div>
        <div class="field"><label>Apellido</label><input id="editLast" value="${escapeHtml(customer.lastName || "")}" /></div>
        <div class="field"><label>Teléfono</label><div>${escapeHtml(customer.phone || "")}</div></div>
        <div class="field"><label>Email</label><input id="editEmail" type="email" value="${escapeHtml(customer.email || "")}" /></div>
        <div class="field full"><label>Dirección</label><input id="editAddress" value="${escapeHtml(customer.address || "")}" /></div>
        <div class="field"><label>Registro</label><div>${formatDate(customer.registeredAt)}</div></div>
        <div class="field">
          <label>Estado CRM (no bloquea pedidos)</label>
          <select id="customerStatus">
            <option value="Activo" ${customer.status === "Activo" ? "selected" : ""}>Activo</option>
            <option value="Inactivo" ${customer.status === "Inactivo" ? "selected" : ""}>Inactivo</option>
          </select>
        </div>
        <div class="field full"><button type="button" class="btn btn-primary" id="saveCustomer">Guardar cambios</button>
        <button type="button" class="btn btn-danger" id="deleteCustomer" style="margin-left:.5rem">Eliminar cliente</button></div>
      </div>
      <h3 style="margin:0 0 .8rem">Historial de pedidos</h3>
      <div class="table-wrap" id="customerOrders"><div class="skeleton"></div></div>
    </section>
  `;

  host.querySelector("#closeProfile").addEventListener("click", () => {
    if (profileUnsub) profileUnsub();
    profileUnsub = null;
    host.innerHTML = "";
  });

  host.querySelector("#saveCustomer")?.addEventListener("click", async () => {
    try {
      await updateCustomer(customer.id, {
        firstName: host.querySelector("#editFirst").value.trim(),
        lastName: host.querySelector("#editLast").value.trim(),
        email: host.querySelector("#editEmail").value.trim(),
        address: host.querySelector("#editAddress").value.trim(),
        status: host.querySelector("#customerStatus").value,
      });
      showToast("Cliente actualizado", "success");
    } catch (err) {
      showToast(err.message || "Error", "error");
    }
  });

  host.querySelector("#deleteCustomer")?.addEventListener("click", async () => {
    if (!confirmDialog("¿Eliminar este cliente? No se eliminan sus pedidos históricos.")) return;
    try {
      await deleteCustomer(customer.id);
      showToast("Cliente eliminado", "success");
      if (profileUnsub) profileUnsub();
      profileUnsub = null;
      host.innerHTML = "";
    } catch (err) {
      showToast(err.message || "No se pudo eliminar", "error");
    }
  });

  host.querySelector("#customerStatus").addEventListener("change", async (e) => {
    try {
      await updateCustomer(customer.id, { status: e.target.value });
      showToast("Estado actualizado", "success");
    } catch (err) {
      showToast(err.message || "Error", "error");
    }
  });

  profileUnsub = listenOrdersByPhone(
    customer.phone,
    (orders) => {
      const box = host.querySelector("#customerOrders");
      if (!box) return;
      if (!orders.length) {
        box.innerHTML = '<div class="empty">Sin pedidos asociados.</div>';
        return;
      }
      box.innerHTML = `
      <table>
        <thead><tr><th>Fecha</th><th>Orden</th><th>Productos</th><th>Estado</th><th>Total</th></tr></thead>
        <tbody>
          ${orders
            .map((o) => {
              const products = (o.items || []).map((i) => i.name).join(", ") || o.productName || "—";
              return `<tr>
                <td>${formatDate(o.createdAt || o.date)}</td>
                <td>${escapeHtml(o.orderNumber || "")}</td>
                <td>${escapeHtml(products)}</td>
                <td><span class="badge badge-${normalizeOrderStatus(o.status)}">${statusLabel(o.status)}</span></td>
                <td>${formatMoney(o.total)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
    },
    (err) => {
      const box = host.querySelector("#customerOrders");
      if (box) box.innerHTML = '<div class="empty">No se pudo cargar el historial.</div>';
      showToast(err.message || "Error al cargar historial", "error");
    }
  );
}
