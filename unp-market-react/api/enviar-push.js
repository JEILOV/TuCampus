// api/enviar-push.js
// ============================================================
//  TuCampus — Endpoint serverless de notificaciones push (FCM)
//
//  AUTENTICACIÓN Y AUTORIZACIÓN EN SERVIDOR (FASE 4):
//  - Exige `Authorization: Bearer <idToken>` de un estudiante con
//    correo verificado y dominio institucional permitido (lib/serverAuth.js).
//  - El cliente NUNCA envía tokens destino, título, cuerpo, URL ni
//    imágenes. Solo envía `{ tipo, ...referencias }` y el servidor
//    verifica en Firestore que el evento exista, pertenezca a quien
//    llama y sea reciente antes de construir el payload y leer los
//    `fcmToken` de los destinatarios.
//
//  🔧 SOLO `data` (payload data-only) — A PROPÓSITO no se manda un
//  bloque `notification` en la raíz ni `webpush.notification` para
//  evitar notificaciones duplicadas con firebase-messaging-sw.js.
// ============================================================

import { obtenerAdmin, autenticarEstudiante } from "../lib/serverAuth.js";

const MAX_TOKENS = 500; // límite duro de admin.messaging().sendEachForMulticast
const MAX_USUARIOS_CAMPUS = 300;
const VENTANA_MENSAJE_MS = 2 * 60 * 1000;  // 2 minutos
const VENTANA_RESENA_MS  = 2 * 60 * 1000;  // 2 minutos
const VENTANA_PRODUCTO_MS = 5 * 60 * 1000; // 5 minutos

// Tope por usuario para notificaciones masivas de tipo "producto" (3 por hora)
export const VENTANA_LIMITE_PRODUCTO_MS = 60 * 60 * 1000;
export const MAX_PUSH_PRODUCTO_POR_HORA = 3;

// Campos del contrato viejo que ya no se aceptan desde el cliente
const CAMPOS_CONTRATO_VIEJO = [
  "tokens",
  "titulo",
  "cuerpo",
  "url",
  "avatar",
  "imagen",
  "foto",
];

// Códigos de FCM que significan "este token ya no sirve"
const CODIGOS_TOKEN_INVALIDO = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

const extraerMillis = (valor) => {
  if (!valor) return NaN;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === "number") return valor;
  if (typeof valor._seconds === "number") return valor._seconds * 1000;
  if (typeof valor.seconds === "number") return valor.seconds * 1000;
  return NaN;
};

const esReciente = (timestampFirestore, maxAntiguedadMs) => {
  const ms = extraerMillis(timestampFirestore);
  if (!Number.isFinite(ms)) return false;
  const edad = Date.now() - ms;
  // Permite hasta 60s de desfase de reloj hacia adelante
  return edad >= -60000 && edad <= maxAntiguedadMs;
};

const sanitizarHttpsUrl = (posibleUrl) => {
  if (typeof posibleUrl !== "string") return undefined;
  const limpia = posibleUrl.trim();
  return limpia.startsWith("https://") ? limpia : undefined;
};

const sanitizarRutaRelativa = (ruta) => {
  if (typeof ruta !== "string" || !ruta.startsWith("/")) return "/";
  return ruta;
};

const obtenerClaveHoraActual = () =>
  new Date().toISOString().slice(0, 13).replace(/[-T]/g, "");

const esErrorYaExiste = (err) =>
  err?.code === 6 ||
  err?.code === "already-exists" ||
  /already exists/i.test(err?.message || "");

/**
 * Verifica e incrementa el tope horario de pushes de producto en limitesApi/pushProducto_${uid}.
 * Si Firestore falla, registra el error y deja pasar (fail open).
 */
