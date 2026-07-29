/**
 * Seed demo completo de Firestore.
 * Uso: npm run seed -- --password=TU_PASSWORD
 * Requiere Email/Password Auth habilitado y el usuario admin ya creado.
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { DEFAULT_SETTINGS } from "../services/settings.js";
import { DEFAULT_CATEGORIES } from "../services/categories.js";
import {
  DEMO_SETTINGS_OVERLAY,
  SEED_COUPONS,
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_PRODUCTS,
  SEED_PROMOS,
} from "./seedData.js";
import { assertValidSeedData } from "./validateSeed.js";

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
  const adminEmail = String(process.env.VITE_ADMIN_EMAIL || "").trim();
  const force = getArg("force") === "true" || process.env.SEED_FORCE === "true";
  const missingFirebaseVars = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missingFirebaseVars.length) {
    console.error(`Faltan variables Firebase: ${missingFirebaseVars.join(", ")}`);
    process.exit(1);
  }
  if (!password) {
    console.error("Falta SEED_PASSWORD. Cargalo solo en la sesión actual de la terminal.");
    process.exit(1);
  }
  if (!adminEmail) {
    console.error("Falta VITE_ADMIN_EMAIL en .env.local.");
    process.exit(1);
  }

  const validation = assertValidSeedData();
  console.log(
    `Datos demo validados: ${validation.counts.products} productos, ${validation.counts.orders} pedidos.`
  );

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log("Iniciando sesión como admin...");
  const cred = await signInWithEmailAndPassword(auth, adminEmail, password);
  const uid = cred.user.uid;

  console.log("Creando perfil admin...");
  await setDoc(
    doc(db, "users", uid),
    {
      uid,
      email: adminEmail,
      role: "admin",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (!force) {
    const [productsSnapshot, ordersSnapshot] = await Promise.all([
      getDocs(query(collection(db, "products"), limit(1))),
      getDocs(query(collection(db, "orders"), limit(1))),
    ]);
    if (!productsSnapshot.empty || !ordersSnapshot.empty) {
      throw new Error(
        "La base ya contiene productos o pedidos. El seed se canceló para no sobrescribir producción. Usá --force=true únicamente si verificaste que corresponde."
      );
    }
  }

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
        registeredAt: firstPurchase,
        firstPurchaseAt: firstPurchase,
        lastPurchaseAt: lastPurchase,
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
  const counterRef = doc(db, "counters", "orders");
  const counterSnapshot = await getDoc(counterRef);
  const currentCounter = counterSnapshot.exists()
    ? Number(counterSnapshot.data().value || 0)
    : 0;
  await setDoc(
    counterRef,
    {
      value: Math.max(currentCounter, maxCounter, SEED_ORDERS.length),
      updatedAt: serverTimestamp(),
    },
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
