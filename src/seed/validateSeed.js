import {
  DEMO_SETTINGS_OVERLAY,
  SEED_COUPONS,
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_PRODUCTS,
  SEED_PROMOS,
} from "./seedData.js";

const CATEGORY_IDS = new Set(["burgers", "combos", "sides", "drinks", "desserts", "otros"]);
const ORDER_STATUSES = new Set([
  "pendiente",
  "nuevo",
  "confirmado",
  "en_preparacion",
  "listo",
  "en_camino",
  "entregado",
  "cancelado",
]);

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  values.forEach((value) => {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  });
  return [...repeated];
}

function validPhone(value) {
  return /^\d{8,15}$/.test(String(value || "").replace(/\D/g, ""));
}

export function validateSeedData() {
  const errors = [];
  const productIds = new Set(SEED_PRODUCTS.map((item) => item.id));
  const couponCodes = new Set(SEED_COUPONS.map((item) => item.code));

  [
    ["productos", SEED_PRODUCTS],
    ["promociones", SEED_PROMOS],
    ["cupones", SEED_COUPONS],
    ["clientes", SEED_CUSTOMERS],
    ["pedidos", SEED_ORDERS],
  ].forEach(([label, items]) => {
    duplicates(items.map((item) => item.id)).forEach((id) =>
      errors.push(`ID duplicado en ${label}: ${id}`)
    );
  });

  duplicates(SEED_COUPONS.map((item) => String(item.code || "").toUpperCase())).forEach(
    (code) => errors.push(`Código de cupón duplicado: ${code}`)
  );
  duplicates(SEED_ORDERS.map((item) => item.orderNumber)).forEach((number) =>
    errors.push(`Número de pedido duplicado: ${number}`)
  );

  SEED_PRODUCTS.forEach((product) => {
    if (!product.id || !product.name) errors.push("Hay un producto sin ID o nombre.");
    if (!CATEGORY_IDS.has(product.category)) {
      errors.push(`Categoría desconocida en ${product.id}: ${product.category}`);
    }
    if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0) {
      errors.push(`Precio inválido en ${product.id}.`);
    }
  });

  SEED_COUPONS.forEach((coupon) => {
    if (!coupon.code || !["percent", "fixed"].includes(coupon.type)) {
      errors.push(`Cupón inválido: ${coupon.id}`);
    }
    if (coupon.type === "percent" && (Number(coupon.value) <= 0 || Number(coupon.value) > 100)) {
      errors.push(`Porcentaje inválido en ${coupon.code}.`);
    }
    if (Number(coupon.usedCount || 0) > Number(coupon.maxUses ?? Infinity)) {
      errors.push(`Usos mayores al máximo en ${coupon.code}.`);
    }
  });

  SEED_CUSTOMERS.forEach((customer) => {
    if (customer.id !== customer.phone || !validPhone(customer.phone)) {
      errors.push(`Teléfono o ID inválido en cliente ${customer.id}.`);
    }
    if (!/^376000\d{4}$/.test(customer.phone) || !/@example\.com$/i.test(customer.email || "")) {
      errors.push(`El cliente demo ${customer.id} no usa contacto reservado para pruebas.`);
    }
    if (Number(customer.totalOrders) < 0 || Number(customer.totalSpent) < 0) {
      errors.push(`Totales inválidos en cliente ${customer.id}.`);
    }
    const customerOrders = SEED_ORDERS.filter((order) => order.phone === customer.phone);
    const expectedSpent = customerOrders
      .filter((order) => order.status !== "cancelado")
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    if (
      Number(customer.totalOrders) !== customerOrders.length ||
      Number(customer.totalSpent) !== expectedSpent
    ) {
      errors.push(`Totales de cliente inconsistentes en ${customer.id}.`);
    }
  });

  SEED_ORDERS.forEach((order) => {
    if (!/^BN-\d{4}-\d{6}$/.test(order.orderNumber || "")) {
      errors.push(`Número de pedido inválido: ${order.orderNumber || order.id}`);
    }
    if (!ORDER_STATUSES.has(order.status)) {
      errors.push(`Estado inválido en ${order.id}: ${order.status}`);
    }
    if (!validPhone(order.phone)) errors.push(`Teléfono inválido en ${order.id}.`);
    if (!/^376000\d{4}$/.test(order.phone) || !/@example\.com$/i.test(order.email || "")) {
      errors.push(`El pedido demo ${order.id} no usa contacto reservado para pruebas.`);
    }

    const calculatedSubtotal = (order.items || []).reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0
    );
    if (calculatedSubtotal !== Number(order.subtotal || 0)) {
      errors.push(`Subtotal inconsistente en ${order.id}.`);
    }
    const calculatedTotal = Math.max(
      0,
      Number(order.subtotal || 0) +
        Number(order.deliveryCost || 0) -
        Number(order.discount || 0)
    );
    if (calculatedTotal !== Number(order.total || 0)) {
      errors.push(`Total inconsistente en ${order.id}.`);
    }
    (order.items || []).forEach((item) => {
      if (!productIds.has(item.productId)) {
        errors.push(`Producto inexistente en ${order.id}: ${item.productId}`);
      }
    });
    if (order.couponCode && !couponCodes.has(order.couponCode)) {
      errors.push(`Cupón inexistente en ${order.id}: ${order.couponCode}`);
    }

    const isPickup = /retir/i.test(order.deliveryMethod || "");
    const coupon = SEED_COUPONS.find((item) => item.code === order.couponCode);
    const zones = DEMO_SETTINGS_OVERLAY.shipping?.zoneCosts || [];
    const zone = [...zones]
      .sort((a, b) => Number(a.maxKm) - Number(b.maxKm))
      .find((item) => Number(order.distanceKm || 0) <= Number(item.maxKm));
    const expectedDelivery =
      isPickup || coupon?.freeShipping ? 0 : Number(zone?.cost || 0);
    if (Number(order.deliveryCost || 0) !== expectedDelivery) {
      errors.push(`Costo de envío inconsistente en ${order.id}.`);
    }
  });

  SEED_COUPONS.forEach((coupon) => {
    const expectedUses = SEED_ORDERS.filter((order) => order.couponCode === coupon.code).length;
    if (Number(coupon.usedCount || 0) !== expectedUses) {
      errors.push(`Cantidad de usos inconsistente en ${coupon.code}.`);
    }
  });

  const contact = DEMO_SETTINGS_OVERLAY.contact || {};
  if (!validPhone(contact.whatsappPrimary) || !validPhone(contact.whatsappSecondary)) {
    errors.push("Los WhatsApp configurados para la demo no son válidos.");
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      products: SEED_PRODUCTS.length,
      promotions: SEED_PROMOS.length,
      coupons: SEED_COUPONS.length,
      customers: SEED_CUSTOMERS.length,
      orders: SEED_ORDERS.length,
    },
  };
}

export function assertValidSeedData() {
  const result = validateSeedData();
  if (!result.ok) {
    throw new Error(`Datos demo inválidos:\n- ${result.errors.join("\n- ")}`);
  }
  return result;
}
