import { listenCustomers } from "../../services/customers.js";
import { listenOrders } from "../../services/orders.js";
import { listenProducts } from "../../services/products.js";
import { listenPromotions } from "../../services/promotions.js";
import { runSeedClient } from "../../seed/runSeedClient.js";
import {
  avgTicket,
  categorySalesMap,
  drawBarChart,
  filterOrdersByRange,
  groupSalesByDay,
  groupSalesByMonth,
  groupSalesByWeek,
  productSalesMap,
  startOfDay,
  startOfWeek,
  sumRevenue,
  endOfDay,
} from "../../utils/analytics.js";
import {
  endOfMonth,
  escapeHtml,
  formatDate,
  formatMoney,
  normalizeOrderStatus,
  startOfMonth,
  statusLabel,
} from "../../utils/format.js";
import { showToast } from "../../utils/toast.js";

let unsubs = [];
let loadError = false;

export function mountDashboard(root) {
  cleanup();
  loadError = false;
  root.innerHTML = `
    <div class="panel" id="permBanner" hidden>
      <div class="panel__head"><h2>Sin permisos de lectura</h2></div>
      <p class="muted">Publicá firestore.rules e índices en Firebase y recargá.</p>
    </div>
    <div class="panel" id="seedBanner">
      <div class="panel__head">
        <h2>Datos de demostración</h2>
        <button type="button" class="btn btn-primary" id="runSeedBtn">Cargar datos demo</button>
      </div>
      <p class="muted">
        Carga un catálogo completo ficticio: productos, categorías, promociones, cupones, clientes,
        pedidos activos/históricos y datos de pago (alias / CBU) para mostrar la web y el panel.
      </p>
    </div>

    <div class="stats-grid stats-grid--dense" id="dashStats">
      ${Array.from({ length: 12 }).map(() => '<div class="skeleton"></div>').join("")}
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel__head"><h2>Ventas por día (30 días)</h2></div>
        <div class="chart-box"><canvas id="chartDay" aria-label="Gráfico ventas diarias"></canvas></div>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Ventas por semana (8 semanas)</h2></div>
        <div class="chart-box"><canvas id="chartWeek" aria-label="Gráfico ventas semanales"></canvas></div>
      </section>
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel__head"><h2>Ventas por mes (12 meses)</h2></div>
        <div class="chart-box"><canvas id="chartMonth" aria-label="Gráfico ventas mensuales"></canvas></div>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Productos más vendidos</h2></div>
        <div id="topProducts"><div class="skeleton"></div></div>
      </section>
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel__head"><h2>Categorías más vendidas</h2></div>
        <div id="topCategories"><div class="skeleton"></div></div>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Clientes destacados</h2></div>
        <div id="topClients"><div class="skeleton"></div></div>
      </section>
    </div>

    <section class="panel">
      <div class="panel__head"><h2>Últimos pedidos</h2></div>
      <div class="table-wrap" id="latestOrders"><div class="skeleton"></div></div>
    </section>
  `;

  let orders = [];
  let products = [];
  let promotions = [];
  let customers = [];
  let gotProducts = false;
  let gotPromos = false;

  const onPermError = (err) => {
    loadError = true;
    root.querySelector("#permBanner").hidden = false;
    root.querySelector("#seedBanner").hidden = true;
    showToast(err?.message || "Error de permisos", "error");
  };

  const render = () => {
    if (loadError) return;
    paint(root, { orders, products, promotions, customers, gotProducts, gotPromos });
  };

  unsubs.push(listenOrders((d) => { orders = d; render(); }, onPermError));
  unsubs.push(listenProducts((d) => { products = d; gotProducts = true; render(); }, onPermError));
  unsubs.push(listenPromotions((d) => { promotions = d; gotPromos = true; render(); }, onPermError));
  unsubs.push(listenCustomers((d) => { customers = d; render(); }, onPermError));

  root.querySelector("#runSeedBtn")?.addEventListener("click", async () => {
    const btn = root.querySelector("#runSeedBtn");
    btn.disabled = true;
    btn.textContent = "Cargando demo...";
    try {
      const result = await runSeedClient();
      showToast(
        `Demo lista: ${result.products} productos · ${result.orders} pedidos · ${result.customers} clientes`,
        "success"
      );
    } catch (err) {
      showToast(err.message || "No se pudo cargar la demo", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Cargar datos demo";
    }
  });
}

export function unmountDashboard() {
  cleanup();
}

function cleanup() {
  unsubs.forEach((u) => u && u());
  unsubs = [];
  loadError = false;
}

function paint(root, { orders, products, promotions, customers, gotProducts, gotPromos }) {
  const todayFrom = startOfDay();
  const todayTo = endOfDay();
  const weekFrom = startOfWeek();
  const monthFrom = startOfMonth();
  const monthTo = endOfMonth();

  const todayOrders = filterOrdersByRange(orders, todayFrom, todayTo);
  const weekOrders = filterOrdersByRange(orders, weekFrom, todayTo);
  const monthOrders = filterOrdersByRange(orders, monthFrom, monthTo);

  const active = orders.filter((o) =>
    ["pendiente", "nuevo", "confirmado", "en_preparacion", "listo", "en_camino"].includes(
      normalizeOrderStatus(o.status)
    )
  ).length;
  const completed = orders.filter((o) => normalizeOrderStatus(o.status) === "entregado").length;
  const cancelled = orders.filter((o) => normalizeOrderStatus(o.status) === "cancelado").length;
  const topProduct = productSalesMap(monthOrders)[0];

  const banner = root.querySelector("#seedBanner");
  if (banner) banner.hidden = false;

  const stats = root.querySelector("#dashStats");
  if (stats) {
    stats.innerHTML = `
      <article class="stat-card"><span>Ventas hoy</span><strong>${formatMoney(sumRevenue(todayOrders))}</strong></article>
      <article class="stat-card"><span>Ventas semana</span><strong>${formatMoney(sumRevenue(weekOrders))}</strong></article>
      <article class="stat-card"><span>Ventas mes</span><strong>${formatMoney(sumRevenue(monthOrders))}</strong></article>
      <article class="stat-card"><span>Ventas totales</span><strong>${formatMoney(sumRevenue(orders))}</strong></article>
      <article class="stat-card warn"><span>Pedidos activos</span><strong>${active}</strong></article>
      <article class="stat-card ok"><span>Completados</span><strong>${completed}</strong></article>
      <article class="stat-card danger"><span>Cancelados</span><strong>${cancelled}</strong></article>
      <article class="stat-card"><span>Clientes</span><strong>${customers.length}</strong></article>
      <article class="stat-card"><span>Ticket promedio</span><strong>${formatMoney(avgTicket(monthOrders))}</strong></article>
      <article class="stat-card"><span>Pedidos hoy</span><strong>${todayOrders.length}</strong></article>
      <article class="stat-card"><span>Productos</span><strong>${products.length}</strong></article>
      <article class="stat-card"><span>Más vendido (mes)</span><strong class="stat-card__text">${escapeHtml(topProduct?.name || "—")}</strong></article>
    `;
  }

  drawBarChart(root.querySelector("#chartDay"), groupSalesByDay(orders, 30), "revenue");
  drawBarChart(root.querySelector("#chartWeek"), groupSalesByWeek(orders, 8), "revenue");
  drawBarChart(root.querySelector("#chartMonth"), groupSalesByMonth(orders, 12), "revenue");

  const tops = productSalesMap(monthOrders).slice(0, 8);
  const topProducts = root.querySelector("#topProducts");
  if (topProducts) {
    topProducts.innerHTML = tops.length
      ? `<div class="list-compact">${tops
          .map(
            (p) => `<article><span>${escapeHtml(p.name)}</span><strong>${p.qty} · ${formatMoney(p.revenue)}</strong></article>`
          )
          .join("")}</div>`
      : '<div class="empty">Sin ventas este mes.</div>';
  }

  const cats = categorySalesMap(monthOrders, products).slice(0, 8);
  const topCategories = root.querySelector("#topCategories");
  if (topCategories) {
    topCategories.innerHTML = cats.length
      ? `<div class="list-compact">${cats
          .map(
            (c) => `<article><span>${escapeHtml(c.category)}</span><strong>${formatMoney(c.revenue)}</strong></article>`
          )
          .join("")}</div>`
      : '<div class="empty">Sin datos de categorías.</div>';
  }

  const latest = root.querySelector("#latestOrders");
  if (latest) {
    const rows = orders.slice(0, 10);
    latest.innerHTML = rows.length
      ? `<table><thead><tr><th>Orden</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
        ${rows
          .map((o) => {
            const st = normalizeOrderStatus(o.status);
            return `<tr>
            <td>${escapeHtml(o.orderNumber || "")}</td>
            <td>${escapeHtml(`${o.firstName || ""} ${o.lastName || ""}`.trim())}</td>
            <td>${formatMoney(o.total)}</td>
            <td><span class="badge badge-${st}">${statusLabel(st)}</span></td>
            <td>${formatDate(o.createdAt || o.date)}</td>
          </tr>`;
          })
          .join("")}
      </tbody></table>`
      : '<div class="empty">Todavía no hay pedidos.</div>';
  }

  const topClients = root.querySelector("#topClients");
  if (topClients) {
    const vip = [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 6);
    topClients.innerHTML = vip.length
      ? `<div class="list-compact">${vip
          .map(
            (c) =>
              `<article><span>${escapeHtml(`${c.firstName || ""} ${c.lastName || ""}`.trim() || c.phone)}</span><strong>${formatMoney(c.totalSpent)} · ${c.totalOrders || 0} ped.</strong></article>`
          )
          .join("")}</div>`
      : '<div class="empty">Sin clientes aún.</div>';
  }
}
