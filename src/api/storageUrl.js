// URL pública de un archivo de Storage.
//
// Los buckets son públicos y se descargan directamente desde Supabase: no pasan
// por la pasarela (no hay nada que autorizar y así no depende de ella). Subir y
// borrar sí pasan por la pasarela, vía supabase.storage.
//
// No se usa supabase.storage.getPublicUrl porque construiría la URL con la
// dirección de la pasarela.
const BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');

export function urlPublicaStorage(bucket, ruta) {
  const r = String(ruta).split('/').map(encodeURIComponent).join('/');
  return `${BASE}/storage/v1/object/public/${encodeURIComponent(bucket)}/${r}`;
}
