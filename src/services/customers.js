import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";

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
