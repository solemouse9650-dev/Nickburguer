import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config.js";

const col = collection(db, "coupons");

function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function listenCoupons(callback, onError) {
  let activeUnsub = () => {};
  const attach = (useFallback) => {
    const target = useFallback ? col : query(col, orderBy("createdAt", "desc"));
    activeUnsub = onSnapshot(
      target,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (useFallback) {
          items.sort(
            (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
          );
        }
        callback(items);
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

export async function getCouponByCode(code) {
  const normalized = String(code || "")
    .trim()
    .toUpperCase();
  if (!normalized) return null;
  const q = query(col, where("code", "==", normalized), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Calcula el descuento en pesos (ARS).
 * Reglas: percent/fixed, tope maxDiscount, applyToShipping, freeShipping.
 */
export function calcCouponDiscount(coupon, { subtotal = 0, shipping = 0 } = {}) {
  if (!coupon) return { discount: 0, shippingAfter: Number(shipping) || 0 };

  const product = Math.max(0, Number(subtotal) || 0);
  let ship = Math.max(0, Number(shipping) || 0);

  if (coupon.freeShipping) ship = 0;

  let base = product;
  if (coupon.applyToShipping) base += ship;

  let discount = 0;
  if (coupon.type === "fixed") {
    discount = Math.max(0, Number(coupon.value) || 0);
  } else {
    const pct = Math.max(0, Number(coupon.value) || 0);
    discount = (base * pct) / 100;
    const cap = coupon.maxDiscount != null && coupon.maxDiscount !== ""
      ? Number(coupon.maxDiscount)
      : null;
    if (cap != null && Number.isFinite(cap) && cap >= 0) {
      discount = Math.min(discount, cap);
    }
  }

  const maxAllowed = product + ship;
  discount = Math.min(Math.round(discount), maxAllowed);
  return { discount: Math.max(0, discount), shippingAfter: ship };
}

/**
 * Valida reglas del cupón contra el pedido actual.
 */
export function validateCoupon(coupon, { subtotal = 0, shipping = 0, now = new Date() } = {}) {
  if (!coupon) {
    return { ok: false, error: "Cupón no encontrado." };
  }
  if (coupon.active === false) {
    return { ok: false, error: "Este cupón no está activo." };
  }

  const start = toDate(coupon.startDate);
  const end = toDate(coupon.endDate);
  if (start && now < startOfDay(start)) {
    return { ok: false, error: "Este cupón aún no está vigente." };
  }
  if (end && now > endOfDay(end)) {
    return { ok: false, error: "Este cupón expiró." };
  }

  const maxUses = coupon.maxUses != null && coupon.maxUses !== "" ? Number(coupon.maxUses) : null;
  const used = Number(coupon.usedCount || 0);
  if (maxUses != null && Number.isFinite(maxUses) && used >= maxUses) {
    return { ok: false, error: "Este cupón ya alcanzó el máximo de usos." };
  }

  const minOrder = Number(coupon.minOrderAmount || 0);
  if (minOrder > 0 && Number(subtotal) < minOrder) {
    return {
      ok: false,
      error: `Compra mínima de $${minOrder.toLocaleString("es-AR")} (sin envío).`,
    };
  }

  const { discount, shippingAfter } = calcCouponDiscount(coupon, { subtotal, shipping });
  if (discount <= 0 && !coupon.freeShipping) {
    return { ok: false, error: "El cupón no genera descuento en este pedido." };
  }

  return {
    ok: true,
    coupon,
    discount,
    shippingAfter,
    total: Math.max(0, Number(subtotal) + shippingAfter - discount),
  };
}

export async function createCoupon(data) {
  const code = String(data.code || "").trim().toUpperCase();
  if (!code) throw new Error("El código es obligatorio.");
  const existing = await getCouponByCode(code);
  if (existing) throw new Error("Ya existe un cupón con ese código.");

  const ref = await addDoc(col, {
    code,
    type: data.type || "percent",
    value: Number(data.value) || 0,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    maxUses: data.maxUses != null && data.maxUses !== "" ? Number(data.maxUses) : null,
    usedCount: 0,
    minOrderAmount:
      data.minOrderAmount != null && data.minOrderAmount !== ""
        ? Number(data.minOrderAmount)
        : 0,
    maxDiscount:
      data.maxDiscount != null && data.maxDiscount !== "" ? Number(data.maxDiscount) : null,
    applyToShipping: Boolean(data.applyToShipping),
    freeShipping: Boolean(data.freeShipping),
    active: data.active !== false,
    description: data.description || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCoupon(id, data) {
  const payload = { ...data, updatedAt: serverTimestamp() };
  if (payload.code != null) {
    payload.code = String(payload.code).trim().toUpperCase();
    const existing = await getCouponByCode(payload.code);
    if (existing && existing.id !== id) {
      throw new Error("Ya existe un cupón con ese código.");
    }
  }
  if (payload.value != null) payload.value = Number(payload.value) || 0;
  if (payload.minOrderAmount != null && payload.minOrderAmount !== "") {
    payload.minOrderAmount = Number(payload.minOrderAmount) || 0;
  }
  if (payload.maxDiscount === "") payload.maxDiscount = null;
  else if (payload.maxDiscount != null) payload.maxDiscount = Number(payload.maxDiscount);
  if (payload.maxUses === "") payload.maxUses = null;
  else if (payload.maxUses != null) payload.maxUses = Number(payload.maxUses);
  await updateDoc(doc(db, "coupons", id), payload);
}

export async function deleteCoupon(id) {
  await deleteDoc(doc(db, "coupons", id));
}

export async function duplicateCoupon(coupon) {
  const { id, createdAt, updatedAt, usedCount, ...rest } = coupon;
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  return createCoupon({
    ...rest,
    code: `${rest.code}-COPY-${suffix}`,
    usedCount: 0,
    active: false,
  });
}
