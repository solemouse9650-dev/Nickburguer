import test, { after, before, beforeEach } from "node:test";
import fs from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

const projectId = "burger-nick-rules-test";
const [host, rawPort] = String(
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080"
).split(":");
const port = Number(rawPort);
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port,
      rules: await fs.readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "products", "burger-test"), {
        name: "Burger Test",
        category: "burgers",
        price: 1000,
        active: true,
        available: true,
        soldOut: false,
        isOnSale: false,
      }),
      setDoc(doc(db, "counters", "orders"), {
        value: 0,
        lastOrderId: "",
        lastOrderNumber: "",
      }),
      setDoc(doc(db, "coupons", "coupon-test"), {
        code: "TEST10",
        type: "percent",
        value: 10,
        active: true,
        usedCount: 0,
        maxUses: 10,
        minOrderAmount: 0,
        maxDiscount: 500,
      }),
    ]);
  });
});

after(async () => {
  await environment?.cleanup();
});

function validOrder(id = "order-valid") {
  return {
    id,
    orderNumber: "BN-2099-000001",
    status: "pendiente",
    firstName: "Cliente",
    lastName: "Prueba",
    phone: "3760000099",
    email: "cliente@example.com",
    notes: "",
    items: [
      {
        productId: "burger-test",
        name: "Burger Test",
        category: "burgers",
        quantity: 1,
        unitPrice: 1000,
      },
    ],
    subtotal: 1000,
    deliveryCost: 0,
    discount: 0,
    total: 1000,
    couponId: null,
    couponCode: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

test("acepta pedido y cliente atómicos con precios del catálogo", async () => {
  const db = environment.unauthenticatedContext().firestore();
  const order = validOrder();
  const batch = writeBatch(db);
  batch.set(doc(db, "orders", order.id), order);
  batch.set(doc(db, "customers", order.phone), {
    id: order.phone,
    phone: order.phone,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    address: "",
    totalOrders: 1,
    totalSpent: order.total,
    lastOrderId: order.id,
    lastPurchaseAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());
});

test("rechaza manipulación de precios", async () => {
  const db = environment.unauthenticatedContext().firestore();
  const order = validOrder("order-price-tampered");
  order.items[0].unitPrice = 1;
  order.subtotal = 1;
  order.total = 1;
  const batch = writeBatch(db);
  batch.set(doc(db, "orders", order.id), order);
  await assertFails(batch.commit());
});

test("acepta el máximo de tres líneas válidas", async () => {
  const db = environment.unauthenticatedContext().firestore();
  const order = validOrder("order-eight-lines");
  order.items = Array.from({ length: 3 }, (_, index) => ({
    productId: "burger-test",
    name: `Burger Test ${index + 1}`,
    category: "burgers",
    quantity: 1,
    unitPrice: 1000,
  }));
  order.subtotal = 3000;
  order.total = 3000;
  const batch = writeBatch(db);
  batch.set(doc(db, "orders", order.id), order);
  await assertSucceeds(batch.commit());
});

test("rechaza inflar clientes o agotar cupones sin pedido", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(
    setDoc(doc(db, "customers", "3760000098"), {
      id: "3760000098",
      phone: "3760000098",
      firstName: "Ataque",
      lastName: "Prueba",
      email: "",
      address: "",
      totalOrders: 1,
      totalSpent: 999999,
      lastOrderId: "missing-order",
      lastPurchaseAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(db, "coupons", "coupon-test"), {
      usedCount: 1,
      lastOrderId: "missing-order",
      updatedAt: serverTimestamp(),
    })
  );
});

test("permite reservas válidas y rechaza payloads inválidos", async () => {
  const db = environment.unauthenticatedContext().firestore();
  const validReservation = {
    name: "Reserva Test",
    phone: "3760000099",
    date: "2099-12-31",
    time: "21:00",
    guests: 2,
    notes: "",
    status: "pendiente",
    source: "web",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(
    setDoc(doc(db, "reservations", "reservation-valid"), validReservation)
  );
  await assertFails(
    setDoc(doc(db, "reservations", "reservation-invalid"), {
      ...validReservation,
      guests: 100,
    })
  );
});
