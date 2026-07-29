import {
  createProduct,
  deleteProduct,
  duplicateProduct,
  listenProducts,
  updateProduct,
} from "../../services/products.js";
import { listenCategories } from "../../services/categories.js";
import { deleteImageByPath, uploadImage } from "../../services/storage.js";
import { escapeHtml, formatMoney, productUnitPrice } from "../../utils/format.js";
import { confirmDialog, showToast } from "../../utils/toast.js";

let unsub = null;
let unsubCats = null;
let products = [];
let categories = [];
let editing = null;
let imageFile = null;
let imagePreview = "";
let imagePath = "";
let clickAbort = null;

export function mountProducts(root) {
  unmountProducts();
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>Productos</h2>
        <button type="button" class="btn btn-primary" id="newProductBtn">+ Nuevo producto</button>
      </div>
      <div class="table-tools table-tools--wrap">
        <input type="search" id="productSearch" placeholder="Buscar por nombre, categoría o tags..." />
        <select id="productCatFilter">
          <option value="all">Todas las categorías</option>
        </select>
        <select id="productStockFilter">
          <option value="all">Todo el stock</option>
          <option value="available">Disponibles</option>
          <option value="soldout">Agotados</option>
          <option value="featured">Destacados</option>
          <option value="sale">En oferta</option>
        </select>
      </div>
      <div class="table-wrap" id="productsTable"><div class="skeleton"></div></div>
    </section>
    <div id="productFormHost"></div>
  `;

  clickAbort = new AbortController();
  const { signal } = clickAbort;
  root.querySelector("#newProductBtn").addEventListener("click", () => openForm(root, null), { signal });
  root.querySelector("#productSearch").addEventListener(
    "input",
    () => renderTable(root),
    { signal }
  );
  root.querySelector("#productCatFilter").addEventListener("change", () => renderTable(root), { signal });
  root.querySelector("#productStockFilter").addEventListener("change", () => renderTable(root), { signal });

  unsub = listenProducts(
    (data) => {
      products = data;
      renderTable(root);
    },
    (err) => {
      showToast(err.message || "Error al cargar productos", "error");
      const wrap = root.querySelector("#productsTable");
      if (wrap) wrap.innerHTML = '<div class="empty">No se pudieron cargar los productos.</div>';
    }
  );
  unsubCats = listenCategories((data) => {
    categories = data.filter((c) => c.active !== false);
    const sel = root.querySelector("#productCatFilter");
    if (sel) {
      const current = sel.value || "all";
      sel.innerHTML =
        `<option value="all">Todas las categorías</option>` +
        categories
          .map(
            (c) =>
              `<option value="${escapeHtml(c.slug || c.id)}">${escapeHtml(c.name)}</option>`
          )
          .join("");
      sel.value = current;
    }
    renderTable(root);
  });

  root.addEventListener(
    "click",
    async (e) => {
      const edit = e.target.closest("[data-edit]");
      const dup = e.target.closest("[data-dup]");
      const del = e.target.closest("[data-del]");
      if (edit) openForm(root, products.find((p) => p.id === edit.dataset.edit));
      if (dup) {
        const p = products.find((x) => x.id === dup.dataset.dup);
        if (!p) return;
        try {
          await duplicateProduct(p);
          showToast("Producto duplicado", "success");
        } catch (err) {
          showToast(err.message || "Error al duplicar", "error");
        }
      }
      if (del) {
        if (!confirmDialog("¿Eliminar este producto?")) return;
        try {
          const p = products.find((x) => x.id === del.dataset.del);
          await deleteProduct(del.dataset.del);
          if (p?.imagePath) deleteImageByPath(p.imagePath).catch(() => {});
          showToast("Producto eliminado", "success");
        } catch (err) {
          showToast(err.message || "Error al eliminar", "error");
        }
      }
    },
    { signal }
  );
}

export function unmountProducts() {
  if (unsub) unsub();
  if (unsubCats) unsubCats();
  unsub = null;
  unsubCats = null;
  clickAbort?.abort();
  clickAbort = null;
  products = [];
  editing = null;
  imageFile = null;
  if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
  imagePreview = "";
  imagePath = "";
}

function categoryOptions(selected) {
  const list =
    categories.length > 0
      ? categories
      : [
          { slug: "burgers", name: "Hamburguesas" },
          { slug: "sides", name: "Acompañamientos" },
          { slug: "drinks", name: "Bebidas" },
          { slug: "combos", name: "Combos" },
          { slug: "desserts", name: "Postres" },
          { slug: "otros", name: "Otros" },
        ];
  return list
    .map((c) => {
      const val = c.slug || c.id;
      return `<option value="${escapeHtml(val)}" ${selected === val ? "selected" : ""}>${escapeHtml(c.name)}</option>`;
    })
    .join("");
}

function renderTable(root) {
  const wrap = root.querySelector("#productsTable");
  if (!wrap) return;
  const q = (root.querySelector("#productSearch")?.value || "").trim().toLowerCase();
  const cat = root.querySelector("#productCatFilter")?.value || "all";
  const stock = root.querySelector("#productStockFilter")?.value || "all";

  const filtered = products.filter((p) => {
    if (q) {
      const hay = `${p.name || ""} ${p.category || ""} ${p.tags || ""} ${p.description || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (cat !== "all" && (p.category || "") !== cat) return false;
    if (stock === "available" && (p.available === false || p.soldOut)) return false;
    if (stock === "soldout" && !(p.soldOut || p.available === false)) return false;
    if (stock === "featured" && !(p.isFeatured || p.isTrending)) return false;
    if (stock === "sale" && !p.isOnSale) return false;
    return true;
  });

  if (!products.length) {
    wrap.innerHTML = '<div class="empty">No hay productos. Creá el primero.</div>';
    return;
  }
  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty">Ningún producto coincide con los filtros.</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th></th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Flags</th><th>Stock</th><th>Acciones</th></tr>
      </thead>
      <tbody>
        ${filtered
          .map((p) => {
            const flags = [
              p.isNew ? "Nuevo" : "",
              p.isTrending || p.isFeatured ? "Destacado" : "",
              p.isOnSale ? "Oferta" : "",
              p.soldOut ? "Agotado" : "",
            ]
              .filter(Boolean)
              .join(" · ");
            const available = p.available !== false && !p.soldOut;
            return `<tr>
              <td><img class="thumb" src="${escapeHtml(p.imageUrl || "/burger-nick-logo.png")}" alt="" onerror="this.onerror=null;this.src='/burger-nick-logo.png'" /></td>
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(p.category || "")}</td>
              <td>${
                p.isOnSale
                  ? `<s style="color:#9a9590">${formatMoney(p.originalPrice || p.price)}</s> ${formatMoney(p.salePrice)}`
                  : formatMoney(productUnitPrice(p))
              }</td>
              <td>${escapeHtml(flags || "—")}</td>
              <td>${available ? "Disponible" : "Agotado"}</td>
              <td class="actions">
                <button class="btn btn-sm btn-ghost" data-edit="${p.id}">Editar</button>
                <button class="btn btn-sm btn-ghost" data-dup="${p.id}">Duplicar</button>
                <button class="btn btn-sm btn-danger" data-del="${p.id}">Eliminar</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function openForm(root, product) {
  const isEdit = Boolean(product?.id);
  editing = isEdit ? product : null;
  imageFile = null;
  imagePreview = product?.imageUrl || "";
  imagePath = product?.imagePath || "";
  const host = root.querySelector("#productFormHost");
  host.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>${isEdit ? "Editar producto" : "Nuevo producto"}</h2>
        <button type="button" class="btn btn-ghost" id="cancelProduct">Cancelar</button>
      </div>
      <form id="productForm" class="form-grid">
        <div class="field"><label>Nombre *</label><input name="name" required value="${escapeHtml(product?.name || "")}" /></div>
        <div class="field">
          <label>Categoría *</label>
          <select name="category" required>${categoryOptions(product?.category)}</select>
        </div>
        <div class="field full"><label>Descripción</label><textarea name="description" rows="3">${escapeHtml(product?.description || "")}</textarea></div>
        <div class="field full"><label>Ingredientes</label><input name="ingredients" value="${escapeHtml(product?.ingredients || "")}" /></div>
        <div class="field full"><label>Etiquetas de búsqueda</label><input name="tags" value="${escapeHtml(Array.isArray(product?.tags) ? product.tags.join(", ") : product?.tags || "")}" placeholder="doble, cheddar, picante" /></div>
        <div class="field"><label>Precio *</label><input name="price" type="number" min="0" step="100" required value="${product?.originalPrice ?? product?.price ?? ""}" /></div>
        <div class="field"><label>Precio oferta</label><input name="salePrice" type="number" min="0" step="100" value="${product?.salePrice ?? ""}" /></div>
        <div class="field"><label>Orden visual</label><input name="sortOrder" type="number" value="${product?.sortOrder ?? 0}" /></div>
        <div class="field full">
          <div class="switch-row"><span>Disponible</span><label class="switch"><input type="checkbox" name="available" ${product?.available !== false ? "checked" : ""} /><span></span></label></div>
          <div class="switch-row"><span>Agotado</span><label class="switch"><input type="checkbox" name="soldOut" ${product?.soldOut ? "checked" : ""} /><span></span></label></div>
          <div class="switch-row"><span>🆕 Nuevo</span><label class="switch"><input type="checkbox" name="isNew" ${product?.isNew ? "checked" : ""} /><span></span></label></div>
          <div class="switch-row"><span>⭐ Destacado / Más vendido</span><label class="switch"><input type="checkbox" name="isTrending" ${product?.isTrending || product?.isFeatured ? "checked" : ""} /><span></span></label></div>
          <div class="switch-row"><span>🔥 Oferta</span><label class="switch"><input type="checkbox" name="isOnSale" ${product?.isOnSale ? "checked" : ""} /><span></span></label></div>
        </div>
        <div class="field full">
          <label>Imagen (Firebase Storage)</label>
          <div class="dropzone" id="dropzone">
            <p>Arrastrá una imagen o hacé clic</p>
            ${imagePreview ? `<img src="${escapeHtml(imagePreview)}" alt="Vista previa" />` : ""}
          </div>
          <input type="file" id="imageInput" accept="image/*" hidden />
          ${imagePreview ? `<button type="button" class="btn btn-sm btn-ghost" id="clearImage" style="margin-top:.6rem">Quitar imagen</button>` : ""}
        </div>
        <div class="field full modal-actions" style="margin:0">
          <button type="submit" class="btn btn-primary" id="saveProductBtn">Guardar</button>
        </div>
      </form>
    </section>`;

  const dz = host.querySelector("#dropzone");
  const input = host.querySelector("#imageInput");
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files?.[0]) setImage(host, input.files[0]);
  });
  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("is-drag");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("is-drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("is-drag");
    if (e.dataTransfer.files?.[0]) setImage(host, e.dataTransfer.files[0]);
  });
  host.querySelector("#clearImage")?.addEventListener("click", () => {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    imageFile = null;
    imagePreview = "";
    imagePath = "";
    openForm(root, isEdit ? { ...product, imageUrl: "", imagePath: "" } : null);
  });
  host.querySelector("#cancelProduct").addEventListener("click", () => {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    host.innerHTML = "";
  });
  host.querySelector("#productForm").addEventListener("submit", (e) => saveProduct(e, root));
}

