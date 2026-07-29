import { listenOrders } from "../../services/orders.js";
import { listenProducts } from "../../services/products.js";
import { listenCustomers } from "../../services/customers.js";
import { listenSettings } from "../../services/settings.js";
import {
  avgTicket,
  categorySalesMap,
  drawLineChart,
  exportCsv,
  filterOrdersByRange,
  groupSalesByDay,
  groupSalesByMonth,
  groupSalesByWeek,
  printOrdersReport,
  productSalesMap,
  startOfDay,
  endOfDay,
  startOfWeek,
  sumRevenue,
} from "../../utils/analytics.js";
import {
  endOfMonth,
  escapeHtml,
  formatDate,
  formatMoney,
  startOfMonth,
  statusLabel,
  normalizeOrderStatus,
} from "../../utils/format.js";
import { showToast } from "../../utils/toast.js";

let unsubs = [];
let orders = [];
let products = [];
let customers = [];
let range = "month";
let recurrentMinOrders = 2;

export function mountReports(root) {
  unmountReports();
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>Reportes</h2>
        <div class="actions">
          <select id="reportRange">
            <option value="today">Hoy</option>
            <option value="week">Semana</option>
            <option value="month" selected>Mes</option>
            <option value="year">Año</option>
            <option value="all">Todo</option>
          </select>
          <button type="button" class="btn btn-ghost btn-sm" id="exportCsv">Exportar Excel (.csv)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="exportProductsCsv">Exportar productos</button>
          <button type="button" class="btn btn-primary btn-sm" id="exportPdf">Imprimir / PDF</button>
        </div>
      </div>
      <div class="stats-grid" id="reportStats"></div>
    </section>
    <div class="grid-2">
      <section class="panel">
        <div class="panel__head"><h2>Ventas del período</h2></div>
        <div class="chart-box"><canvas id="reportChart"></canvas></div>
      </section>
      <section class="panel">
        <div class="panel__head"><h2>Productos vendidos</h2></div>
        <div id="reportProducts"></div>
      </section>
    </div>
    <section class="panel">
      <div class="panel__head"><h2>Detalle de pedidos</h2></div>
      <div class="table-wrap" id="reportTable"><div class="skeleton"></div></div>
    </section>
    <section class="panel">
      <div class="panel__head"><h2>Clientes recurrentes</h2></div>
      <div id="reportRecurring"></div>
    </section>
  `;

  root.querySelector("#reportRange").addEventListener("change", (e) => {
    range = e.target.value;
    paint(root);
  });
  root.querySelector("#exportCsv").addEventListener("click", () => {
    const subset = currentSubset();
    exportCsv(
      `burger-nick-pedidos-${range}.csv`,
      subset,
      [
        { label: "Orden", value: (o) => o.orderNumber },
        { label: "Cliente", value: (o) => `${o.firstName || ""} ${o.lastName || ""}`.trim() },
        { label: "Teléfono", value: (o) => o.phone },
        { label: "Estado", value: (o) => statusLabel(normalizeOrderStatus(o.status)) },
        { label: "Total", value: (o) => o.total },
        { label: "Fecha", value: (o) => formatDate(o.createdAt || o.date) },
      ]
    );
    showToast("Archivo CSV descargado (compatible con Excel)", "success");
  });
  root.querySelector("#exportProductsCsv").addEventListener("click", () => {
    const subset = currentSubset();
    const tops = productSalesMap(subset);
    exportCsv(`burger-nick-productos-${range}.csv`, tops, [
      { label: "Producto", value: (p) => p.name },
      { label: "Cantidad", value: (p) => p.qty },
      { label: "Ingresos", value: (p) => p.revenue },
    ]);
    showToast("Productos exportados", "success");
  });
  root.querySelector("#exportPdf").addEventListener("click", () => {
    printOrdersReport(`Reporte Burger Nick · ${rangeLabel()}`, currentSubset());
  });

  unsubs.push(
    listenOrders(
      (d) => {
        orders = d;
        paint(root);
      },
      (e) => {
        showToast(e.message, "error");
        const wrap = root.querySelector("#reportTable");
        if (wrap) wrap.innerHTML = '<div class="empty">No se pudieron cargar los reportes.</div>';
      }
    )
  );
  unsubs.push(listenProducts((d) => { products = d; paint(root); }));
  unsubs.push(listenCustomers((d) => { customers = d; paint(root); }));
  unsubs.push(
    listenSettings((settings) => {
      recurrentMinOrders = Math.max(1, Number(settings.customers?.recurrentMinOrders || 2));
      paint(root);
    })
  );
}

export function unmountReports() {
  unsubs.forEach((u) => u && u());
  unsubs = [];
  orders = [];
  products = [];
  customers = [];
  recurrentMinOrders = 2;
}

function rangeBounds() {
  const now = new Date();
  if (range === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (range === "week") return { from: startOfWeek(now), to: endOfDay(now) };
  if (range === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
  if (range === "year") {
    return {
      from: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return { from: new Date(2000, 0, 1), to: endOfDay(now) };
}

function currentSubset() {
  const { from, to } = rangeBounds();
  return filterOrdersByRange(orders, from, to);
}

function rangeLabel() {
  return (
    {
      today: "Hoy",
      week: "Semana",
      month: "Mes",
      year: "Año",
      all: "Histórico",
    }[range] || range
  );
}

function paint(root) {
  const subset = currentSubset();
  const stats = root.querySelector("#reportStats");
  if (stats) {
    stats.innerHTML = `
      <article class="stat-card"><span>Pedidos</span><strong>${subset.length}</strong></article>
      <article class="stat-card"><span>Ingresos</span><strong>${formatMoney(sumRevenue(subset))}</strong></article>
      <article class="stat-card"><span>Ticket promedio</span><strong>${formatMoney(avgTicket(subset))}</strong></article>
      <article class="stat-card"><span>Clientes en período</span><strong>${new Set(subset.map((o) => o.phone)).size}</strong></article>
    `;
  }

  const series =
    range === "year" || range === "all"
      ? groupSalesByMonth(subset, range === "all" ? 24 : 12)
      : range === "week"
        ? groupSalesByWeek(subset, 8)
        : range === "today"
          ? groupSalesByDay(subset, 1)
          : groupSalesByDay(subset, 30);
  drawLineChart(root.querySelector("#reportChart"), series);

  const tops = productSalesMap(subset).slice(0, 10);
  const box = root.querySelector("#reportProducts");
  if (box) {
    const cats = categorySalesMap(subset, products).slice(0, 5);
    box.innerHTML = tops.length
      ? `<div class="list-compact">${tops
          .map(
            (p) =>
              `<article><span>${escapeHtml(p.name)}</span><strong>${p.qty} u · ${formatMoney(p.revenue)}</strong></article>`
          )
          .join("")}</div>
        ${
          cats.length
            ? `<h4 style="margin:1rem 0 .5rem">Categorías</h4><div class="list-compact">${cats
                .map(
                  (c) =>
                    `<article><span>${escapeHtml(c.category)}</span><strong>${formatMoney(c.revenue)}</strong></article>`
                )
                .join("")}</div>`
            : ""
        }`
      : '<div class="empty">Sin productos vendidos en el período.</div>';
  }

  const table = root.querySelector("#reportTable");
  if (table) {
    table.innerHTML = subset.length
      ? `<table><thead><tr><th>Orden</th><th>Cliente</th><th>Estado</th><th>Total</th><th>Fecha</th></tr></thead><tbody>
        ${subset
          .slice(0, 100)
          .map(
            (o) => `<tr>
            <td>${escapeHtml(o.orderNumber || "")}</td>
            <td>${escapeHtml(`${o.firstName || ""} ${o.lastName || ""}`.trim())}</td>
            <td>${statusLabel(normalizeOrderStatus(o.status))}</td>
            <td>${formatMoney(o.total)}</td>
            <td>${formatDate(o.createdAt || o.date)}</td>
          </tr>`
          )
          .join("")}
      </tbody></table>`
      : '<div class="empty">Sin pedidos en el período.</div>';
  }

  const recurring = [...customers]
    .filter((c) => Number(c.totalOrders || 0) >= recurrentMinOrders)
    .sort((a, b) => Number(b.totalOrders || 0) - Number(a.totalOrders || 0))
    .slice(0, 15);
  const rec = root.querySelector("#reportRecurring");
  if (rec) {
    rec.innerHTML = recurring.length
      ? `<div class="list-compact">${recurring
          .map(
            (c) =>
              `<article><span>${escapeHtml(`${c.firstName || ""} ${c.lastName || ""}`.trim() || c.phone)}</span><strong>${c.totalOrders} pedidos · ${formatMoney(c.totalSpent)}</strong></article>`
          )
          .join("")}</div>`
      : '<div class="empty">Todavía no hay clientes recurrentes.</div>';
  }
}
