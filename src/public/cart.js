import { productUnitPrice } from "../utils/format.js";

const STORAGE_KEY = "burger_nick_cart_v1";
const LEGACY_STORAGE_KEY = "loli_cart_v1";

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
}

/** Carrito público persistente (localStorage). */
export const Cart = (() => {
  let items = loadItems();
  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(getItems());
      } catch {
        /* ignore */
      }
    });
  }

  function save() {
    persist(items);
    notify();
  }

  function getItems() {
    return items.map((it) => ({ ...it }));
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getItems());
    return () => listeners.delete(fn);
  }

  function add(product, qty = 1) {
    if (!product?.id) return null;
    const quantity = Math.max(1, Number(qty) || 1);
    const unitPrice = productUnitPrice(product);
    const existing = items.find((it) => it.productId === product.id);
    if (!existing && items.length >= 20) return null;
    if (existing) {
      existing.quantity += quantity;
      existing.unitPrice = unitPrice;
      existing.name = product.name || existing.name;
      existing.imageUrl = product.imageUrl || product.image || existing.imageUrl;
    } else {
      items.push({
        productId: product.id,
        name: product.name || "Producto",
        unitPrice,
        quantity,
        imageUrl: product.imageUrl || product.image || "/burger-nick-logo.png",
        category: product.category || "",
      });
    }
    save();
    return getItems();
  }

  function remove(productId) {
    items = items.filter((it) => it.productId !== productId);
    save();
  }

  function setQty(productId, qty) {
    const item = items.find((it) => it.productId === productId);
    if (!item) return;
    const next = Math.max(0, Number(qty) || 0);
    if (next <= 0) {
      remove(productId);
      return;
    }
    item.quantity = next;
    save();
  }

  function clear() {
    items = [];
    save();
  }

  function count() {
    return items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  }

  function subtotal() {
    return items.reduce(
      (s, it) => s + Number(it.unitPrice || 0) * Number(it.quantity || 0),
      0
    );
  }

  function isEmpty() {
    return items.length === 0;
  }

  function syncWithCatalog(catalog = []) {
    const products = new Map(catalog.map((product) => [product.id, product]));
    let changed = false;
    const removed = [];
    items = items.flatMap((item) => {
      const product = products.get(item.productId);
      if (!product || product.active === false || product.available === false) {
        removed.push(item.name);
        changed = true;
        return [];
      }
      const nextPrice = productUnitPrice(product);
      if (
        nextPrice !== item.unitPrice ||
        product.name !== item.name ||
        product.imageUrl !== item.imageUrl
      ) {
        changed = true;
      }
      return [
        {
          ...item,
          name: product.name || item.name,
          unitPrice: nextPrice,
          imageUrl: product.imageUrl || product.image || item.imageUrl,
          category: product.category || "",
        },
      ];
    });
    if (changed) save();
    return { changed, removed };
  }

  return {
    subscribe,
    add,
    remove,
    setQty,
    clear,
    count,
    subtotal,
    getItems,
    isEmpty,
    syncWithCatalog,
  };
})();
