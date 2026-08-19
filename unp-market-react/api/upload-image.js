// api/upload-image.js
// ============================================================
//  TuCampus — Proxy serverless hacia ImgBB
//
//  POR QUÉ EXISTE: ImgBB no garantiza headers CORS consistentes
//  para llamadas directas desde el navegador en dominios de
//  producción (falla con "blocked by CORS policy" en
//  www.tucampus.net.pe aunque funcione en localhost). La única
//  forma confiable de evitarlo es que el navegador le hable a
//  NUESTRO dominio (mismo origin, sin CORS) y que sea el
//  servidor — no el navegador — quien llame a ImgBB
//  (server-to-server, CORS no aplica ahí).
//
//  BONUS DE SEGURIDAD: la API key de ImgBB deja de viajar en el
//  bundle del cliente (antes era VITE_IMGBB_API_KEY, visible para
//  cualquiera que abra el DevTools). Ahora vive SOLO en el
//  servidor como IMGBB_API_KEY (sin prefijo VITE_).
//
//  BODY esperado (JSON):
//    { imageBase64: string }   // base64 SIN el prefijo "data:image/...;base64,"
//
//  RESPUESTA (200):
//    { url: string }           // URL pública de la imagen en ImgBB
//
//  VARIABLE DE ENTORNO — Vercel → Project Settings → Environment
//  Variables:
//    IMGBB_API_KEY   (la misma que tenías en VITE_IMGBB_API_KEY;
//                     puedes eliminar la variable VITE_ una vez
//                     migrado, ya no se usa desde el cliente)
// ============================================================

export const config = {
  api: {
    // Imágenes comprimidas a 1080px caben cómodas en base64 dentro
    // de este límite; súbelo si algún caso legítimo lo requiere.
    bodyParser: { sizeLimit: "8mb" },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    console.error("[api/upload-image] Falta IMGBB_API_KEY en las variables de entorno de Vercel.");
    return res.status(500).json({ error: "El servidor no tiene configurada la subida de imágenes." });
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return res.status(400).json({ error: "Falta 'imageBase64' (string) en el body." });
  }

  try {
    const form = new URLSearchParams();
    form.append("image", imageBase64);

    const respuestaImgBB = await fetch(https://api.imgbb.com/1/upload?key=${apiKey}, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    const data = await respuestaImgBB.json().catch(() => null);

    if (!respuestaImgBB.ok || !data?.success) {
      console.error("[api/upload-image] ImgBB rechazó la imagen:", respuestaImgBB.status, data);
      return res.status(502).json({ error: "ImgBB rechazó la imagen." });
    }

    return res.status(200).json({ url: data.data.url });
  } catch (err) {
    console.error("[api/upload-image] Error de red hacia ImgBB:", err);
    return res.status(502).json({ error: "No se pudo conectar con ImgBB." });
  }
}
