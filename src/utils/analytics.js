import {
  formatDate,
  formatMoney,
  normalizeOrderStatus,
  productUnitPrice,
  statusLabel,
} from "../utils/format.js";

export function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lunes
  d.setDate(d.getDate() + diff);
  return d;
}

export function isPaidOrder(o) {
  return normalizeOrderStatus(o.status) === "entregado";
}

export function filterOrdersByRange(orders, from, to) {
  return orders.filter((o) => {
    const d = toDate(o.createdAt || o.date);
    if (!d) return false;
    return d >= from && d <= to;
  });
}

export function sumRevenue(orders) {
  return orders.filter(isPaidOrder).reduce((s, o) => s + Number(o.total || 0), 0);
}

export function avgTicket(orders) {
  const paid = orders.filter(isPaidOrder);
  if (!paid.length) return 0;
  return sumRevenue(paid) / paid.length;
}

export function productSalesMap(orders) {
  const map = new Map();
  orders.filter(isPaidOrder).forEach((o) => {
    const items = o.items?.length
      ? o.items
      : o.productName
        ? [{ name: o.productName, quantity: o.quantity || 1, unitPrice: o.unitPrice || o.total }]
        : [];
    items.forEach((it) => {
      const key = it.productId || it.name || "—";
      const prev = map.get(key) || { name: it.name || key, qty: 0, revenue: 0, category: it.category || "" };
      const qty = Number(it.quantity || 1);
      prev.qty += qty;
      prev.revenue += qty * Number(it.unitPrice || 0);
      map.set(key, prev);
    });
  });
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

export function categorySalesMap(orders, products = []) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const map = new Map();
  orders.filter(isPaidOrder).forEach((o) => {
    const items = o.items || [];
    items.forEach((it) => {
      const prod = byId[it.productId];
      const cat = it.category || prod?.category || "otros";
      const prev = map.get(cat) || { category: cat, qty: 0, revenue: 0 };
      const qty = Number(it.quantity || 1);
      prev.qty += qty;
      prev.revenue += qty * Number(it.unitPrice || productUnitPrice(prod) || 0);
      map.set(cat, prev);
    });
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export function groupSalesByDay(orders, days = 30) {
  const result = [];
  const today = startOfDay();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const from = startOfDay(day);
    const to = endOfDay(day);
    const subset = filterOrdersByRange(orders, from, to);
    result.push({
      label: `${day.getDate()}/${day.getMonth() + 1}`,
      count: subset.length,
      revenue: sumRevenue(subset),
      date: from,
    });
  }
  return result;
}

export function groupSalesByMonth(orders, months = 12) {
  const result = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const subset = filterOrdersByRange(orders, from, to);
    result.push({
      label: `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`,
      count: subset.length,
      revenue: sumRevenue(subset),
      date: from,
    });
  }
  return result;
}

export function groupSalesByWeek(orders, weeks = 8) {
  const result = [];
  const thisWeek = startOfWeek();
  for (let i = weeks - 1; i >= 0; i--) {
    const from = new Date(thisWeek);
    from.setDate(thisWeek.getDate() - i * 7);
    const to = endOfDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6));
    const subset = filterOrdersByRange(orders, from, to);
    result.push({
      label: `${from.getDate()}/${from.getMonth() + 1}`,
      count: subset.length,
      revenue: sumRevenue(subset),
      date: from,
    });
  }
  return result;
}

/** Canvas bar chart with axis labels (admin dashboards/reports). */
export function drawBarChart(canvas, series, key = "revenue") {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement?.clientWidth || 400;
  const height = canvas.parentElement?.clientHeight || 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const values = series.map((s) => Number(s[key] || 0));
  const max = Math.max(1, ...values);
  const padL = 12;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const barW = Math.max(2, chartW / Math.max(1, series.length) - 3);

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, height - padB);
  ctx.lineTo(width - padR, height - padB);
  ctx.stroke();

  series.forEach((s, i) => {
    const v = Number(s[key] || 0);
    const h = (v / max) * chartH;
    const x = padL + (chartW * i) / series.length + 1;
    const y = height - padB - h;
    const grad = ctx.createLinearGradient(0, y, 0, height - padB);
    grad.addColorStop(0, "#f1b82d");
    grad.addColorStop(1, "#74acdf");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, Math.max(h, v > 0 ? 2 : 0));
  });

  ctx.fillStyle = "rgba(154,168,184,0.9)";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.ceil(series.length / 8));
  series.forEach((s, i) => {
    if (i % step !== 0 && i !== series.length - 1) return;
    const x = padL + (chartW * i) / series.length + barW / 2;
    ctx.fillText(String(s.label || ""), x, height - 8);
  });
}