const verificarLimitePushProducto = async (db, uid) => {
  try {
    const ref = db.collection("limitesApi").doc(`pushProducto_${uid}`);
    const ahora = Date.now();

    const permitido = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const datos = snap.exists ? snap.data() : null;
      const inicio = typeof datos?.inicio === "number" ? datos.inicio : 0;
      const conteo = typeof datos?.conteo === "number" ? datos.conteo : 0;

      if (!snap.exists || ahora - inicio > VENTANA_LIMITE_PRODUCTO_MS) {
        tx.set(ref, { inicio: ahora, conteo: 1 });
        return true;
      }

      if (conteo >= MAX_PUSH_PRODUCTO_POR_HORA) {
        return false;
      }

      tx.set(ref, { inicio, conteo: conteo + 1 });
      return true;
    });

    return permitido;
  } catch (err) {
    console.error(
      "[api/enviar-push] Error al verificar límite de push de producto (fail open):",
      err
    );
    return true;
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  try {
    // a) Autenticación institucional obligatoria
    const authRes = await autenticarEstudiante(req);
    if (!authRes.ok) {
      return res.status(authRes.status).json({ error: authRes.error });
    }
    const { uid } = authRes;

    // Parsear body de forma segura
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "El body no es JSON válido." });
      }
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Solicitud inválida." });
    }

    // Rechazar contrato antiguo (tokens, titulo, cuerpo, url, avatar, imagen, foto)
    for (const campoProhibido of CAMPOS_CONTRATO_VIEJO) {
      if (campoProhibido in body) {
        return res.status(400).json({
          error: "Formato de solicitud no permitido.",
        });
      }
    }

    const { tipo } = body;
    if (tipo !== "mensaje" && tipo !== "resena" && tipo !== "producto") {
      return res.status(400).json({ error: "Tipo de notificación inválido." });
    }

    const admin = obtenerAdmin();
    const db = admin.firestore();

    // Leer perfil del remitente desde el servidor
    const remitenteSnap = await db.collection("usuarios").doc(uid).get();
    const remitenteData = remitenteSnap.exists ? remitenteSnap.data() : {};
    const nombreRemitente =
      typeof remitenteData?.nombre === "string" && remitenteData.nombre.trim()
        ? remitenteData.nombre.trim().slice(0, 100)
        : "Estudiante";
    const avatarRemitente = sanitizarHttpsUrl(remitenteData?.avatar);

    let titulo = "";
    let cuerpo = "";
    let urlDestino = "/";
    let iconUrl;
    let imageUrl;
    let claveDedup = "";
    let docsDestinatarios = [];

    // b) tipo === "mensaje"
    if (tipo === "mensaje") {
      const { chatId, mensajeId } = body;
      if (
        typeof chatId !== "string" ||
        !chatId.trim() ||
        typeof mensajeId !== "string" ||
        !mensajeId.trim()
      ) {
        return res.status(400).json({
          error: "Faltan 'chatId' o 'mensajeId' válidos.",
        });
      }

      const chatSnap = await db.collection("chats").doc(chatId).get();
      if (!chatSnap.exists) {
        return res.status(404).json({ error: "La conversación no existe." });
      }

      const chatData = chatSnap.data() || {};
      const participantes = Array.isArray(chatData.participantes)
        ? chatData.participantes
        : [];
      if (!participantes.includes(uid)) {
        return res.status(403).json({
          error: "No perteneces a esta conversación.",
        });
      }

      const msgSnap = await db
        .collection("chats")
        .doc(chatId)
        .collection("mensajes")
        .doc(mensajeId)
        .get();
      if (!msgSnap.exists) {
        return res.status(404).json({ error: "El mensaje no existe." });
      }

      const msgData = msgSnap.data() || {};
      if (msgData.deUid !== uid) {
        return res.status(403).json({
          error: "Solo el autor del mensaje puede solicitar esta notificación.",
        });
      }

      if (!esReciente(msgData.fecha, VENTANA_MENSAJE_MS)) {
        return res.status(400).json({
          error: "El mensaje es demasiado antiguo para enviar notificación.",
        });
      }

      const otroUid = participantes.find((p) => p !== uid);
      if (!otroUid) {
        return res.status(200).json({ omitido: true });
      }

      const destSnap = await db.collection("usuarios").doc(otroUid).get();
      if (destSnap.exists) {
        docsDestinatarios = [{ uid: otroUid, data: destSnap.data() || {} }];
      }

      titulo = nombreRemitente;
      cuerpo =
        msgData.tipo === "imagen"
          ? "📷 Imagen"
          : String(msgData.texto || "").slice(0, 100);
      urlDestino = sanitizarRutaRelativa(
        `/chat?id=${encodeURIComponent(chatId)}`
      );
      iconUrl = avatarRemitente;
      claveDedup = `m_${chatId}_${mensajeId}`;
    }

    // c) tipo === "resena"
    if (tipo === "resena") {
      const { vendedorUid } = body;
      if (typeof vendedorUid !== "string" || !vendedorUid.trim()) {
        return res.status(400).json({
          error: "Falta 'vendedorUid' válido.",
        });
      }
      if (vendedorUid === uid) {
        return res.status(400).json({
          error: "No puedes notificarte una reseña a ti mismo.",
        });
      }

      const resenaId = `${uid}_${vendedorUid}`;
      const resenaSnap = await db.collection("resenas").doc(resenaId).get();
      if (!resenaSnap.exists) {
        return res.status(404).json({ error: "La reseña no existe." });
      }

      const resenaData = resenaSnap.data() || {};
      if (
        resenaData.autorUid !== uid ||
        resenaData.vendedorUid !== vendedorUid
      ) {
        return res.status(403).json({
          error: "No eres el autor de esta reseña.",
        });
      }

      const fechaRef = resenaData.fechaEdicion || resenaData.fecha;
      if (!esReciente(fechaRef, VENTANA_RESENA_MS)) {
        return res.status(400).json({
          error: "La reseña es demasiado antigua para enviar notificación.",
        });
      }

      const destSnap = await db.collection("usuarios").doc(vendedorUid).get();
      if (destSnap.exists) {
        docsDestinatarios = [{ uid: vendedorUid, data: destSnap.data() || {} }];
      }

      const estrellas = Number(resenaData.estrellas) || 5;
      titulo = "⭐ Nueva calificación";
      cuerpo = `${nombreRemitente} te calificó con ${estrellas} ⭐`;
      urlDestino = sanitizarRutaRelativa(
        `/vendedor?uid=${encodeURIComponent(vendedorUid)}`
      );
      iconUrl = avatarRemitente;
      claveDedup = `r_${uid}_${vendedorUid}_${obtenerClaveHoraActual()}`;
    }

    // d) tipo === "producto"
    if (tipo === "producto") {
      const { productoId } = body;
      if (typeof productoId !== "string" || !productoId.trim()) {
        return res.status(400).json({
          error: "Falta 'productoId' válido.",
        });
      }

      const prodSnap = await db.collection("productos").doc(productoId).get();
      if (!prodSnap.exists) {
        return res.status(404).json({ error: "El producto no existe." });
      }

      const prodData = prodSnap.data() || {};
      if (prodData.userUid !== uid) {
        return res.status(403).json({
          error: "Solo el dueño del producto puede solicitar esta notificación.",
        });
      }

      if (!esReciente(prodData.fecha, VENTANA_PRODUCTO_MS)) {
        return res.status(400).json({
          error: "El producto es demasiado antiguo para enviar notificación.",
        });
      }

      if (!prodData.universidadId) {
        return res.status(200).json({ omitido: true });
      }

      const usuariosSnap = await db
        .collection("usuarios")
        .where("universidadId", "==", prodData.universidadId)
        .limit(MAX_USUARIOS_CAMPUS)
        .get();

      docsDestinatarios = usuariosSnap.docs
        .filter((d) => d.id !== uid)
        .map((d) => ({ uid: d.id, data: d.data() || {} }));

      const primeraFoto =
        Array.isArray(prodData.imagenes) && prodData.imagenes.length > 0
          ? prodData.imagenes[0]
          : prodData.imagen;

      titulo = "🛍️ Nuevo producto en tu campus";
      cuerpo = String(prodData.titulo || "").slice(0, 100);
      urlDestino = sanitizarRutaRelativa(
        `/producto?id=${encodeURIComponent(productoId)}`
      );
      imageUrl = sanitizarHttpsUrl(primeraFoto);
      claveDedup = `p_${productoId}`;
    }

    // e) Filtrar destinatarios que bloquearon al remitente y recolectar fcmToken
    const mapaTokenAUsuarios = new Map();
    for (const dest of docsDestinatarios) {
      const bloqueados = Array.isArray(dest.data.bloqueados)
        ? dest.data.bloqueados
        : [];
      if (bloqueados.includes(uid)) {
        continue;
      }

      const tokensUsuario = Array.isArray(dest.data.fcmToken)
        ? dest.data.fcmToken
        : [];
      for (const tk of tokensUsuario) {
        if (typeof tk === "string" && tk.trim()) {
          const tokenLimpio = tk.trim();
          if (!mapaTokenAUsuarios.has(tokenLimpio)) {
            mapaTokenAUsuarios.set(tokenLimpio, new Set());
          }
          mapaTokenAUsuarios.get(tokenLimpio).add(dest.uid);
        }
      }
    }

    const listaTokens = Array.from(mapaTokenAUsuarios.keys()).slice(
      0,
      MAX_TOKENS
    );
    if (listaTokens.length === 0) {
      return res.status(200).json({ omitido: true });
    }

    // f) Deduplicación atómica en colección pushEnviados/{clave}
    try {
      await db.collection("pushEnviados").doc(claveDedup).create({
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        tipo,
        uid,
      });
    } catch (dedupErr) {
      if (esErrorYaExiste(dedupErr)) {
        return res.status(200).json({ duplicado: true });
      }
      throw dedupErr;
    }

    // f.2) Tope por usuario para tipo "producto" (máximo 3 por hora en limitesApi/pushProducto_${uid})
    if (tipo === "producto") {
      const dentroDelLimite = await verificarLimitePushProducto(db, uid);
      if (!dentroDelLimite) {
        return res.status(200).json({ limitado: true });
      }
    }

    // g) Construcción del payload data-only con rutas relativas e imágenes https://
    const dataPlano = {
      url: urlDestino,
      title: String(titulo).slice(0, 200),
      body: String(cuerpo).slice(0, 500),
    };
    if (iconUrl) dataPlano.icon = iconUrl;
    if (imageUrl) dataPlano.image = imageUrl;

    // h) Envío vía FCM y limpieza de tokens inválidos en el servidor
    const respuesta = await admin.messaging().sendEachForMulticast({
      tokens: listaTokens,
      data: dataPlano,
      webpush: {
        fcmOptions: { link: urlDestino },
      },
    });

    if (respuesta.failureCount > 0 && Array.isArray(respuesta.responses)) {
      const tokensPorUsuarioLimpiar = new Map();

      respuesta.responses.forEach((r, idx) => {
        if (!r.success && CODIGOS_TOKEN_INVALIDO.has(r.error?.code)) {
          const tokenInvalido = listaTokens[idx];
          const uidsDuenios = mapaTokenAUsuarios.get(tokenInvalido) || [];
          uidsDuenios.forEach((destUid) => {
            if (!tokensPorUsuarioLimpiar.has(destUid)) {
              tokensPorUsuarioLimpiar.set(destUid, []);
            }
            tokensPorUsuarioLimpiar.get(destUid).push(tokenInvalido);
          });
        }
      });

      const promesasLimpieza = [];
      for (const [destUid, tokensInvalidos] of tokensPorUsuarioLimpiar.entries()) {
        promesasLimpieza.push(
          db
            .collection("usuarios")
            .doc(destUid)
            .update({
              fcmToken: admin.firestore.FieldValue.arrayRemove(
                ...tokensInvalidos
              ),
            })
            .catch((cleanErr) => {
              console.error(
                "[api/enviar-push] No se pudo limpiar token inválido:",
                cleanErr
              );
            })
        );
      }
      await Promise.all(promesasLimpieza);
    }

    // i) Respuesta sin exponer tokens al cliente
    return res.status(200).json({
      successCount: respuesta.successCount,
      failureCount: respuesta.failureCount,
    });
  } catch (err) {
    console.error("[api/enviar-push] Error inesperado:", err);
    return res.status(500).json({
      error: "No se pudo enviar la notificación.",
    });
  }
}
