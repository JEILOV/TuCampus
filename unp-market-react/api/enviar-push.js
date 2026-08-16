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
//      url?:    string,      // ruta a abrir al hacer click (default "/")
//      avatar?: string,      // foto de PERFIL de quien origina el evento (chat/reseña)
//                             // → se muestra como `icon`: el círculo chico al costado
//                             //   del mensaje, NUNCA expandido.
//      imagen?: string,      // foto de PRODUCTO (ej. nueva publicación en la sede)
//                             // → se muestra como `image`: la vista previa grande
//                             //   expandida. Acepta también `foto` como alias.
//      data?:  object        // payload extra opcional (se castea a string)
//    }
//
//  🔧 SOLO `data` (payload data-only) — A PROPÓSITO no se manda un
//  bloque `notification` en la raíz ni `webpush.notification`. Si se
//  incluye `notification`, el navegador/OS (sobre todo Android) puede
//  auto-mostrar la notificación con ese payload ADEMÁS de que
//  `onBackgroundMessage` en firebase-messaging-sw.js dispare su propio
//  `showNotification()` — eso es lo que causaba las notificaciones
//  duplicadas. Con `data`-only, `onBackgroundMessage` es la ÚNICA
//  fuente que llama a `showNotification()`, así que solo puede salir
//  una notificación por mensaje. Ver firebase-messaging-sw.js.
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
  const { tokens, titulo, cuerpo, url, avatar, imagen, foto, data } = req.body || {};

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

  // `imagen` es el nombre oficial para la foto de PRODUCTO; `foto`
  // queda como alias porque reviewService/productService ya usan ese
  // nombre de campo en Firestore.
  const imagenPreview =
    typeof imagen === "string" && imagen
      ? imagen
      : typeof foto === "string" && foto
      ? foto
      : undefined;

  // `avatar`: foto de PERFIL de quien origina el evento (chat/reseña).
  // Se muestra como `icon` — el círculo chico, no la imagen expandida.
  const avatarIcono = typeof avatar === "string" && avatar ? avatar : undefined;

  // FCM exige que el payload `data` sea un mapa de string → string.
  // Acá va TODO lo necesario para que firebase-messaging-sw.js arme
  // la notificación a mano (ver nota "SOLO data" más arriba) — título,
  // cuerpo, ícono e imagen expandida viajan como texto plano, nunca
  // como el bloque `notification` nativo de FCM.
  const dataPlano = {};
  if (data && typeof data === "object") {
    Object.entries(data).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null) dataPlano[clave] = String(valor);
    });
  }
  // Las claves reservadas van DESPUÉS del spread de `data` para que
  // nunca puedan ser pisadas por un valor arbitrario del caller.
  dataPlano.url   = urlDestino;
  dataPlano.title = String(titulo).slice(0, 200);
  dataPlano.body  = String(cuerpo).slice(0, 500);
  if (avatarIcono)   dataPlano.icon  = avatarIcono;
  if (imagenPreview) dataPlano.image = imagenPreview;

  // ── 3. Envío vía FCM ────────────────────────────────────────────
  // 🔧 Debug: cantidad de tokens que llegaron en la petición — útil
  // para descartar que el problema sea que notificarPorUid/
  // notificarNuevoProductoEnSede no encontraron tokens y llamaron
  // acá con un arreglo vacío o con menos tokens de los esperados.
  console.log(`[api/enviar-push] tokens recibidos: ${listaTokens.length}`);

  try {
    const respuesta = await admin.messaging().sendEachForMulticast({
      tokens: listaTokens,
      // 🔧 Data-only a propósito — ver nota arriba. `webpush.notification`
      // TAMBIÉN se omite por la misma razón: incluirlo dispara el mismo
      // auto-display que causaba las notificaciones duplicadas.
      data: dataPlano,
      webpush: {
        // fcmOptions.link es inofensivo: solo se usa como fallback si
        // algún cliente maneja el click sin pasar por nuestro
        // notificationclick de firebase-messaging-sw.js — no dispara
        // un showNotification por sí solo.
        fcmOptions: { link: urlDestino },
      },
    });

    // 🔧 Debug: resultado real de FCM — un successCount alto pero sin
    // notificación visible en el dispositivo apunta a un problema de
    // permiso/SW/OS, no del payload; un failureCount alto apunta a
    // tokens vencidos o mal formados.
    console.log(
      `[api/enviar-push] successCount=${respuesta.successCount} failureCount=${respuesta.failureCount}`
    );

    const tokensInvalidos = [];
    if (respuesta.failureCount > 0) {
      const fallos = respuesta.responses
        .map((r, i) => ({ r, token: listaTokens[i] }))
        .filter(({ r }) => !r.success);

      // Detalle de cada fallo: código de error de FCM por token —
      // distingue "token vencido" (esperable, se limpia solo) de un
      // error real (credenciales, payload, cuota, etc.).
      console.log(
        "[api/enviar-push] fallos:",
        fallos.map(({ r, token }) => ({
          token: `${token.slice(0, 12)}…`,
          code: r.error?.code,
          message: r.error?.message,
        }))
      );

      fallos.forEach(({ r, token }) => {
        if (CODIGOS_TOKEN_INVALIDO.has(r.error?.code)) tokensInvalidos.push(token);
      });
    }

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