function setImage(host, file) {
  if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
  imageFile = file;
  imagePreview = URL.createObjectURL(file);
  const dz = host.querySelector("#dropzone");
  dz.innerHTML = `<p>${escapeHtml(file.name)}</p><img src="${imagePreview}" alt="Vista previa" />`;
  let clearBtn = host.querySelector("#clearImage");
  if (!clearBtn) {
    clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-sm btn-ghost";
    clearBtn.id = "clearImage";
    clearBtn.style.marginTop = ".6rem";
    clearBtn.textContent = "Quitar imagen";
    dz.insertAdjacentElement("afterend", clearBtn);
  }
  clearBtn.onclick = () => {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    imageFile = null;
    imagePreview = "";
    imagePath = "";
    dz.innerHTML = `<p>Arrastrá una imagen o hacé clic</p>`;
    clearBtn.remove();
  };
}

async function saveProduct(e, root) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("#saveProductBtn");
  btn.disabled = true;
  btn.textContent = "Guardando...";
  let uploadedPath = "";
  let saved = false;

  try {
    const price = Number(form.price.value);
    const salePrice = form.salePrice.value ? Number(form.salePrice.value) : null;
    const isOnSale = form.isOnSale.checked;
    let imageUrl = imagePreview.startsWith("blob:") ? editing?.imageUrl || "" : imagePreview;
    let nextPath = imagePath;

    if (imageFile) {
      const uploaded = await uploadImage(imageFile, "products");
      imageUrl = uploaded.url;
      nextPath = uploaded.path;
      uploadedPath = uploaded.path;
    } else if (!imageUrl && editing?.imagePath) {
      nextPath = "";
    }

    const soldOut = form.soldOut.checked;
    const payload = {
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      ingredients: form.ingredients.value.trim(),
      tags: form.tags.value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      category: form.category.value,
      price: isOnSale && salePrice != null ? salePrice : price,
      originalPrice: price,
      salePrice: isOnSale ? salePrice : null,
      available: form.available.checked && !soldOut,
      soldOut,
      isNew: form.isNew.checked,
      isTrending: form.isTrending.checked,
      isFeatured: form.isTrending.checked,
      isOnSale,
      sortOrder: Number(form.sortOrder.value || 0),
      imageUrl,
      imagePath: nextPath || "",
    };

    if (!payload.name || Number.isNaN(price) || price < 0) {
      throw new Error("Nombre y precio válidos son obligatorios.");
    }

    if (editing?.id) await updateProduct(editing.id, payload);
    else await createProduct(payload);
    saved = true;
    if (editing?.imagePath && editing.imagePath !== nextPath) {
      deleteImageByPath(editing.imagePath).catch(() => {});
    }

    showToast("Producto guardado", "success");
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    imagePreview = "";
    root.querySelector("#productFormHost").innerHTML = "";
    editing = null;
  } catch (err) {
    if (!saved && uploadedPath) deleteImageByPath(uploadedPath).catch(() => {});
    showToast(err.message || "Error al guardar", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
}
