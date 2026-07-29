import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import {
  normalizeOrderStatus,
  normalizePhone,
  productUnitPrice,
} from "../utils/format.js";
import { calcCouponDiscount, validateCoupon } from "./coupons.js";

const col = collection(db, "orders");

export function listenOrders(callback, onError) {
  let activeUnsub = () => {};
  const attach = (useFallback) => {
    const target = useFallback ? col : query(col, orderBy("createdAt", "desc"));
    activeUnsub = onSnapshot(
      target,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (useFallback) {
          items.sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
          );
        }
        callback(items);
      },
      (error) => {
        if (!useFallback && error?.code === "failed-precondition") {
          activeUnsub();
          attach(true);
          return;
        }
        onError?.(error);
      }
    );
  };
  attach(false);
  return () => activeUnsub();
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
        totalOrders: Math.max(
          0,
          Number(customer.totalOrders || 0) + (next === "cancelado" ? -1 : 1)
        ),
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
    const previousOrderCount =
      normalizeOrderStatus(previous.status) === "cancelado" ? 0 : 1;
    const nextOrderCount =
      normalizeOrderStatus(rest.status ?? previous.status) === "cancelado" ? 0 : 1;

    tx.update(orderRef, {
      ...rest,
      phone: nextPhone,
      updatedAt: serverTimestamp(),
    });

    if (previousPhone && previousPhone === nextPhone && previousCustomerSnapshot?.exists()) {
      const customer = previousCustomerSnapshot.data();
      tx.update(previousCustomerRef, {
        totalOrders: Math.max(
          0,
          Number(customer.totalOrders || 0) - previousOrderCount + nextOrderCount
        ),
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
          totalOrders: Math.max(
            0,
            Number(customer.totalOrders || 0) - previousOrderCount
          ),
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
            totalOrders: Number(customer.totalOrders || 0) + nextOrderCount,
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
  const orderRef = doc(db, "orders", id);
  await runTransaction(db, async (tx) => {
    const orderSnapshot = await tx.get(orderRef);
    if (!orderSnapshot.exists()) return;
    const order = orderSnapshot.data();
    const isCancelled = normalizeOrderStatus(order.status) === "cancelado";
    const phone = normalizePhone(order.phone);
    const customerRef = phone ? doc(db, "customers", phone) : null;
    const customerSnapshot = customerRef ? await tx.get(customerRef) : null;

    tx.delete(orderRef);
    if (!isCancelled && customerRef && customerSnapshot?.exists()) {
      const customer = customerSnapshot.data();
      tx.update(customerRef, {
        totalOrders: Math.max(0, Number(customer.totalOrders || 0) - 1),
        totalSpent: Math.max(
          0,
          Number(customer.totalSpent || 0) - Math.max(0, Number(order.total || 0))
        ),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Crea pedido con número atómico + upsert de cliente + cupón (si aplica).
 */
export async function createOrderFromCheckout(payload) {
  const year = new Date().getFullYear();
  const orderRef = doc(col);

  const result = await runTransaction(db, async (tx) => {
    const orderNumber = `BN-${year}-${orderRef.id.slice(0, 8).toUpperCase()}`;

    const couponId = payload.couponId || null;
    let couponCode = payload.couponCode || "";
    let discount = 0;
    let deliveryCost = Number(payload.deliveryCost || 0);
    const requestedItems = Array.isArray(payload.items) ? payload.items : [];
    if (!requestedItems.length || requestedItems.length > 20) {
      throw new Error("El pedido debe tener entre 1 y 20 productos distintos.");
    }
    const productSnapshots = await Promise.all(
      requestedItems.map((item) => tx.get(doc(db, "products", String(item.productId || ""))))
    );
    const items = requestedItems.map((item, index) => {
      const snapshot = productSnapshots[index];
      if (!snapshot.exists()) throw new Error("Uno de los productos ya no existe.");
      const product = { id: snapshot.id, ...snapshot.data() };
      if (product.active === false || product.available === false || product.soldOut === true) {
        throw new Error(`${product.name || "Un producto"} ya no está disponible.`);
      }
      const quantity = Number(item.quantity || 0);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new Error("La cantidad de un producto no es válida.");
      }
      return {
        productId: product.id,
        name: String(product.name || item.name || "Producto"),
        quantity,
        unitPrice: productUnitPrice(product),
        category: String(product.category || ""),
      };
    });
    const subtotal = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

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
        lastOrderId: orderRef.id,
        updatedAt: serverTimestamp(),
      });
    } else {
      deliveryCost = Math.max(0, deliveryCost);
    }

    // Siempre recalcular: no confiar en un total del cliente desfasado
    const total = Math.max(0, subtotal + deliveryCost - discount);

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
      items,
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
    const customerPhone = normalizePhone(payload.phone);
    const customerRef = doc(db, "customers", customerPhone);
    tx.set(
      customerRef,
      {
        id: customerPhone,
        phone: customerPhone,
        firstName: String(payload.firstName || "").trim(),
        lastName: String(payload.lastName || "").trim(),
        email: String(payload.email || "").trim(),
        address: String(payload.address || "").trim(),
        totalOrders: increment(1),
        totalSpent: increment(total),
        lastOrderId: orderRef.id,
        lastPurchaseAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { orderNumber, orderId: orderRef.id, orderData, total, discount, deliveryCost };
  });

  return result;
}
