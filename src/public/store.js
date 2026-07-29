/** Estado compartido del sitio público (datos en tiempo real). */
export const store = {
  products: [],
  promotions: [],
  settings: null,
};

export function getProductById(id) {
  return store.products.find((p) => p.id === id) || null;
}
