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

// 🔧 Techo duro de tamaño (bytes), además del control por dimensión y
// calidad de arriba. Por qué hace falta un techo aparte: dimensión +
// calidad fijas no garantizan un tamaño final acotado — una foto con
// mucho detalle (textura, ruido, muchos colores) puede seguir pesando
// varios MB incluso a 1080px/70%. Sin este techo, esas fotos puntuales
// son justamente las que arriesgan pegarle al límite de payload de
// Vercel (4.5MB) y, más importante en la práctica, tardan más en subir
// por una red móvil lenta — aumentando el riesgo de pegarle al timeout
// de 10s del plan Hobby. 900KB deja margen de sobra bajo ambos límites.
const TAMANO_MAXIMO_BYTES = 900 * 1024;
// Pasadas extra de recompresión si la primera sigue pesando de más —
// cada pasada baja la calidad; ambas reusan el MISMO canvas ya
// dibujado (canvas.toBlob de nuevo), así que son baratas: no hay que
// re-decodificar ni re-dibujar la imagen original.
const PASADAS_RECOMPRESION = [0.5, 0.35];

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

// Versión promisificada de canvas.toBlob — evita repetir el mismo
// patrón callback en cada pasada de recompresión.
const toBlobAsync = (canvas, formato, calidad) =>
  new Promise((resolve) => canvas.toBlob(resolve, formato, calidad));

// 🔧 Lectura blindada del archivo — ver contexto completo en
// decodificarImagen() más abajo. Reintentos breves + backoff lineal
// para tolerar archivos en sincronización (Google Photos/Pinterest en
// Android) que fallan de forma transitoria al leer sus bytes.
const REINTENTOS_LECTURA = 3;
const ESPERA_BASE_MS = 300; // backoff lineal: 300ms, 600ms entre intentos

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fallback clásico: FileReader → data URL → <img>. Se mantiene tal
// cual estaba antes (era el único camino), ahora como pieza reutilizable
// que decodificarImagen() reintenta igual que a createImageBitmap.
const leerConFileReader = (file) =>
  new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload  = (e) => {
      const img   = new Image();
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.onload  = () => resolve(img);
      img.src     = e.target.result;
    };
    reader.readAsDataURL(file);
  });