export function drawLineChart(canvas, series, key = "revenue") {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement?.clientWidth || 400;
  const height = canvas.parentElement?.clientHeight || 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const values = series.map((s) => Number(s[key] || 0));
  const max = Math.max(1, ...values);
  const padL = 12;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, height - padB);
  ctx.lineTo(width - padR, height - padB);
  ctx.stroke();

  ctx.strokeStyle = "#f1b82d";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  series.forEach((s, i) => {
    const x = padL + (chartW * i) / Math.max(1, series.length - 1);
    const y = height - padB - (Number(s[key] || 0) / max) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(154,168,184,0.9)";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.ceil(series.length / 8));
  series.forEach((s, i) => {
    if (i % step !== 0 && i !== series.length - 1) return;
    const x = padL + (chartW * i) / Math.max(1, series.length - 1);
    ctx.fillText(String(s.label || ""), x, height - 8);
  });
}

export function exportCsv(filename, rows, headers) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    headers.map((h) => escape(h.label)).join(","),
    ...rows.map((row) => headers.map((h) => escape(h.value(row))).join(",")),
  ];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printOrdersReport(title, orders) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!win) return;
  const rows = orders
    .map(
      (o) => `<tr>
      <td>${o.orderNumber || ""}</td>
      <td>${`${o.firstName || ""} ${o.lastName || ""}`.trim()}</td>
      <td>${o.phone || ""}</td>
      <td>${statusLabel(o.status)}</td>
      <td>${formatMoney(o.total)}</td>
      <td>${formatDate(o.createdAt || o.date)}</td>
    </tr>`
    )
    .join("");
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:20px} table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}
      th{background:#f5f5f5}
    </style></head><body>
    <h1>${title}</h1>
    <p>Generado: ${new Date().toLocaleString("es-AR")}</p>
    <table><thead><tr><th>Orden</th><th>Cliente</th><th>Tel</th><th>Estado</th><th>Total</th><th>Fecha</th></tr></thead>
    <tbody>${rows || "<tr><td colspan='6'>Sin datos</td></tr>"}</tbody></table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`);
  win.document.close();
}

export function printOrderTicket(order) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=420,height=700");
  if (!win) return;
  const items = (order.items || [])
    .map(
      (it) =>
        `<tr><td>${it.name}</td><td>${it.quantity || 1}</td><td>${formatMoney(it.unitPrice)}</td></tr>`
    )
    .join("");
  win.document.write(`<!DOCTYPE html><html><head><title>${order.orderNumber}</title>
    <style>
      body{font-family:monospace;padding:16px;max-width:360px;margin:0 auto;color:#000}
      h1{font-size:16px;margin:0 0 8px} .muted{color:#444;font-size:12px}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      td{padding:4px 0;font-size:12px;border-bottom:1px dashed #ccc}
      .total{font-size:16px;font-weight:700;margin-top:12px}
    </style></head><body>
    <h1>BURGER NICK</h1>
    <div class="muted">${order.orderNumber || ""}</div>
    <div class="muted">${formatDate(order.createdAt || order.date)}</div>
    <p><strong>${`${order.firstName || ""} ${order.lastName || ""}`.trim()}</strong><br>
    ${order.phone || ""}<br>${order.address || "Retiro en local"}</p>
    <p class="muted">Pago: ${order.paymentMethod || "—"} · ${order.deliveryMethod || "—"}</p>
    <table>${items || "<tr><td colspan='3'>Sin ítems</td></tr>"}</table>
    ${order.notes ? `<p><strong>Obs:</strong> ${order.notes}</p>` : ""}
    <div class="total">TOTAL ${formatMoney(order.total)}</div>
    <script>window.onload=()=>window.print()</script>
    </body></html>`);
  win.document.close();
}
