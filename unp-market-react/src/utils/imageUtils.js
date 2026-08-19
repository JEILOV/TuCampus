// src/utils/imageUtils.js
// ============================================================
//  TuCampus — Utilidades de imagen compartidas
//
//  ANTES: comprimirImagen() y subirImgBB() estaban copiadas
//         literalmente en Publicar.jsx Y EditarProducto.jsx.
//         Cualquier cambio (calidad, límite de dimensión, API key)
//         había que hacerlo en dos lugares.
//
//  AHORA: una sola fuente de verdad. Ambas páginas importan
//         de aquí. Cambiar la calidad = cambiar 1 constante.
// ============================================================

// (logError ya no se usa en este archivo — la subida de imagen ahora
// delega el manejo de errores al catch de quien llame a subirImagenImgBB.)

const MAX_DIMENSION = 1080;
const CALIDAD_JPEG  = 0.70;
const CALIDAD_WEBP  = 0.75; // WebP mantiene mejor calidad visual a menor peso que JPEG en un % similar
// 🔒 La API key de ImgBB ya NO vive en el cliente (antes:
// VITE_IMGBB_API_KEY, visible en el bundle para cualquiera). Ahora
// vive solo en el servidor como IMGBB_API_KEY — ver api/upload-image.js.

// 🔧 Optimización de rendimiento: feature-detection de soporte WebP en
// canvas.toBlob(). Se resuelve UNA sola vez (no en cada compresión) y
// se cachea en este módulo — es una operación async barata pero no hay
// motivo para repetirla en cada imagen subida.
let soportaWebpPromise = null;
const soportaWebp = () => {
  if (!soportaWebpPromise) {
    soportaWebpPromise = new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      canvas.toBlob((blob) => resolve(!!blob && blob.type === "image/webp"), "image/webp");
    });
  }
  return soportaWebpPromise;
};

/**
 * Comprime una imagen usando Canvas.
 * Redimensiona a MAX_DIMENSION px en el lado más largo, mantiene el
 * ratio, y exporta en el formato más liviano disponible: WebP si el
 * navegador lo soporta (~25-35% más liviano que JPEG a calidad
 * visual equivalente), o JPEG al 70% como fallback universal.
 *
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export const comprimirImagen = (file) =>
  new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload  = (e) => {
      const img    = new Image();
      img.onerror  = () => reject(new Error("No se pudo cargar la imagen"));
      img.onload   = async () => {
        let { width, height } = img;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width  = MAX_DIMENSION;
          } else {
            width  = Math.round((width  * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas  = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        const usarWebp = await soportaWebp();
        const formato   = usarWebp ? "image/webp" : "image/jpeg";
        const calidad   = usarWebp ? CALIDAD_WEBP : CALIDAD_JPEG;

        // fallback al archivo original si canvas.toBlob devuelve null
        canvas.toBlob((blob) => resolve(blob ?? file), formato, calidad);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

/**
 * Convierte un Blob/File a base64 puro (sin el prefijo
 * "data:image/xxx;base64,") — es lo que espera api/upload-image.js.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
const blobABase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen comprimida"));
    reader.onload = () => {
      const dataUrl = reader.result;
      // dataUrl luce como "data:image/webp;base64,AAAA..." — solo
      // nos interesa lo que sigue después de la coma.
      const base64 = String(dataUrl).split(",")[1] || "";
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });

/**
 * Sube un Blob/File a ImgBB (vía api/upload-image.js, NUNCA directo
 * desde el navegador) y devuelve la URL pública.
 * Devuelve "" si no hay archivo.
 *
 * 🔧 Por qué pasa por nuestro propio endpoint y no llama a ImgBB
 * directo: ImgBB no garantiza headers CORS consistentes en dominios
 * de producción (funciona en localhost, falla con "blocked by CORS
 * policy" en www.tucampus.net.pe). Nuestro servidor le habla a ImgBB
 * server-to-server, donde CORS no aplica. Ver api/upload-image.js.
 *
 * Se sigue usando XMLHttpRequest (no fetch) para conservar el evento
 * de progreso real de la barra de subida en Publicar.jsx/EditarProducto.jsx
 * — ahora mide el progreso hacia NUESTRO endpoint, que es representativo
 * igual porque el reenvío servidor→ImgBB es rápido en comparación.
 *
 * @param {Blob|File|null} file
 * @param {(porcentaje: number) => void} [onProgress]  Callback 0–100, opcional.
 * @returns {Promise<string>} URL pública de la imagen
 */
