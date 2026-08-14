// api/enviar-push.js
// ============================================================
//  TuCampus — Endpoint serverless de notificaciones push (FCM)
//
//  Vercel Serverless Function (Node.js, runtime gratuito de
//  Vercel). NO usa Firebase Cloud Functions ni requiere el plan
//  Blaze de Firebase: firebase-admin solo se usa acá para llamar
//  a la API de Firebase Cloud Messaging (gratuita, sin límite de
//  envíos, en cualquier plan de Firebase — incluido Spark) y para
//  verificar el ID Token de quien llama (tampoco tiene costo).
//
//  AUTENTICACIÓN: exige `Authorization: Bearer <idToken>` con un
//  ID Token de Firebase Auth vigente — así solo usuarios con
//  sesión real en TuCampus pueden disparar un push. Deliberadamente
//  NO se usa un "API key" fijo: cualquier valor embebido en el
//  bundle del cliente (import.meta.env.VITE_*) es público por
//  definición, así que no sirve como secreto real.
//
//  BODY esperado (JSON):
//    {
//      tokens: string[],     // 1 a 500 tokens FCM (límite de sendEachForMulticast)
//      titulo: string,
//      cuerpo: string,
//      url?:   string,       // ruta a abrir al hacer click (default "/")
//      data?:  object        // payload extra opcional (se castea a string)
//    }
//
//  RESPUESTA (200):
//    { successCount, failureCount, tokensInvalidos: string[] }
//    tokensInvalidos: tokens que FCM reportó como vencidos/borrados
//    — el caller puede usarlos para limpiar /usuarios/{uid}.fcmToken
//    con arrayRemove (no se hace acá para no acoplar este endpoint
//    a la forma del doc de usuario).
//
//  VARIABLES DE ENTORNO — Vercel → Project Settings → Environment
//  Variables (nunca se commitean; ver .env.example):
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY   (tal cual la da la service account JSON,
//                            con los saltos de línea como "\n" literales)
//
//  Se generan en Firebase Console → ⚙️ Configuración del proyecto →
//  Cuentas de servicio → Generar nueva clave privada.
// ============================================================

import admin from "firebase-admin";

// getApps() evita reinicializar el SDK en cada invocación "warm"
// (Vercel reutiliza el mismo proceso entre requests cuando puede).
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel guarda las env vars como una sola línea — los "\n"
      // literales hay que convertirlos de vuelta a saltos de línea reales.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const MAX_TOKENS = 500; // límite duro de admin.messaging().sendEachForMulticast

// Códigos de FCM que significan "este token ya no sirve" (navegador
// desinstaló la PWA, permiso revocado, token vencido, etc.)
const CODIGOS_TOKEN_INVALIDO = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  // ── 1. Autenticación — exige sesión real de TuCampus ─────────
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Falta el header Authorization: Bearer <idToken>." });
  }

  try {
    await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: "Token de sesión inválido o expirado." });
  }

  // ── 2. Validación del body ────────────────────────────────────
  const { tokens, titulo, cuerpo, url, data } = req.body || {};

  const listaTokens = Array.isArray(tokens)
    ? tokens.filter((t) => typeof t === "string" && t.length > 0)
    : [];

  if (listaTokens.length === 0) {
    return res.status(400).json({ error: "'tokens' debe ser un arreglo con al menos un token." });
  }
  if (listaTokens.length > MAX_TOKENS) {
    return res.status(400).json({ error: `Máximo ${MAX_TOKENS} tokens por envío.` });
  }
  if (!titulo || !cuerpo) {
    return res.status(400).json({ error: "'titulo' y 'cuerpo' son obligatorios." });
  }

  const urlDestino = typeof url === "string" && url ? url : "/";

  // FCM exige que el payload `data` sea un mapa de string → string.
  const dataPlano = { url: urlDestino };
  if (data && typeof data === "object") {
    Object.entries(data).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null) dataPlano[clave] = String(valor);
    });
  }

  // ── 3. Envío vía FCM ────────────────────────────────────────────
  try {
    const respuesta = await admin.messaging().sendEachForMulticast({
      tokens: listaTokens,
      notification: {
        title: String(titulo).slice(0, 200),
        body: String(cuerpo).slice(0, 500),
      },
      data: dataPlano,
      webpush: {
        fcmOptions: { link: urlDestino },
      },
    });

    const tokensInvalidos = [];
    respuesta.responses.forEach((r, i) => {
      if (!r.success && CODIGOS_TOKEN_INVALIDO.has(r.error?.code)) {
        tokensInvalidos.push(listaTokens[i]);
      }
    });

    return res.status(200).json({
      successCount: respuesta.successCount,
      failureCount: respuesta.failureCount,
      tokensInvalidos,
    });
  } catch (err) {
    console.error("[api/enviar-push]", err);
    return res.status(500).json({ error: "No se pudo enviar la notificación." });
  }
}