import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import { app } from "../firebase/config.js";

const storage = getStorage(app);

async function compressImage(file, maxWidth = 1400, quality = 0.82) {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

/**
 * Sube una imagen optimizada a Firebase Storage.
 * @param {File} file
 * @param {string} folder products | promotions | branding | categories
 */
export async function uploadImage(file, folder = "products") {
  if (!file) throw new Error("No se seleccionó ninguna imagen.");
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("La imagen no puede superar 8 MB.");
  }

  const optimized = await compressImage(file);
  const safeName = `${Date.now()}-${optimized.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const path = `${folder}/${safeName}`;
  const objectRef = ref(storage, path);

  try {
    await uploadBytes(objectRef, optimized, {
      contentType: optimized.type || "image/jpeg",
      cacheControl: "public,max-age=31536000",
      customMetadata: { source: "burger-nick-admin" },
    });
    const url = await getDownloadURL(objectRef);
    return { url, path };
  } catch (error) {
    if (error?.code === "storage/unauthorized") {
      throw new Error(
        "Firebase Storage rechazó la subida. Verificá la sesión admin y publicá storage.rules."
      );
    }
    if (error?.code === "storage/bucket-not-found") {
      throw new Error("El bucket de Firebase Storage todavía no está habilitado.");
    }
    throw new Error(error?.message || "No se pudo subir la imagen.");
  }
}

export async function deleteImageByPath(path) {
  if (!path) return;
  // Solo borrar paths relativos del bucket (no URLs externas)
  if (/^https?:\/\//i.test(path)) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") {
      throw error;
    }
  }
}
