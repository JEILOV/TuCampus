// api/upload-image.js
// ============================================================
//  TuCampus — Proxy serverless hacia ImgBB
//
//  POR QUÉ EXISTE: ImgBB no garantiza headers CORS consistentes
//  para llamadas directas desde el navegador en dominios de
//  producción. La única forma confiable de evitarlo es que el
//  navegador le hable a NUESTRO dominio (mismo origin, sin CORS)
//  y que sea el servidor quien llame a ImgBB (server-to-server).
//
//  🔧 BLINDAJE: TODO el handler vive dentro de un único try/catch
//  que envuelve incluso el acceso a req.body y las variables de
//  entorno. Así, cualquier fallo — sea el que sea — siempre
//  devuelve un JSON (nunca un crash opaco FUNCTION_INVOCATION_FAILED).
//
//  BODY esperado (JSON): { imageBase64: string }
//  RESPUESTA (200): { url: string }
//
//  VARIABLE DE ENTORNO — Vercel → Project Settings → Environment
//  Variables → IMGBB_API_KEY (sin prefijo VITE_)
// ============================================================

import { obtenerAdmin, autenticarEstudiante } from "../lib/serverAuth.js";

// En src/utils/imageUtils.js los 900 KB son un objetivo de compresión, no una garantía:
// tras las pasadas de recompresión la foto puede seguir pesando más, y si canvas.toBlob
// falla se sube el archivo original. 3_500_000 caracteres (~2.6 MB de imagen binaria)
// da margen real a esas fotos y queda por debajo del límite de 4.5 MB de cuerpo de Vercel.
export const MAX_BASE64_CHARS = 3_500_000;

// Límite de subidas por usuario (ventana móvil fija de 1 hora en limitesApi/upload_${uid})
export const VENTANA_LIMITE_MS = 60 * 60 * 1000;
export const MAX_SUBIDAS_POR_HORA = 60;

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Valida que la cadena base64 corresponda a JPEG, PNG, GIF o WebP
 * decodificando únicamente los primeros bytes (sin cargar toda la imagen).
 */
export const tieneFirmaImagenValida = (base64Limpio) => {
  if (
    typeof base64Limpio !== "string" ||
    base64Limpio.length < 16 ||
    !BASE64_REGEX.test(base64Limpio)
  ) {
    return false;
  }

  // 24 caracteres base64 equivalen exactamente a los primeros 18 bytes binarios
  const muestra = base64Limpio.slice(0, 24);
  const header = Buffer.from(muestra, "base64");
  if (header.length < 4) return false;

  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return true;
  }

  // GIF: "GIF8"
  if (header.subarray(0, 4).toString("ascii") === "GIF8") {
    return true;
  }

  // WebP: "RIFF" en 0..3 y "WEBP" en 8..11
  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString("ascii") === "RIFF" &&
    header.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return true;
  }

  return false;
};

/**
 * Verifica e incrementa el contador por hora del usuario en limitesApi/upload_${uid}.
 * Si Firestore falla, registra el error y permite continuar (fail open).
 */
const verificarLimiteSubida = async (uid) => {
  try {
    const admin = obtenerAdmin();
    const db = admin.firestore();
    const ref = db.collection("limitesApi").doc(`upload_${uid}`);
    const ahora = Date.now();

    const permitido = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const datos = snap.exists ? snap.data() : null;
      const inicio = typeof datos?.inicio === "number" ? datos.inicio : 0;
      const conteo = typeof datos?.conteo === "number" ? datos.conteo : 0;

      if (!snap.exists || ahora - inicio > VENTANA_LIMITE_MS) {
        tx.set(ref, { inicio: ahora, conteo: 1 });
        return true;
      }

      if (conteo >= MAX_SUBIDAS_POR_HORA) {
        return false;
      }

      tx.set(ref, { inicio, conteo: conteo + 1 });
      return true;
    });

    return permitido;
  } catch (err) {
    console.error(
      "[api/upload-image] Error al verificar rate limit en Firestore (fail open):",
      err
    );
    return true;
  }
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Método no permitido. Usa POST." });
    }

    // a) Autenticación institucional obligatoria
    const authRes = await autenticarEstudiante(req);
    if (!authRes.ok) {
      return res.status(authRes.status).json({ error: authRes.error });
    }

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      console.error("[api/upload-image] Falta IMGBB_API_KEY en las variables de entorno de Vercel.");
      return res.status(500).json({ error: "El servidor no tiene configurada la subida de imágenes." });
    }

    // 🔧 Blindaje extra: en funciones Node de Vercel fuera de
    // Next.js, req.body puede llegar ya parseado (objeto) o como
    // string JSON crudo dependiendo del runtime — cubrimos ambos
    // casos en vez de asumir uno solo.
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "El body no es JSON válido." });
      }
    }
    const { imageBase64 } = body || {};

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Falta 'imageBase64' (string) en el body." });
    }

    // b) Límite de tamaño en base64
    if (imageBase64.length > MAX_BASE64_CHARS) {
      return res.status(413).json({
        error: "La imagen es demasiado pesada para subir.",
        code: "PAYLOAD_TOO_LARGE",
      });
    }

    // c) Validación de formato base64 y firma mágica (JPEG, PNG, GIF, WebP)
    const base64Limpio = imageBase64.replace(/^data:[^;]+;base64,/, "").trim();
    if (!tieneFirmaImagenValida(base64Limpio)) {
      return res.status(400).json({ error: "El archivo no es una imagen válida" });
    }

    // e) Rate limit por usuario (60 subidas / hora, fail open si Firestore falla)
    const dentroDelLimite = await verificarLimiteSubida(authRes.uid);
    if (!dentroDelLimite) {
      return res.status(429).json({
        error: "Has alcanzado el límite de 60 imágenes por hora. Intenta más tarde.",
        code: "RATE_LIMITED",
      });
    }

    if (typeof fetch !== "function") {
      console.error("[api/upload-image] 'fetch' no está disponible en este runtime de Node.");
      return res.status(500).json({ error: "Error inesperado en el servidor de imágenes." });
    }

    // d) API key enviada en el body del formulario (nunca en la URL)
    const form = new URLSearchParams();
    form.append("key", apiKey);
    form.append("image", base64Limpio);

    // 🔧 Timeout propio de 8s (< los 10s duros del plan Hobby).
    let respuestaImgBB;
    try {
      respuestaImgBB = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr) {
      if (fetchErr?.name === "TimeoutError" || fetchErr?.name === "AbortError") {
        console.error("[api/upload-image] Timeout esperando respuesta de ImgBB (>8s).");
        return res.status(504).json({ error: "ImgBB tardó demasiado en responder.", code: "IMGBB_TIMEOUT" });
      }
      throw fetchErr; // cualquier otro fallo de red cae al catch general de abajo
    }

    const data = await respuestaImgBB.json().catch(() => null);

    if (!respuestaImgBB.ok || !data?.success) {
      console.error("[api/upload-image] ImgBB rechazó la imagen:", respuestaImgBB.status, data);
      return res.status(502).json({ error: "ImgBB rechazó la imagen.", code: "IMGBB_REJECTED" });
    }

    return res.status(200).json({ url: data.data.url });
  } catch (err) {
    // f) El 500 genérico NO expone err.message ni detalle interno al cliente
    console.error("[api/upload-image] Error inesperado:", err);
    return res.status(500).json({
      error: "Error inesperado en el servidor de imágenes.",
    });
  }
}
