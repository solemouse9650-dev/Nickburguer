import {
  addDoc,
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

const col = collection(db, "promotions");

function mapDocs(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function sortByCreated(items) {
  return items.sort(
    (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
  );
}

export function listenPromotions(callback, onError) {
  let activeUnsub = () => {};

  const attach = (useFallback) => {
    const target = useFallback ? col : query(col, orderBy("createdAt", "desc"));
    activeUnsub = onSnapshot(
      target,
      (snap) => {
        const items = mapDocs(snap);
        if (useFallback) sortByCreated(items);
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

export function listenActivePromotions(callback, onError) {
  return listenPromotions((items) => {
    const now = Date.now();
    callback(
      items.filter((p) => {
        if (!p.active) return false;
        const start = p.startDate?.toDate
          ? p.startDate.toDate().getTime()
          : p.startDate
            ? new Date(p.startDate).getTime()
            : null;
        const end = p.endDate?.toDate
          ? p.endDate.toDate().getTime()
          : p.endDate
            ? new Date(p.endDate).getTime()
            : null;
        if (start && now < start) return false;
        if (end && now > end) return false;
        return true;
      })
    );
  }, onError);
}

export async function createPromotion(data) {
  const refDoc = await addDoc(col, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return refDoc.id;
}

export async function updatePromotion(id, data) {
  await updateDoc(doc(db, "promotions", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePromotion(id) {
  await deleteDoc(doc(db, "promotions", id));
}