/**
 * Decodifica un File a una fuente dibujable en canvas (ImageBitmap o
 * HTMLImageElement, ambos exponen .width/.height y son válidos para
 * drawImage()), blindada contra fallos transitorios de lectura.
 *
 * Camino primario: createImageBitmap(file) decodifica directo desde
 * los bytes crudos del archivo — no pasa por FileReader.readAsDataURL
 * ni por el <img> del DOM, que es justo donde Android revienta con
 * archivos "stub" (recién sincronizados desde Google Photos/Pinterest,
 * aún bloqueados o incompletos en el storage del sistema). Además no
 * depende del MIME type/extensión declarados y soporta WebP/AVIF.
 *
 * Cada camino reintenta hasta REINTENTOS_LECTURA veces con una espera
 * creciente entre intentos — el bloqueo suele ser cuestión de
 * milisegundos mientras el sistema termina de materializar el archivo.
 *
 * Fallback: si createImageBitmap no existe (Safari viejo) o agota sus
 * reintentos, se cae a FileReader + Image (el único camino que existía
 * antes), también con reintentos propios por si el fallo no era
 * específico de createImageBitmap sino del archivo en sí.
 *
 * @param {File} file
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
const decodificarImagen = async (file) => {
  if (typeof createImageBitmap === "function") {
    for (let intento = 1; intento <= REINTENTOS_LECTURA; intento++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await createImageBitmap(file);
      } catch {
        if (intento < REINTENTOS_LECTURA) {
          // eslint-disable-next-line no-await-in-loop
          await esperar(ESPERA_BASE_MS * intento);
        }
        // último intento agotado → cae al fallback de abajo, no al reject
      }
    }
  }

  let ultimoError;
  for (let intento = 1; intento <= REINTENTOS_LECTURA; intento++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await leerConFileReader(file);
    } catch (err) {
      ultimoError = err;
      if (intento < REINTENTOS_LECTURA) {
        // eslint-disable-next-line no-await-in-loop
        await esperar(ESPERA_BASE_MS * intento);
      }
    }
  }
  // Agotados ambos caminos y todos los reintentos: el archivo
  // realmente no se puede leer (no es un bloqueo transitorio).
  throw ultimoError || new Error("No se pudo leer el archivo");
};

/**
 * Comprime una imagen usando Canvas.
 * Redimensiona a MAX_DIMENSION px en el lado más largo, mantiene el
 * ratio, y exporta en el formato más liviano disponible: WebP si el
 * navegador lo soporta (~25-35% más liviano que JPEG a calidad
 * visual equivalente), o JPEG al 70% como fallback universal.
 *
 * Si el resultado sigue superando TAMANO_MAXIMO_BYTES (fotos con
 * mucho detalle/ruido que no bajan de peso solo con la calidad base),
 * reintenta con las calidades de PASADAS_RECOMPRESION sobre el MISMO
 * canvas ya dibujado — sin volver a decodificar ni redibujar la
 * imagen original, así que cada pasada extra es barata incluso en
 * un celular de gama baja.
 *
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export const comprimirImagen = async (file) => {
  const source = await decodificarImagen(file);

  let { width, height } = source; // ImageBitmap y HTMLImageElement exponen ambos .width/.height

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
  canvas.getContext("2d").drawImage(source, 0, 0, width, height);

  // Los ImageBitmap retienen memoria de decodificación hasta que se
  // liberan explícitamente (a diferencia de <img>, que el GC recicla
  // solo) — ya volcamos los píxeles al canvas, así que se puede cerrar.
  if (typeof source.close === "function") source.close();

  const usarWebp = await soportaWebp();
  const formato   = usarWebp ? "image/webp" : "image/jpeg";
  const calidad   = usarWebp ? CALIDAD_WEBP : CALIDAD_JPEG;

  let blob = await toBlobAsync(canvas, formato, calidad);

  // 🔧 Recompresión defensiva: la foto sigue pesando más de lo
  // esperado a la calidad base — probamos calidades más bajas
  // sobre el mismo canvas hasta entrar bajo el techo, o hasta
  // agotar los intentos (nos quedamos con la última pasada aunque
  // no haya bajado del todo — nunca es peor que el original).
  for (const calidadMenor of PASADAS_RECOMPRESION) {
    if (!blob || blob.size <= TAMANO_MAXIMO_BYTES) break;
    // eslint-disable-next-line no-await-in-loop
    blob = await toBlobAsync(canvas, formato, calidadMenor);
  }

  // fallback al archivo original si canvas.toBlob devuelve null
  return blob ?? file;
};

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

    // 🔧 Techo de tiempo del lado del cliente. Por qué hace falta además
    // del timeout que ya pusimos en el servidor (ver api/upload-image.js):
    // ese timeout protege lo que pasa DENTRO de la función serverless,
    // pero si la red móvil del usuario es tan lenta que el request ni
    // siquiera termina de LLEGAR a Vercel, el cliente se queda esperando
    // indefinidamente sin este límite. 20s da margen sobre el límite de
    // 10s de Vercel (Hobby) + tiempo de subida real en una red lenta.
    xhr.timeout = 20000;

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      // 🔧 413/502/504 pueden venir directo de la plataforma de Vercel
      // (payload demasiado grande, o la función excedió su tiempo
      // máximo) — en esos casos NO hay body JSON que parsear (es una
      // página de error de la plataforma), así que se resuelven por
      // status ANTES de intentar JSON.parse, con un `code` explícito
      // que el llamador puede usar para mostrar un mensaje específico.
      if (xhr.status === 413) {
        reject(Object.assign(new Error("La imagen es demasiado pesada para subir."), { code: "PAYLOAD_TOO_LARGE" }));
        return;
      }
      if (xhr.status === 502 || xhr.status === 504) {
        reject(Object.assign(new Error("La subida tardó demasiado. Intenta de nuevo."), { code: "UPLOAD_TIMEOUT" }));
        return;
      }

      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          onProgress?.(100);
          resolve(data.url);
        } else {
          // Nuestro propio servidor puede devolver un `code` (p. ej.
          // IMGBB_TIMEOUT) — se propaga tal cual si viene.
          reject(Object.assign(new Error(data?.error || "No se pudo subir la imagen"), { code: data?.code || "SERVER_ERROR" }));
        }
      } catch {
        reject(Object.assign(new Error("Respuesta inválida del servidor de imágenes"), { code: "SERVER_ERROR" }));
      }
    };

    xhr.onerror   = () => reject(Object.assign(new Error("Error de red al subir la imagen"), { code: "NETWORK_ERROR" }));
    xhr.ontimeout = () => reject(Object.assign(new Error("La subida tardó demasiado. Verifica tu conexión."), { code: "UPLOAD_TIMEOUT" }));

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