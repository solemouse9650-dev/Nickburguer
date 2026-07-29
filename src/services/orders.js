import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { normalizePhone } from "../utils/format.js";
import { upsertCustomerFromOrder } from "./customers.js";
import { calcCouponDiscount, validateCoupon } from "./coupons.js";

const col = collection(db, "orders");

export function listenOrders(callback, onError) {
  const q = query(col, orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    onError
  );
}

export function listenOrdersByPhone(phone, callback, onError) {
  const normalized = normalizePhone(phone);
  let activeUnsub = () => {};

  const mapAndSort = (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
    callback(items);
  };

  const attach = (useFallback) => {
    const target = useFallback
      ? query(col, where("phone", "==", normalized))
      : query(col, where("phone", "==", normalized), orderBy("createdAt", "desc"));
    activeUnsub = onSnapshot(
      target,
      (snap) => {
        if (useFallback) mapAndSort(snap);
        else callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        if (!useFallback && err?.code === "failed-precondition") {
          activeUnsub();
          attach(true);
          return;
        }
        onError?.(err);
      }
    );
  };

  attach(false);
  return () => activeUnsub();
}

export async function updateOrderStatus(id, status) {
  await updateDoc(doc(db, "orders", id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateOrder(id, data) {
  const { id: _id, createdAt, orderNumber, ...rest } = data;
  await updateDoc(doc(db, "orders", id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteOrder(id) {
  await deleteDoc(doc(db, "orders", id));
}

/**
 * Crea pedido con número atómico + upsert de cliente + cupón (si aplica).
 */
export async function createOrderFromCheckout(payload) {
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", "orders");
  const orderRef = doc(col);

  const result = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists() ? Number(counterSnap.data().value || 0) : 0;
    const next = current + 1;
    const orderNumber = `BN-${year}-${String(next).padStart(6, "0")}`;

    let couponId = payload.couponId || null;
    let couponCode = payload.couponCode || "";
    let discount = Number(payload.discount || 0);
    let deliveryCost = Number(payload.deliveryCost || 0);
    const subtotal = Math.max(0, Number(payload.subtotal || 0));

    if (couponId) {
      const couponRef = doc(db, "coupons", couponId);
      const couponSnap = await tx.get(couponRef);
      if (!couponSnap.exists()) {
        throw new Error("El cupón ya no existe.");
      }
      const coupon = { id: couponSnap.id, ...couponSnap.data() };
      const shippingBase = Number(
        payload.deliveryCostBeforeCoupon ?? payload.deliveryCost ?? 0
      );
      const check = validateCoupon(coupon, {
        subtotal,
        shipping: shippingBase,
      });
      if (!check.ok) {
        throw new Error(check.error || "Cupón inválido.");
      }
      const computed = calcCouponDiscount(coupon, {
        subtotal,
        shipping: shippingBase,
      });
      discount = computed.discount;
      deliveryCost = computed.shippingAfter;
      couponCode = coupon.code;

      const used = Number(coupon.usedCount || 0);
      tx.update(couponRef, {
        usedCount: used + 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      discount = Math.max(0, discount);
      deliveryCost = Math.max(0, deliveryCost);
    }

    // Siempre recalcular: no confiar en un total del cliente desfasado
    const total = Math.max(0, subtotal + deliveryCost - discount);

    tx.set(counterRef, { value: next, updatedAt: serverTimestamp() }, { merge: true });

    const {
      deliveryCostBeforeCoupon: _drop,
      ...restPayload
    } = payload;

    const orderData = {
      ...restPayload,
      id: orderRef.id,
      orderNumber,
      phone: normalizePhone(payload.phone),
      status: "pendiente",
      subtotal,
      deliveryCost,
      discount,
      total,
      couponId: couponId || null,
      couponCode: couponCode || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      date: Timestamp.now(),
    };

    tx.set(orderRef, orderData);
    return { orderNumber, orderId: orderRef.id, orderData, total, discount, deliveryCost };
  });

  // El pedido ya quedó guardado. El upsert de cliente no debe romper la confirmación.
  try {
    await upsertCustomerFromOrder({
      firstName: payload.firstName,
      lastName: payload.lastName,
      phone: payload.phone,
      email: payload.email || "",
      address: payload.address || "",
      total: result.total ?? payload.total,
    });
  } catch (err) {
    console.warn("[orders] upsertCustomerFromOrder falló (pedido ya guardado):", err?.code || err?.message || err);
  }

  return result;
}

export async function getOrder(id) {
  const snap = await getDoc(doc(db, "orders", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
