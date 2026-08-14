// src/services/notificationService.js
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage }                  from "firebase/messaging";
import { app, db }                                                         from "./firebase";
import { logError }                                                        from "../utils/errorHandler";
import { enviarPush }                                                      from "./pushService";

/**
 * Crea una notificación para otro usuario en Firestore.
 * Regla de negocio centralizada: nunca te notificas a ti mismo.
 *
 * Fire-and-forget: los errores se loguean pero NO se re-lanzan
 * porque una notificación fallida nunca debe interrumpir la acción
 * que la originó (agregar favorito, contactar por WhatsApp, seguir).
 *
 * @param {Object} params
 * @param {string} params.paraUid        UID que recibe la notificación
 * @param {string} params.deUid          UID que origina la acción
 * @param {string} params.deNombre       Nombre a mostrar del emisor
 * @param {"favorito"|"contacto"|"seguidor"|"nuevo_producto"} params.tipo
 * @param {string|null} [params.productoId]
 * @param {string}      [params.productoTitulo]
 */
export const crearNotificacion = async ({
  paraUid,
  deUid,
  deNombre,
  tipo,
  productoId     = null,
  productoTitulo = "tu perfil",
}) => {
  if (!paraUid || !deUid) return;
  if (paraUid === deUid) return; // guard: nunca notificarse a uno mismo

  try {
    await addDoc(collection(db, "notificaciones"), {
      paraUid,
      deUid,
      deNombre:       deNombre || "Un usuario",
      tipo,
      productoId,
      productoTitulo,
      leido:          false,
      timestamp:      serverTimestamp(),
    });
  } catch (err) {
    logError("[notificationService.crearNotificacion]", err); // ← reemplaza console.warn
    // No re-lanzamos: fire-and-forget intencional
  }
};

