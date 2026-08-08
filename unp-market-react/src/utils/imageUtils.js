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

const MAX_DIMENSION = 1080;
const CALIDAD_JPEG  = 0.70;
const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

/**
 * Comprime una imagen usando Canvas.
 * Redimensiona a MAX_DIMENSION px en el lado más largo,
 * mantiene el ratio, y exporta como JPEG al 70%.
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
      img.onload   = () => {
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
        // fallback al archivo original si canvas.toBlob devuelve null
        canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", CALIDAD_JPEG);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

/**
 * Sube un Blob/File a ImgBB y devuelve la URL pública.
 * Devuelve "" si no hay archivo.
 *
 * 🔧 Auditoría UI/UX: reescrito con XMLHttpRequest (en vez de fetch) porque
 * fetch no expone eventos de progreso de subida. Esto permite mostrar una
 * barra de progreso real en Publicar.jsx / EditarProducto.jsx en vez de
 * un simple texto "Subiendo..." sin feedback numérico.
 *
 * @param {Blob|File|null} file
 * @param {(porcentaje: number) => void} [onProgress]  Callback 0–100, opcional.
 * @returns {Promise<string>} URL pública de la imagen
 */
export const subirImagenImgBB = (file, onProgress) => {
  if (!file) return Promise.resolve("");

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("image", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          onProgress?.(100);
          resolve(data.data.url);
        } else {
          reject(new Error("ImgBB rechazó la imagen"));
        }
      } catch {
        reject(new Error("Respuesta inválida de ImgBB"));
      }
    };

    xhr.onerror = () => reject(new Error("Error de red al subir la imagen"));
    xhr.send(formData);
  });
};

/**
 * Genera todos los prefijos de búsqueda de un texto (para Firestore array-contains).
 * Ej: "galleta" → ["g", "ga", "gal", "gall", "galle", "gallet", "galleta"]
 *
 * @param {string} texto
 * @returns {string[]}
 */
export const generarPrefijos = (texto) => {
  const palabras = (texto || "").toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const prefijos = new Set();
  palabras.forEach((palabra) => {
    let acumulado = "";
    for (const char of palabra) {
      acumulado += char;
      prefijos.add(acumulado);
    }
  });
  return Array.from(prefijos);
};