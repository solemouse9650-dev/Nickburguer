import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/config.js";

const col = collection(db, "categories");

export const DEFAULT_CATEGORIES = [
  { id: "burgers", name: "Hamburguesas", slug: "burgers", sortOrder: 1, active: true },
  { id: "combos", name: "Combos", slug: "combos", sortOrder: 2, active: true },
  { id: "sides", name: "Papas / Acompañamientos", slug: "sides", sortOrder: 3, active: true },
  { id: "drinks", name: "Bebidas", slug: "drinks", sortOrder: 4, active: true },
  { id: "desserts", name: "Postres", slug: "desserts", sortOrder: 5, active: true },
  { id: "otros", name: "Otros", slug: "otros", sortOrder: 6, active: true },
];

export function listenCategories(callback, onError) {
  let activeUnsub = () => {};
  const attach = (useFallback) => {
    const target = useFallback ? col : query(col, orderBy("sortOrder", "asc"));
    activeUnsub = onSnapshot(
      target,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (useFallback) {
          items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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

export async function createCategory(data) {
  const ref = await addDoc(col, {
    name: data.name.trim(),
    slug: (data.slug || data.name).trim().toLowerCase().replace(/\s+/g, "-"),
    sortOrder: Number(data.sortOrder ?? 99),
    active: data.active !== false,
    imageUrl: data.imageUrl || "",
    imagePath: data.imagePath || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCategory(id, data, previousSlug = "") {
  const payload = { ...data };
  if (payload.slug != null || payload.name != null) {
    const raw = String(payload.slug || payload.name || "").trim();
    payload.slug = raw.toLowerCase().replace(/\s+/g, "-");
  }
  if (payload.name != null) payload.name = String(payload.name).trim();
  if (payload.sortOrder != null) payload.sortOrder = Number(payload.sortOrder ?? 99);
  const nextSlug = payload.slug;
  if (previousSlug && nextSlug && previousSlug !== nextSlug) {
    const products = await getDocs(
      query(collection(db, "products"), where("category", "==", previousSlug))
    );
    if (products.size > 450) {
      throw new Error(
        "Hay demasiados productos para renombrar esta categoría en una sola operación."
      );
    }
    const batch = writeBatch(db);
    batch.update(doc(db, "categories", id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    products.docs.forEach((product) => {
      batch.update(product.ref, {
        category: nextSlug,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return;
  }
  await updateDoc(doc(db, "categories", id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategory(id) {
  await deleteDoc(doc(db, "categories", id));
}

export async function reorderCategories(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, "categories", id), {
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function seedDefaultCategories() {
  const snap = await getDocs(col);
  if (!snap.empty) return false;
  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach((c) => {
    batch.set(doc(db, "categories", c.id), {
      name: c.name,
      slug: c.slug,
      sortOrder: c.sortOrder,
      active: true,
      imageUrl: "",
      imagePath: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return true;
}
