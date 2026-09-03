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

// Carga un <img> desde una blob: URL. A diferencia de FileReader.readAsDataURL
// (copia el archivo entero a memoria como base64 antes de decodificar) y de
// createImageBitmap(file) directo sobre el File crudo (en Chrome/Android falla
// con frecuencia cuando el File viene de un descriptor virtual de galería/nube
// — Google Photos/Pinterest), URL.createObjectURL deja que el propio pipeline
// de red/decodificación de imágenes del navegador maneje el archivo por
// streaming. Es el camino documentado como más robusto para este caso puntual.
//
// img.onerror solo entrega un Event genérico (no un Error con detalle real),
// así que el mensaje que arma este helper ya es lo más específico que el
// navegador permite saber en este punto.
const cargarImagenDesdeObjectUrl = (objectUrl) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () =>
      reject(new Error("El navegador no pudo decodificar la imagen (formato no soportado o archivo corrupto/incompleto)"));
    img.src = objectUrl;
  });

// 🔧 CAUSA RAÍZ del fallo que persistía incluso con fotos de cámara normales:
// URL.createObjectURL(file) registra la blob: URL con el `type` que trae el
// objeto File — y en Android ese `type` viene vacío o incorrecto con bastante
// frecuencia (ciertos intents de cámara no setean MIME; archivos guardados
// desde Pinterest/Google Photos igual). Con el type "en blanco", Chrome no
// sabe qué decodificar y el <img> revienta en onerror aunque los bytes sean
// un JPEG perfectamente válido — pasa lo mismo con foto de cámara o de
// Pinterest porque el bug no depende del origen de la imagen, depende de
// que el File llegue con metadata de tipo poco confiable.
//
// Fix: NO confiamos en file.type. Leemos los primeros bytes del archivo y
// detectamos el formato real por firma binaria (magic number) — así el
// Blob que se usa para el object URL siempre lleva el MIME correcto,
// sin importar lo que haya declarado el sistema operativo o el picker.
const detectarMimeReal = (bytes) => {
  const b = new Uint8Array(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // "WEBP"
  ) return "image/webp";
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  return null; // firma no reconocida — se usa el fallback más abajo
};

// Rearma el archivo como un Blob con el MIME correcto (detectado por bytes,
// no por metadata). Si por lo que sea no se puede ni leer la cabecera,
// se sigue con el File original tal cual — no rompe el flujo por esto.
const normalizarMimeArchivo = async (file) => {
  try {
    const cabecera = await file.slice(0, 12).arrayBuffer();
    const mimeReal = detectarMimeReal(cabecera);
    if (!mimeReal) return file; // firma desconocida: no forzamos un tipo a ciegas
    if (mimeReal === file.type) return file; // ya venía correcto, no hace falta copiar bytes
    return new Blob([file], { type: mimeReal });
  } catch (err) {
    console.warn("[imageUtils] No se pudo sniffear el MIME real del archivo, se usa el original:", err);
    return file;
  }
};

/**
 * Decodifica un File a una fuente dibujable en canvas (ImageBitmap o
 * HTMLImageElement, ambos exponen .width/.height y son válidos para
 * drawImage()), blindada contra fallos transitorios de lectura.
 *
 * Camino primario: URL.createObjectURL(file) + <img>. Se prefiere sobre
 * createImageBitmap(file) directo o FileReader.readAsDataURL porque ambos
 * exigen leer los bytes completos del File de una sola vez en JS — que es
 * justo donde Android revienta con archivos "stub" (recién sincronizados
 * desde Google Photos/Pinterest, aún bloqueados o incompletos en el storage
 * del sistema). Con una blob: URL, es el propio motor del navegador el que
 * hace streaming del archivo, con su manejo nativo de reintentos/bloqueos.
 *
 * Una vez que el <img> cargó bien, SI el navegador soporta createImageBitmap
 * se lo pasamos a ÉL (no al File crudo) para aprovechar la decodificación
 * acelerada — pero como fuente ya es un <img> válido, si esto fallara no es
 * crítico: seguimos usando el propio <img> para dibujar en canvas.
 *
 * Reintenta hasta REINTENTOS_LECTURA veces con espera creciente — el
 * bloqueo del archivo suele ser cuestión de milisegundos mientras el
 * sistema termina de materializarlo.
 *
 * Si se agotan los reintentos, propaga el ERROR NATIVO real
 * (`nombre: mensaje`) en vez de un mensaje genérico — así el toast en
 * producción dice exactamente qué está fallando en el celular del usuario.
 *
 * @param {File} file
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
const decodificarImagen = async (file) => {
  let ultimoError;

  // Se normaliza UNA sola vez fuera del loop — leer 12 bytes es barato,
  // pero no hay razón para repetirlo en cada reintento.
  const archivoConMimeReal = await normalizarMimeArchivo(file);

  for (let intento = 1; intento <= REINTENTOS_LECTURA; intento++) {
    const objectUrl = URL.createObjectURL(archivoConMimeReal);
    try {
      // eslint-disable-next-line no-await-in-loop
      const img = await cargarImagenDesdeObjectUrl(objectUrl);

      if (typeof createImageBitmap === "function") {
        try {
          // eslint-disable-next-line no-await-in-loop
          return await createImageBitmap(img);
        } catch {
          // createImageBitmap falló sobre un <img> que YA cargó bien —
          // no es el fallo que nos ocupa, seguimos con el <img> mismo.
          return img;
        }
      }
      return img;
    } catch (err) {
      ultimoError = err;
      // 🔧 Diagnóstico real (no a ciegas): si vuelve a fallar, esto queda
      // en la consola del celular con lo que SÍ sabemos del archivo —
      // tipo original vs. detectado, tamaño, nombre — para poder pedirle
      // al usuario ese log si el toast solo no alcanza para diagnosticar.
      console.warn(
        `[imageUtils] Intento ${intento}/${REINTENTOS_LECTURA} falló al decodificar "${file.name}" ` +
          `(type original: "${file.type}", tamaño: ${file.size} bytes):`,
        err,
      );
      if (intento < REINTENTOS_LECTURA) {
        // eslint-disable-next-line no-await-in-loop
        await esperar(ESPERA_BASE_MS * intento);
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const detalle = ultimoError
    ? `${ultimoError.name || "Error"}: ${ultimoError.message || ultimoError}`
    : "causa desconocida";
  throw new Error(`No se pudo leer el archivo (${detalle})`);
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