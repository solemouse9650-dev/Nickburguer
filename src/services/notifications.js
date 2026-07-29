/**
 * Genera alertas operativas reales a partir de pedidos, productos y promociones.
 */
export function buildNotifications({ orders = [], products = [], promotions = [] }) {
  const now = Date.now();
  const alerts = [];

  orders
    .filter((o) => normalizeStatus(o.status) === "pendiente")
    .slice(0, 25)
    .forEach((o) => {
      alerts.push({
        id: `order-new-${o.id}`,
        type: "order",
        level: "info",
        title: "Nuevo pedido",
        message: `${o.orderNumber || o.id} · ${o.firstName || ""} ${o.lastName || ""} · $${Math.round(o.total || 0)}`,
        at: o.createdAt?.toMillis?.() || now,
        href: "#/pedidos",
      });
    });

  orders
    .filter((o) => normalizeStatus(o.status) === "cancelado")
    .slice(0, 15)
    .forEach((o) => {
      alerts.push({
        id: `order-cancel-${o.id}`,
        type: "order",
        level: "warn",
        title: "Pedido cancelado",
        message: `${o.orderNumber || o.id} · ${o.firstName || ""} ${o.lastName || ""}`,
        at: o.updatedAt?.toMillis?.() || o.createdAt?.toMillis?.() || now,
        href: "#/pedidos",
      });
    });

  orders
    .filter((o) =>
      ["confirmado", "en_preparacion", "listo", "en_camino"].includes(normalizeStatus(o.status))
    )
    .slice(0, 15)
    .forEach((o) => {
      const st = normalizeStatus(o.status);
      alerts.push({
        id: `order-active-${o.id}`,
        type: "order",
        level: "info",
        title: `Pedido ${labelStatus(st)}`,
        message: `${o.orderNumber || o.id} · ${o.firstName || ""} ${o.lastName || ""}`,
        at: o.updatedAt?.toMillis?.() || o.createdAt?.toMillis?.() || now,
        href: "#/pedidos",
      });
    });

  products
    .filter((p) => p.available === false || p.soldOut === true)
    .forEach((p) => {
      alerts.push({
        id: `stock-${p.id}`,
        type: "stock",
        level: "warn",
        title: "Producto agotado",
        message: p.name || "Producto sin stock",
        at: p.updatedAt?.toMillis?.() || now,
        href: "#/productos",
      });
    });

  promotions.forEach((p) => {
    const end = p.endDate?.toDate
      ? p.endDate.toDate().getTime()
      : p.endDate
        ? new Date(p.endDate).getTime()
        : null;
    if (end && end < now && p.active) {
      alerts.push({
        id: `promo-${p.id}`,
        type: "promo",
        level: "warn",
        title: "Promoción vencida",
        message: `${p.title || "Promoción"} sigue marcada como activa`,
        at: end,
        href: "#/promociones",
      });
    }
  });

  return alerts.sort((a, b) => b.at - a.at).slice(0, 60);
}

function normalizeStatus(s) {
  return s === "nuevo" ? "pendiente" : s || "pendiente";
}

function labelStatus(s) {
  return (
    {
      confirmado: "confirmado",
      en_preparacion: "en preparación",
      listo: "listo",
      en_camino: "en camino",
    }[s] || s
  );
}
