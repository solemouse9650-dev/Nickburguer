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
import { normalizeOrderStatus, normalizePhone } from "../utils/format.js";
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
  const orderRef = doc(db, "orders", id);
  await runTransaction(db, async (tx) => {
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists()) throw new Error("El pedido ya no existe.");

    const order = orderSnapshot.data();
    const previous = normalizeOrderStatus(order.status);
    const next = normalizeOrderStatus(status);
    const changesCancellation = (previous === "cancelado") !== (next === "cancelado");
    let customerRef = null;
    let customerSnapshot = null;

    if (changesCancellation && order.phone) {
      customerRef = doc(db, "customers", normalizePhone(order.phone));
      customerSnapshot = await tx.get(customerRef);
    }

    tx.update(orderRef, {
      status,
      updatedAt: serverTimestamp(),
    });

    if (customerRef && customerSnapshot?.exists()) {
      const customer = customerSnapshot.data();
      const total = Math.max(0, Number(order.total || 0));
      const currentSpent = Math.max(0, Number(customer.totalSpent || 0));
      tx.update(customerRef, {
        totalSpent:
          next === "cancelado"
            ? Math.max(0, currentSpent - total)
            : currentSpent + total,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export async function updateOrder(id, data) {
  const { id: _id, createdAt, orderNumber, ...rest } = data;
  const orderRef = doc(db, "orders", id);
  await runTransaction(db, async (tx) => {
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists()) throw new Error("El pedido ya no existe.");

    const previous = orderSnapshot.data();
    const previousPhone = normalizePhone(previous.phone);
    const nextPhone = normalizePhone(rest.phone || previous.phone);
    const previousCustomerRef = previousPhone
      ? doc(db, "customers", previousPhone)
      : null;
    const nextCustomerRef = nextPhone ? doc(db, "customers", nextPhone) : null;
    const previousCustomerSnapshot = previousCustomerRef
      ? await tx.get(previousCustomerRef)
      : null;
    const nextCustomerSnapshot =
      nextCustomerRef && nextPhone !== previousPhone
        ? await tx.get(nextCustomerRef)
        : previousCustomerSnapshot;

    const previousContribution =
      normalizeOrderStatus(previous.status) === "cancelado"
        ? 0
        : Math.max(0, Number(previous.total || 0));
    const nextContribution =
      normalizeOrderStatus(rest.status ?? previous.status) === "cancelado"
        ? 0
        : Math.max(0, Number(rest.total ?? previous.total ?? 0));

    tx.update(orderRef, {
      ...rest,
      phone: nextPhone,
      updatedAt: serverTimestamp(),
    });

    if (previousPhone && previousPhone === nextPhone && previousCustomerSnapshot?.exists()) {
      const customer = previousCustomerSnapshot.data();
      tx.update(previousCustomerRef, {
        totalSpent: Math.max(
          0,
          Number(customer.totalSpent || 0) - previousContribution + nextContribution
        ),
        updatedAt: serverTimestamp(),
      });
    } else {
      if (previousCustomerRef && previousCustomerSnapshot?.exists()) {
        const customer = previousCustomerSnapshot.data();
        tx.update(previousCustomerRef, {
          totalOrders: Math.max(0, Number(customer.totalOrders || 0) - 1),
          totalSpent: Math.max(
            0,
            Number(customer.totalSpent || 0) - previousContribution
          ),
          updatedAt: serverTimestamp(),
        });
      }
      if (nextCustomerRef) {
        const customer = nextCustomerSnapshot?.exists()
          ? nextCustomerSnapshot.data()
          : {};
        tx.set(
          nextCustomerRef,
          {
            id: nextPhone,
            phone: nextPhone,
            firstName: rest.firstName || customer.firstName || "",
            lastName: rest.lastName || customer.lastName || "",
            email: rest.email || customer.email || "",
            address: rest.address || customer.address || "",
            status: customer.status || "Activo",
            totalOrders: Number(customer.totalOrders || 0) + 1,
            totalSpent: Number(customer.totalSpent || 0) + nextContribution,
            registeredAt: customer.registeredAt || serverTimestamp(),
            firstPurchaseAt: customer.firstPurchaseAt || serverTimestamp(),
            lastPurchaseAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
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

    tx.set(
      counterRef,
      {
        value: next,
        lastOrderId: orderRef.id,
        lastOrderNumber: orderNumber,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

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
