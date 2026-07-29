import {
  createCategory,
  deleteCategory,
  listenCategories,
  reorderCategories,
  seedDefaultCategories,
  updateCategory,
} from "../../services/categories.js";
import { deleteImageByPath, uploadImage } from "../../services/storage.js";
import { hasProductsInCategory } from "../../services/products.js";
import { escapeHtml } from "../../utils/format.js";
import { confirmDialog, showToast } from "../../utils/toast.js";

let unsub = null;
let categories = [];
let clickAbort = null;
let activePreviewUrl = "";

function revokePreview() {
  if (activePreviewUrl.startsWith("blob:")) URL.revokeObjectURL(activePreviewUrl);
  activePreviewUrl = "";
}

export function mountCategories(root) {
  unmountCategories();
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>Categorías</h2>
        <div class="actions">
          <button type="button" class="btn btn-ghost btn-sm" id="seedCats">Cargar defaults</button>
          <button type="button" class="btn btn-primary" id="newCat">+ Nueva</button>
        </div>
      </div>
      <div class="table-wrap" id="catsTable"><div class="skeleton"></div></div>
    </section>
    <div id="catFormHost"></div>
  `;

  clickAbort = new AbortController();
  const { signal } = clickAbort;

  root.querySelector("#newCat").addEventListener("click", () => openForm(root, null), { signal });
  root.querySelector("#seedCats").addEventListener(
    "click",
    async () => {
      try {
        const ok = await seedDefaultCategories();
        showToast(ok ? "Categorías iniciales creadas" : "Ya hay categorías cargadas", "success");
      } catch (err) {
        showToast(err.message || "Error", "error");
      }
    },
    { signal }
  );

  unsub = listenCategories(
    (data) => {
      categories = data;
      renderTable(root);
    },
    (err) => {
      showToast(err.message || "Error al cargar categorías", "error");
      const wrap = root.querySelector("#catsTable");
      if (wrap) wrap.innerHTML = '<div class="empty">No se pudieron cargar las categorías.</div>';
    }
  );

  root.addEventListener(
    "click",
    async (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");
      const up = e.target.closest("[data-up]");
      const down = e.target.closest("[data-down]");
      if (edit) openForm(root, categories.find((c) => c.id === edit.dataset.edit));
      if (del) {
        if (!confirmDialog("¿Eliminar esta categoría?")) return;
        try {
          const cat = categories.find((c) => c.id === del.dataset.del);
          if (cat?.slug && (await hasProductsInCategory(cat.slug))) {
            throw new Error(
              "No se puede eliminar: hay productos asignados. Movelos a otra categoría primero."
            );
          }
          await deleteCategory(del.dataset.del);
          if (cat?.imagePath) deleteImageByPath(cat.imagePath).catch(() => {});
          showToast("Categoría eliminada", "success");
        } catch (err) {
          showToast(err.message || "Error", "error");
        }
      }
      if (up || down) {
        const id = (up || down).dataset.up || (up || down).dataset.down;
        const idx = categories.findIndex((c) => c.id === id);
        if (idx < 0) return;
        const next = [...categories];
        const swap = up ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= next.length) return;
        [next[idx], next[swap]] = [next[swap], next[idx]];
        try {
          await reorderCategories(next.map((c) => c.id));
          showToast("Orden actualizado", "success");
        } catch (err) {
          showToast(err.message || "Error al reordenar", "error");
        }
      }
    },
    { signal }
  );
}

export function unmountCategories() {
  if (unsub) unsub();
  unsub = null;
  clickAbort?.abort();
  clickAbort = null;
  categories = [];
  revokePreview();
}

function renderTable(root) {
  const wrap = root.querySelector("#catsTable");
  if (!wrap) return;
  if (!categories.length) {
    wrap.innerHTML =
      '<div class="empty">No hay categorías. Cargá defaults o creá una nueva.</div>';
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th></th><th>Orden</th><th>Nombre</th><th>Slug</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${categories
          .map(
            (c, i) => `<tr>
            <td>${
              c.imageUrl
                ? `<img class="thumb" src="${escapeHtml(c.imageUrl)}" alt="" onerror="this.style.display='none'" />`
                : "—"
            }</td>
            <td>${c.sortOrder ?? i + 1}</td>
            <td>${escapeHtml(c.name)}</td>
            <td><code>${escapeHtml(c.slug || "")}</code></td>
            <td><span class="badge ${c.active !== false ? "badge-activo" : "badge-inactivo"}">${c.active !== false ? "Activa" : "Inactiva"}</span></td>
            <td class="actions">
              <button class="btn btn-sm btn-ghost" data-up="${c.id}" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="btn btn-sm btn-ghost" data-down="${c.id}" ${i === categories.length - 1 ? "disabled" : ""}>↓</button>
              <button class="btn btn-sm btn-ghost" data-edit="${c.id}">Editar</button>
              <button class="btn btn-sm btn-danger" data-del="${c.id}">Eliminar</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function openForm(root, cat) {
  revokePreview();
  const host = root.querySelector("#catFormHost");
  let imageFile = null;
  let imagePreview = cat?.imageUrl || "";
  const imagePath = cat?.imagePath || "";

  host.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>${cat ? "Editar categoría" : "Nueva categoría"}</h2>
        <button type="button" class="btn btn-ghost" id="cancelCat">Cancelar</button>
      </div>
      <form id="catForm" class="form-grid">
        <div class="field"><label>Nombre *</label><input name="name" required value="${escapeHtml(cat?.name || "")}" /></div>
        <div class="field"><label>Slug</label><input name="slug" value="${escapeHtml(cat?.slug || "")}" placeholder="hamburguesas" /></div>
        <div class="field"><label>Orden</label><input type="number" name="sortOrder" value="${cat?.sortOrder ?? categories.length + 1}" /></div>
        <div class="field">
          <div class="switch-row" style="border:0;padding-top:1.6rem">
            <span>Activa</span>
            <label class="switch"><input type="checkbox" name="active" ${cat?.active !== false ? "checked" : ""} /><span></span></label>
          </div>
        </div>
        <div class="field full">
          <label>Imagen</label>
          <input type="file" id="catImage" accept="image/*" />
          <div id="catImagePreview" style="margin-top:.6rem">${
            imagePreview
              ? `<img class="thumb" style="width:80px;height:80px;object-fit:cover;border-radius:12px" src="${escapeHtml(imagePreview)}" alt="" />`
              : ""
          }</div>
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit">Guardar</button></div>
      </form>
    </section>`;

  host.querySelector("#cancelCat").onclick = () => {
    revokePreview();
    host.innerHTML = "";
  };
  host.querySelector("#catImage")?.addEventListener("change", (e) => {
    imageFile = e.target.files?.[0] || null;
    if (imageFile) {
      revokePreview();
      imagePreview = URL.createObjectURL(imageFile);
      activePreviewUrl = imagePreview;
      host.querySelector("#catImagePreview").innerHTML =
        `<img class="thumb" style="width:80px;height:80px;object-fit:cover;border-radius:12px" src="${imagePreview}" alt="" />`;
    }
  });

  host.querySelector("#catForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      name: form.name.value.trim(),
      slug: form.slug.value.trim() || form.name.value.trim(),
      sortOrder: Number(form.sortOrder.value || 99),
      active: form.active.checked,
      imageUrl: cat?.imageUrl || "",
      imagePath: imagePath || "",
    };
    let uploadedPath = "";
    let saved = false;
    try {
      const previousPath = imagePath;
      if (imageFile) {
        const up = await uploadImage(imageFile, "categories");
        payload.imageUrl = up.url;
        payload.imagePath = up.path;
        uploadedPath = up.path;
      }
      if (cat?.id) await updateCategory(cat.id, payload, cat.slug);
      else await createCategory(payload);
      saved = true;
      if (imageFile && previousPath && previousPath !== payload.imagePath) {
        deleteImageByPath(previousPath).catch(() => {});
      }
      showToast("Categoría guardada", "success");
      revokePreview();
      host.innerHTML = "";
    } catch (err) {
      if (!saved && uploadedPath) deleteImageByPath(uploadedPath).catch(() => {});
      showToast(err.message || "Error al guardar", "error");
    }
  };
}