export const subirImagenImgBB = async (file, onProgress) => {
  if (!file) return "";

  const imageBase64 = await blobABase64(file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload-image");
    xhr.setRequestHeader("Content-Type", "application/json");

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          onProgress?.(100);
          resolve(data.url);
        } else {
          reject(new Error(data?.error || "No se pudo subir la imagen"));
        }
      } catch {
        reject(new Error("Respuesta inválida del servidor de imágenes"));
      }
    };

    xhr.onerror = () => reject(new Error("Error de red al subir la imagen"));
    xhr.send(JSON.stringify({ imageBase64 }));
  });
};

/**
 * Comprime y sube hasta N imágenes, EN SECUENCIA (no en paralelo).
 *
 * 🔧 Por qué secuencial y no Promise.all: ImgBB (plan gratuito) es
 * sensible a ráfagas de requests concurrentes desde el mismo IP/key
 * (errores 400/429 intermitentes bajo carga). Subir de a una imagen
 * es más lento pero 100% confiable, y además permite reportar un
 * progreso GLOBAL coherente (0–100 sobre el total del lote) en vez de
 * 4 barras independientes que terminan en momentos distintos.
 *
 * Si una imagen falla, la función corta ahí mismo (no sube parcial en
 * silencio) — el componente que llama decide cómo informar el error.
 *
 * @param {File[]} archivos                        Archivos originales (sin comprimir)
 * @param {(pct: number) => void} [onProgress]      Progreso global 0–100
 * @returns {Promise<string[]>}                     URLs públicas, mismo orden que `archivos`
 */
export const subirImagenes = async (archivos, onProgress) => {
  const lista  = (archivos || []).filter(Boolean);
  const total  = lista.length;
  const urls   = [];

  if (total === 0) return urls;

  for (let i = 0; i < total; i++) {
    const comprimida = await comprimirImagen(lista[i]);
    // eslint-disable-next-line no-await-in-loop
    const url = await subirImagenImgBB(comprimida, (pctArchivoActual) => {
      // Cada imagen ocupa 1/total del progreso global; dentro de su
      // tramo, avanza según el % real de bytes subidos de ESA imagen.
      const pctGlobal = Math.round(((i + pctArchivoActual / 100) / total) * 100);
      onProgress?.(pctGlobal);
    });
    urls.push(url);
  }

  onProgress?.(100);
  return urls;
};

/**
 * Genera todos los prefijos de búsqueda de un texto (para Firestore array-contains).
 * Ej: "galleta" → ["g", "ga", "gal", "gall", "galle", "gallet", "galleta"]
 *
 * 🔒 Cap en 30 resultados: las reglas de seguridad de Firestore exigen
 * `keywords.size() <= 30`. Sin este límite, un título con varias
 * palabras largas genera más de 30 prefijos y Firestore rechaza el
 * create/update por completo, sin importar que el resto del payload
 * esté bien formado.
 *
 * @param {string} texto
 * @param {number} [maxKeywords=30]
 * @returns {string[]}
 */
export const generarPrefijos = (texto, maxKeywords = 30) => {
  const palabras = (texto || "").toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const prefijos = new Set();
  for (const palabra of palabras) {
    let acumulado = "";
    for (const char of palabra) {
      acumulado += char;
      prefijos.add(acumulado);
    }
  }
  return Array.from(prefijos).slice(0, maxKeywords);
};
