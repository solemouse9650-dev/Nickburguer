/**
 * Seed demo completo de Firestore.
 * Uso: npm run seed -- --password=TU_PASSWORD
 * Requiere Email/Password Auth habilitado y el usuario admin ya creado.
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  Timestamp,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { DEFAULT_SETTINGS } from "../services/settings.js";
import { DEFAULT_CATEGORIES } from "../services/categories.js";
import {
  ADMIN_EMAIL,
  DEMO_SETTINGS_OVERLAY,
  SEED_COUPONS,
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_PRODUCTS,
  SEED_PROMOS,
} from "./seedData.js";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : "";
}

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

async function main() {
  const password = getArg("password") || process.env.SEED_PASSWORD || "";
  if (!password) {
    console.error("Falta password. Ejemplo: npm run seed -- --password=****");
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log("Iniciando sesión como admin...");
  const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
  const uid = cred.user.uid;

  console.log("Creando perfil admin...");
  await setDoc(
    doc(db, "users", uid),
    {
      uid,
      email: ADMIN_EMAIL,
      role: "admin",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Configuración del negocio...");
  const settings = mergeDeep(DEFAULT_SETTINGS, DEMO_SETTINGS_OVERLAY);
  await setDoc(
    doc(db, "business_settings", "main"),
    { ...settings, updatedAt: serverTimestamp() },
    { merge: true }
  );

  console.log("Categorías...");
  for (const c of DEFAULT_CATEGORIES) {
    await setDoc(
      doc(db, "categories", c.id),
      {
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        active: true,
        imageUrl: "",
        imagePath: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`  ✓ ${c.name}`);
  }

  console.log("Productos...");
  for (const p of SEED_PRODUCTS) {
    const { id, ...data } = p;
    await setDoc(
      doc(db, "products", id),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    console.log(`  ✓ ${data.name}`);
  }

  console.log("Promociones...");
  for (const p of SEED_PROMOS) {
    const { id, ...data } = p;
    await setDoc(
      doc(db, "promotions", id),
      { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    console.log(`  ✓ ${data.title}`);
  }

  console.log("Cupones...");
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
    console.log(`  ✓ ${data.code}`);
  }

  console.log("Clientes...");
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
    console.log(`  ✓ ${data.firstName} ${data.lastName}`);
  }

  console.log("Pedidos demo...");
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
    console.log(`  ✓ ${rest.orderNumber} (${rest.status})`);
  }

  console.log("Contador de órdenes...");
  await setDoc(
    doc(db, "counters", "orders"),
    { value: Math.max(maxCounter, SEED_ORDERS.length), updatedAt: serverTimestamp() },
    { merge: true }
  );

  console.log("\nSeed demo completado:");
  console.log(`  ${SEED_PRODUCTS.length} productos`);
  console.log(`  ${SEED_PROMOS.length} promociones`);
  console.log(`  ${SEED_COUPONS.length} cupones`);
  console.log(`  ${SEED_CUSTOMERS.length} clientes`);
  console.log(`  ${SEED_ORDERS.length} pedidos`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en seed:", err);
  process.exit(1);
});
