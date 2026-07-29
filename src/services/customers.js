import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { normalizePhone } from "../utils/format.js";

const col = collection(db, "customers");

function mapDocs(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function listenCustomers(callback, onError) {
  let activeUnsub = () => {};

  const attach = (useFallback) => {
    const target = useFallback ? col : query(col, orderBy("lastPurchaseAt", "desc"));
    activeUnsub = onSnapshot(
      target,
      (snap) => {
        const items = mapDocs(snap);
        if (useFallback) {
          items.sort((a, b) => {
            const ta = a.lastPurchaseAt?.toMillis?.() || 0;
            const tb = b.lastPurchaseAt?.toMillis?.() || 0;
            return tb - ta;
          });
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

export async function updateCustomer(id, data) {
  await updateDoc(doc(db, "customers", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCustomer(id) {
  await deleteDoc(doc(db, "customers", id));
}

/**
 * Upsert de cliente sin getDoc (los invitados no pueden leer /customers).
 * 1) Intenta updateDoc + increment
 * 2) Si no existe → setDoc create
 * 3) Si hay carrera create/update → reintenta update
 */
export async function upsertCustomerFromOrder(orderInfo) {
  const phone = normalizePhone(orderInfo.phone);
  if (!phone) return null;

  const ref = doc(db, "customers", phone);
  const total = Number(orderInfo.total) || 0;
  const now = serverTimestamp();
  const profile = {
    firstName: orderInfo.firstName || "",
    lastName: orderInfo.lastName || "",
    email: orderInfo.email || "",
    address: orderInfo.address || "",
    phone,
    status: "Activo",
    updatedAt: now,
    lastPurchaseAt: now,
  };

  try {
    await updateDoc(ref, {
      ...profile,
      totalOrders: increment(1),
      totalSpent: increment(total),
    });
    return phone;
  } catch (err) {
    const code = err?.code || "";
    if (code !== "not-found" && code !== "permission-denied") {
      throw err;
    }

    try {
      await setDoc(ref, {
        id: phone,
        ...profile,
        totalOrders: 1,
        totalSpent: total,
        firstPurchaseAt: now,
        registeredAt: now,
      });
      return phone;
    } catch (createErr) {
      // Carrera: otro pedido creó el doc; completar con update
      await updateDoc(ref, {
        ...profile,
        totalOrders: increment(1),
        totalSpent: increment(total),
      });
      return phone;
    }
  }
}
