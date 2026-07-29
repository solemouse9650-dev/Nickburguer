export function formatMoney(amount, locale = "es-AR", currency = "ARS") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(Number(amount) || 0));
}

export function formatDate(value) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function productUnitPrice(product) {
  if (product?.isOnSale && product?.salePrice != null) {
    return Number(product.salePrice);
  }
  return Number(product?.price || product?.originalPrice || 0);
}

export function statusLabel(status) {
  const map = {
    nuevo: "Pendiente",
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    en_preparacion: "En preparación",
    listo: "Listo para entregar",
    en_camino: "En camino",
    entregado: "Entregado",
    cancelado: "Cancelado",
  };
  return map[status] || status || "—";
}

export const ORDER_STATUSES = [
  "pendiente",
  "confirmado",
  "en_preparacion",
  "listo",
  "en_camino",
  "entregado",
  "cancelado",
];

export function normalizeOrderStatus(status) {
  if (status === "nuevo") return "pendiente";
  return status || "pendiente";
}

export function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calcDeliveryCost(distanceKm, settings) {
  const shipping = settings?.shipping || {};
  const zones = Array.isArray(shipping.zoneCosts) ? shipping.zoneCosts : [];
  const dist = Number(distanceKm) || 0;

  if (zones.length) {
    const sorted = [...zones]
      .map((z) => ({
        maxKm: Number(z.maxKm ?? z.untilKm ?? z.km ?? Infinity),
        cost: Number(z.cost ?? z.price ?? 0),
      }))
      .filter((z) => Number.isFinite(z.maxKm) && Number.isFinite(z.cost))
      .sort((a, b) => a.maxKm - b.maxKm);
    const match = sorted.find((z) => dist <= z.maxKm);
    if (match) return Math.max(0, match.cost);
  }

  const base = Number(shipping.baseCost ?? shipping.standardCost ?? 3000);
  const perKm = Number(shipping.costPerKm ?? 3000);
  if (!dist || dist <= 0) return base;
  return Math.max(base, dist * perKm);
}

export function getWhatsAppNumber(settings) {
  const contact = settings?.contact || {};
  const code = contact.whatsappCountryCode || "54";
  const phone = normalizePhone(contact.whatsapp || contact.whatsappPrimary || "");
  return `${code}9${phone}`;
}

export function getStatusMessage(settings, status) {
  const m = settings?.messages || {};
  const map = {
    pendiente: m.received,
    confirmado: m.confirmed,
    en_preparacion: m.preparing,
    listo: m.ready || m.preparing,
    en_camino: m.onTheWay || "Tu pedido va en camino.",
    entregado: m.delivered,
    cancelado: m.cancelled,
  };
  return map[status] || m.received || "";
}

export function buildCustomerWhatsAppUrl(settings, phone, text) {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  const code = settings?.contact?.whatsappCountryCode || "54";
  let full = digits;
  if (!digits.startsWith(code)) {
    // Argentina mobile: country + 9 + area without 0
    full = `${code}9${digits.replace(/^0/, "")}`;
  }
  return `https://wa.me/${full}?text=${encodeURIComponent(text || "")}`;
}