// ────────────────────────────────────────────────────────────
//  NOTIFICACIONES PUSH (Firebase Cloud Messaging)
// ────────────────────────────────────────────────────────────
//  Independiente de crearNotificacion() de arriba: eso guarda un
//  documento en /notificaciones para la campanita DENTRO de la app
//  (BotonNotificaciones + Notificaciones.jsx). Esto de acá es Web
//  Push real del sistema operativo/navegador (funciona con la app
//  cerrada), vía FCM.
//
//  💸 Costo: $0.00. FCM es gratuito sin límite de mensajes en
//  cualquier plan (incluido Spark). Solo usamos Firestore —ya en
//  uso por el resto de la app— para guardar el token del
//  dispositivo. Enviar los push desde el backend (a partir de estos
//  tokens) si se hace con una Cloud Function requiere plan Blaze,
//  pero se mantiene en $0 dentro de su capa gratuita para el
//  volumen de un proyecto como este.
//
//  Requiere una variable de entorno (ver .env, no se commitea):
//    VITE_FIREBASE_VAPID_KEY=<clave del par "Web Push certificates"
//                              en Firebase Console → Configuración
//                              del proyecto → Cloud Messaging>
// ────────────────────────────────────────────────────────────

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// isSupported() detecta navegadores sin soporte de Push (ej. Safari/iOS
// fuera de una PWA instalada) sin lanzar excepción. Se cachea en una
// promesa para no repetir el chequeo en cada llamada.
let messagingPromise = null;
const obtenerMessaging = () => {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((soportado) => (soportado ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
};

/**
 * Pide permiso de notificaciones al navegador y, si el usuario acepta,
 * registra el Service Worker de FCM, obtiene el token del dispositivo
 * y lo guarda en /usuarios/{usuarioId}.fcmToken (arreglo — un usuario
 * puede tener varios dispositivos/navegadores con push activo).
 *
 * Fire-safe: nunca lanza. Devuelve el token si todo salió bien, o
 * `null` si el navegador no soporta push, el usuario rechazó el
 * permiso, o algo falló.
 *
 * @param {string} usuarioId     UID del usuario dueño del token
 * @param {string} [universidadId] Sede del usuario — se guarda junto
 *   al token para poder segmentar envíos por campus desde el backend.
 * @returns {Promise<string|null>}
 */
export const solicitarPermisoNotificaciones = async (usuarioId, universidadId) => {
  if (!usuarioId) return null;

  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return null; // navegador sin soporte de notificaciones/service workers
  }

  if (!VAPID_KEY) {
    logError(
      "[notificationService.solicitarPermisoNotificaciones]",
      new Error("Falta VITE_FIREBASE_VAPID_KEY — configúrala en tu .env con la VAPID key de Firebase Console → Cloud Messaging.")
    );
    return null;
  }

  try {
    const messaging = await obtenerMessaging();
    if (!messaging) return null; // ej. Safari/iOS fuera de PWA instalada

    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return null;

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    await updateDoc(doc(db, "usuarios", usuarioId), {
      fcmToken: arrayUnion(token),
      ...(universidadId ? { universidadId } : {}),
    });

    return token;
  } catch (err) {
    logError("[notificationService.solicitarPermisoNotificaciones]", err);
    return null;
  }
};

/**
 * Escucha mensajes push que llegan mientras la app está en PRIMER
 * PLANO (pestaña abierta y con foco). Con la app en segundo plano o
 * cerrada, quien muestra la notificación del sistema es
 * public/firebase-messaging-sw.js (onBackgroundMessage), no esto.
 *
 * @param {(payload: object) => void} callback
 * @returns {Promise<() => void>} función para cancelar la suscripción
 */
export const escucharNotificacionesPrimerPlano = async (callback) => {
  const messaging = await obtenerMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
};


// ────────────────────────────────────────────────────────────
//  ORQUESTACIÓN DE PUSH POR EVENTO DE NEGOCIO
// ────────────────────────────────────────────────────────────
//  Estas funciones conectan un evento real de la app (mensaje de
//  chat, reseña nueva, producto publicado) con el envío efectivo
//  de la notificación push: resuelven qué token(s) FCM son el
//  destino y arman el título/cuerpo/enlace, delegando el envío en
//  sí a pushService.enviarPush (que a su vez llama a
//  /api/enviar-push, ver ese archivo).
//
//  Todas son fire-safe: nunca lanzan. Se llaman "en paralelo" al
//  flujo principal (sin await, o con await pero sin que su fallo
//  aborte nada) desde chatService/Chat.jsx, reviewService.js y
//  productService.js — un push que no llega nunca debe impedir que
//  el mensaje/reseña/producto se guarde en Firestore.
// ────────────────────────────────────────────────────────────

const truncarTexto = (texto, max = 100) => {
  const limpio = (texto || "").trim();
  if (!limpio) return "";
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
};

/**
 * Notifica por push a un usuario a partir de su UID — lee sus
 * fcmToken guardados en /usuarios/{uid} (ver
 * solicitarPermisoNotificaciones más arriba) y les envía el push.
 * Helper interno compartido por las 3 funciones de abajo.
 *
 * @param {string} uid
 * @param {{titulo: string, cuerpo: string, url?: string}} mensaje
 */
const notificarPorUid = async (uid, { titulo, cuerpo, url }) => {
  if (!uid) return;
  const snap = await getDoc(doc(db, "usuarios", uid));
  const tokens = snap.exists() ? snap.data().fcmToken : null;
  if (!Array.isArray(tokens) || tokens.length === 0) return;
  await enviarPush({ tokens, titulo, cuerpo, url });
};

/**
 * Push al destinatario de un mensaje de chat nuevo.
 * Se llama DESPUÉS de que chatService.enviarMensaje ya guardó el
 * mensaje en Firestore — nunca antes ni en la misma transacción.
 *
 * @param {Object} params
 * @param {string} params.paraUid   UID de quien recibe el mensaje
 * @param {string} params.deNombre  Nombre de quien lo envía
 * @param {string} params.mensaje   Texto del mensaje (o "📷 Imagen")
 * @param {string} params.chatId
 */
export const notificarNuevoMensaje = async ({ paraUid, deNombre, mensaje, chatId }) => {
  if (!paraUid || !chatId) return;
  try {
    await notificarPorUid(paraUid, {
      titulo: `💬 ${deNombre || "Nuevo mensaje"}`,
      cuerpo: truncarTexto(mensaje) || "Tienes un mensaje nuevo.",
      url:    `/chat?id=${chatId}`,
    });
  } catch (err) {
    logError("[notificationService.notificarNuevoMensaje]", err);
  }
};

/**
 * Push al vendedor cuando recibe una reseña/calificación nueva.
 * Se llama DESPUÉS de que reviewService.guardarOActualizarResena
 * confirmó el runTransaction — igual que con los mensajes, el push
 * es un efecto secundario post-escritura, nunca parte de ella.
 *
 * @param {Object} params
 * @param {string} params.vendedorUid  UID de quien recibe la calificación
 * @param {string} params.autorNombre  Nombre de quien calificó
 * @param {number} params.estrellas    1 a 5
 */
export const notificarNuevaResena = async ({ vendedorUid, autorNombre, estrellas }) => {
  if (!vendedorUid) return;
  try {
    await notificarPorUid(vendedorUid, {
      titulo: "⭐ Nueva calificación",
      cuerpo: `${autorNombre || "Un estudiante"} te calificó con ${estrellas} ⭐`,
      url:    `/vendedor?uid=${vendedorUid}`,
    });
  } catch (err) {
    logError("[notificationService.notificarNuevaResena]", err);
  }
};

// Límite propio (no de FCM) para cuánto se lee de /usuarios al
// notificar por sede — cuida las lecturas de Firestore en el plan
// Spark. sendEachForMulticast igual acepta como mucho 500 tokens
// por llamada, así que tampoco tendría sentido pedir más de golpe.
const MAX_USUARIOS_POR_SEDE = 300;

/**
 * Push a los estudiantes de una sede cuando se publica un producto
 * nuevo. Se llama DESPUÉS de que productService.crearProducto ya
 * confirmó el writeBatch.
 *
 * 🔧 Costo/alcance conocido: lee hasta MAX_USUARIOS_POR_SEDE
 * documentos de /usuarios por cada producto publicado (para juntar
 * sus fcmToken) — aceptable para el volumen de un marketplace de
 * campus, pero si la base de usuarios por sede crece mucho valdría
 * la pena segmentar más (ej. por categoría de interés) en vez de
 * avisarle a toda la sede de cada publicación.
 *
 * @param {Object} params
 * @param {string} params.universidadId
 * @param {string} params.titulo        Título del producto publicado
 * @param {string} params.productoId
 * @param {string} [params.excluirUid]  UID del vendedor — no se autonotifica
 */
export const notificarNuevoProductoEnSede = async ({ universidadId, titulo, productoId, excluirUid }) => {
  if (!universidadId) return;
  try {
    const q = query(
      collection(db, "usuarios"),
      where("universidadId", "==", universidadId),
      limit(MAX_USUARIOS_POR_SEDE),
    );
    const snap = await getDocs(q);

    const tokens = [];
    snap.docs.forEach((d) => {
      if (d.id === excluirUid) return;
      const t = d.data().fcmToken;
      if (Array.isArray(t)) tokens.push(...t);
    });
    if (tokens.length === 0) return;

    await enviarPush({
      tokens,
      titulo: "🛍️ Nuevo producto en tu campus",
      cuerpo: truncarTexto(titulo) || "Hay una publicación nueva en tu campus.",
      url:    productoId ? `/producto?id=${productoId}` : "/",
    });
  } catch (err) {
    logError("[notificationService.notificarNuevoProductoEnSede]", err);
  }
};