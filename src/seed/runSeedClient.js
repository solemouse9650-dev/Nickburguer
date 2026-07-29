import { Timestamp, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config.js";
import { DEFAULT_SETTINGS } from "../services/settings.js";
import { seedDefaultCategories } from "../services/categories.js";
import {
  ADMIN_EMAIL,
  DEMO_SETTINGS_OVERLAY,
  SEED_COUPONS,
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_PRODUCTS,
  SEED_PROMOS,
} from "./seedData.js";

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

  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email || ADMIN_EMAIL,
      role: "admin",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

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

  for (const c of SEED_CUSTOMERS) {
    const { id, ...data } = c;
    const now = Timestamp.now();
    await setDoc(
      doc(db, "customers", id),
      {
        ...data,
        phone: id,
        registeredAt: now,
        firstPurchaseAt: now,
        lastPurchaseAt: now,
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

  await setDoc(
    doc(db, "counters", "orders"),
    { value: Math.max(maxCounter, SEED_ORDERS.length), updatedAt: serverTimestamp() },
    { merge: true }
  );

  return {
    products: SEED_PRODUCTS.length,
    promotions: SEED_PROMOS.length,
    coupons: SEED_COUPONS.length,
    customers: SEED_CUSTOMERS.length,
    orders: SEED_ORDERS.length,
  };
}
