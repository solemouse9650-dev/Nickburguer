import { MEDIA_BUCKET, supabase } from "../supabase/client.js";

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
 * Sube imagen a Supabase Storage.
 * @param {File} file
 * @param {string} folder products | promotions | branding | categories
 */
export async function uploadImage(file, folder = "products") {
  if (!supabase) {
    throw new Error("Falta configurar Supabase Storage en las variables de entorno.");
  }
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

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, {
      contentType: optimized.type || "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    const msg = error.message || "Error al subir imagen a Supabase";
    if (/bucket|not found|404/i.test(msg)) {
      throw new Error(
        "Bucket 'media' no encontrado en Supabase. Creá el bucket público 'media' (ver SUPABASE_SETUP.md)."
      );
    }
    throw new Error(msg);
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("No se pudo obtener la URL pública.");

  return { url: data.publicUrl, path };
}

export async function deleteImageByPath(path) {
  if (!path) return;
  if (!supabase) {
    throw new Error("Falta configurar Supabase Storage en las variables de entorno.");
  }
  // Solo borrar paths relativos del bucket (no URLs externas)
  if (/^https?:\/\//i.test(path)) return;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error && !/not found|404/i.test(error.message || "")) {
    throw error;
  }
}
