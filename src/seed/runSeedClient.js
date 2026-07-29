import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase/config.js";
import { DEFAULT_SETTINGS } from "../services/settings.js";
import { seedDefaultCategories } from "../services/categories.js";
import {
  DEMO_SETTINGS_OVERLAY,
  SEED_COUPONS,
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_PRODUCTS,
  SEED_PROMOS,
  SEED_RESERVATIONS,
} from "./seedData.js";
import { assertValidSeedData } from "./validateSeed.js";

function demoDate({ daysAgo = 0, hoursAgo = 0 } = {}) {
  const d = new Date();
  d.setDate(d.getDate() - Number(daysAgo || 0));
  d.setHours(d.getHours() - Number(hoursAgo || 0));
  return d;
}

function mergeDeep(base, overlay) {
  const out = structuredClone(base);
  Object.keys(overlay || {}).forEach((key) => {
    if (
      overlay[key] &&
      typeof overlay[key] === "object" &&
      !Array.isArray(overlay[key])
    ) {
      out[key] = { ...(out[key] || {}), ...overlay[key] };
    } else {
      out[key] = overlay[key];
    }
  });
  return out;
}

/** Seed demo completo desde el navegador (requiere sesión admin + reglas desplegadas). */
export async function runSeedClient() {
  const user = auth.currentUser;
  if (!user) throw new Error("Debés iniciar sesión como administrador.");
  const validation = assertValidSeedData();

  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email || "",
      role: "admin",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  const [productsSnapshot, ordersSnapshot] = await Promise.all([
    getDocs(query(collection(db, "products"), limit(1))),
    getDocs(query(collection(db, "orders"), limit(1))),
  ]);
  if (!productsSnapshot.empty || !ordersSnapshot.empty) {
    throw new Error(
      "La base ya contiene productos o pedidos. La carga demo fue cancelada para proteger los datos existentes."
    );
  }

  const settings = mergeDeep(DEFAULT_SETTINGS, DEMO_SETTINGS_OVERLAY);
  await setDoc(
    doc(db, "business_settings", "main"),
    { ...settings, updatedAt: serverTimestamp() },
    { merge: true }
  );

  await seedDefaultCategories();

  for (const p of SEED_PRODUCTS) {
    const { id, ...data } = p;
    await setDoc(
      doc(db, "products", id),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  for (const p of SEED_PROMOS) {
    const { id, ...data } = p;
    await setDoc(
      doc(db, "promotions", id),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  for (const c of SEED_COUPONS) {
    const { id, ...data } = c;
    await setDoc(
      doc(db, "coupons", id),
      {
        ...data,
        code: String(data.code || "").toUpperCase(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const reservation of SEED_RESERVATIONS) {
    const { id, daysAhead, ...data } = reservation;
    const date = new Date();
    date.setDate(date.getDate() + Number(daysAhead || 1));
    await setDoc(
      doc(db, "reservations", id),
      {
        ...data,
        date: date.toISOString().slice(0, 10),
        source: "demo",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const c of SEED_CUSTOMERS) {
    const { id, ...data } = c;
    const desiredTotalOrders = Math.max(0, Number(data.totalOrders || 0));
    const customerDates = SEED_ORDERS.filter((order) => order.phone === id)
      .map((order) => demoDate(order))
      .sort((a, b) => a - b);
    const firstPurchase = Timestamp.fromDate(customerDates[0] || new Date());
    const lastPurchase = Timestamp.fromDate(customerDates.at(-1) || new Date());
    await setDoc(
      doc(db, "customers", id),
      {
        ...data,
        phone: id,
        totalOrders: desiredTotalOrders,
        registeredAt: firstPurchase,
        firstPurchaseAt: firstPurchase,
        lastPurchaseAt: lastPurchase,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  let maxCounter = 0;
  for (const o of SEED_ORDERS) {
    const { id, daysAgo, hoursAgo, ...rest } = o;
    const when = Timestamp.fromDate(demoDate({ daysAgo, hoursAgo }));
    const items = rest.items || [];
    const productName =
      rest.productName ||
      items.map((it) => `${it.name} x${it.quantity}`).join(", ");
    const match = String(rest.orderNumber || "").match(/(\d+)$/);
    if (match) maxCounter = Math.max(maxCounter, Number(match[1]));

    await setDoc(
      doc(db, "orders", id),
      {
        ...rest,
        id,
        productName,
        productId: items[0]?.productId || "",
        quantity: items.reduce((s, it) => s + Number(it.quantity || 0), 0),
        unitPrice: items[0]?.unitPrice || 0,
        observations: rest.notes || "",
        couponId: rest.couponCode ? `coupon-${String(rest.couponCode).toLowerCase()}` : null,
        clientLat: null,
        clientLng: null,
        createdAt: when,
        updatedAt: when,
        date: when,
      },
      { merge: true }
    );
  }

  const counterRef = doc(db, "counters", "orders");
  const counterSnapshot = await getDoc(counterRef);
  const currentCounter = counterSnapshot.exists()
    ? Number(counterSnapshot.data().value || 0)
    : 0;
  const lastSeedOrder = SEED_ORDERS.find((order) =>
    String(order.orderNumber || "").endsWith(String(maxCounter).padStart(6, "0"))
  );
  await setDoc(
    counterRef,
    {
      value: Math.max(currentCounter, maxCounter, SEED_ORDERS.length),
      lastOrderId: lastSeedOrder?.id || "",
      lastOrderNumber: lastSeedOrder?.orderNumber || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ...validation.counts,
    reservations: SEED_RESERVATIONS.length,
  };
}
