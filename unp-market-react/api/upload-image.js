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
//  devuelve un JSON con detalle (nunca un crash opaco
//  FUNCTION_INVOCATION_FAILED sin información), lo que hace el
//  problema diagnosticable con solo mirar la respuesta de la
//  Network tab, sin tener que ir a buscar logs de Vercel.
//
//  BODY esperado (JSON): { imageBase64: string }
//  RESPUESTA (200): { url: string }
//
//  VARIABLE DE ENTORNO — Vercel → Project Settings → Environment
//  Variables → IMGBB_API_KEY (sin prefijo VITE_)
// ============================================================

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Método no permitido. Usa POST." });
    }

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      console.error("[api/upload-image] Falta IMGBB_API_KEY en las variables de entorno de Vercel.");
      return res.status(500).json({ error: "El servidor no tiene configurada la subida de imágenes (falta IMGBB_API_KEY)." });
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

    if (typeof fetch !== "function") {
      console.error("[api/upload-image] 'fetch' no está disponible en este runtime de Node.");
      return res.status(500).json({ error: "El servidor no tiene 'fetch' disponible (versión de Node desactualizada)." });
    }

    const form = new URLSearchParams();
    form.append("image", imageBase64);

    // 🔧 Timeout propio de 8s (< los 10s duros del plan Hobby). Por qué
    // hace falta: si ImgBB responde lento (o no responde), sin esto la
    // plataforma de Vercel mata la función entera a los 10s con un 504
    // SIN body — el cliente recibe una página de error, no el JSON de
    // este catch, y ve un mensaje genérico sin poder distinguir qué pasó.
    // Con este AbortSignal, SIEMPRE respondemos nosotros primero, con un
    // 504 limpio y un `code` que el cliente puede usar para un mensaje
    // específico (ver imageUtils.subirImagenImgBB).
    let respuestaImgBB;
    try {
      respuestaImgBB = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
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
    // 🔒 Última red de seguridad: cualquier excepción no prevista
    // (incluyendo errores de sintaxis en tiempo de ejecución,
    // problemas de red, etc.) termina aquí en vez de tumbar la
    // función sin explicación.
    console.error("[api/upload-image] Error inesperado:", err);
    return res.status(500).json({
      error: "Error inesperado en el servidor de imágenes.",
      detalle: err?.message || String(err),
    });
  }
}