import { listenOrders } from "../../services/orders.js";
import { listenProducts } from "../../services/products.js";
import { listenPromotions } from "../../services/promotions.js";
import { buildNotifications } from "../../services/notifications.js";
import { escapeHtml, formatDate } from "../../utils/format.js";
import { showToast } from "../../utils/toast.js";

let unsubs = [];

export function mountNotifications(root) {
  unmountNotifications();
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head"><h2>Centro de notificaciones</h2></div>
      <p class="muted" style="margin-top:0">Alertas en vivo: pedidos nuevos, stock agotado y promociones vencidas.</p>
      <div id="notifList"><div class="skeleton"></div></div>
    </section>
  `;

  let orders = [];
  let products = [];
  let promotions = [];

  const paint = () => {
    const list = root.querySelector("#notifList");
    if (!list) return;
    const alerts = buildNotifications({ orders, products, promotions });
    if (!alerts.length) {
      list.innerHTML = '<div class="empty">Sin alertas por ahora. El panel está al día.</div>';
      return;
    }
    list.innerHTML = `<div class="notif-list">${alerts
      .map(
        (a) => `<a class="notif-item notif-item--${a.level}" href="${a.href || "#/dashboard"}">
          <div>
            <strong>${escapeHtml(a.title)}</strong>
            <p>${escapeHtml(a.message)}</p>
          </div>
          <time>${formatDate(a.at)}</time>
        </a>`
      )
      .join("")}</div>`;
  };

  unsubs.push(listenOrders((d) => { orders = d; paint(); }, (e) => showToast(e.message, "error")));
  unsubs.push(listenProducts((d) => { products = d; paint(); }));
  unsubs.push(listenPromotions((d) => { promotions = d; paint(); }));
}

export function unmountNotifications() {
  unsubs.forEach((u) => u && u());
  unsubs = [];
}
