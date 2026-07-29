import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";

const col = collection(db, "products");

function mapDocs(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function sortByCreated(items) {
  return items.sort(
    (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
  );
}

/** Listener con fallback si falta índice; limpia la suscripción activa al desuscribir. */
export function listenProducts(callback, onError) {
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

export function listenAvailableProducts(callback, onError) {
  return listenProducts((items) => {
    callback(items.filter((p) => p.available !== false && !p.soldOut));
  }, onError);
}

export async function createProduct(data) {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const refDoc = await addDoc(col, payload);
  return refDoc.id;
}

export async function updateProduct(id, data) {
  await updateDoc(doc(db, "products", id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(id) {
  await deleteDoc(doc(db, "products", id));
}

export async function duplicateProduct(product) {
  const { id, createdAt, updatedAt, ...rest } = product;
  return createProduct({
    ...rest,
    name: `${rest.name} (copia)`,
    available: false,
  });
}

export async function setProductDoc(id, data) {
  await setDoc(doc(db, "products", id), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
