// src/services/notificationService.js
import { addDoc, arrayUnion, collection, doc, serverTimestamp, setDoc }    from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage }                  from "firebase/messaging";
import { app, auth, db }                                                   from "./firebase";
import { logError }                                                        from "../utils/errorHandler";
import { solicitarPush }                                                   from "./pushService";
import { detectarUniversidad }                                             from "../config/universidades";

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
 * y lo guarda en /usuariosPrivado/{usuarioId} (arreglo `fcmToken` — un usuario
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
export const solicitarPermisoNotificaciones = async (usuarioId, universidadId, email) => {
  if (!usuarioId) return null;

  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return null; // navegador sin soporte de notificaciones/service workers
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || VAPID_KEY;
  if (!vapidKey) {
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
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    const correoFallback = email || auth?.currentUser?.email || "";
    const sedeResuelta =
      universidadId || detectarUniversidad(correoFallback)?.id || null;

    await setDoc(
      doc(db, "usuariosPrivado", usuarioId),
      {
        uid: usuarioId,
        ...(sedeResuelta ? { universidadId: sedeResuelta } : {}),
        fcmToken: arrayUnion(token),
      },
      { merge: true }
    );

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
 * 🔧 El payload de FCM en primer plano SIEMPRE llega dentro de
 * `payload.notification` (title/body) cuando el backend lo envía así
 * (ver api/enviar-push.js), pero por robustez este callback también
 * cae a `payload.data` si algún día se manda un push data-only —
 * así el consumidor de `callback` no tiene que preocuparse por la
 * forma exacta del payload, solo recibe { titulo, cuerpo, url, raw }.
 *
 * ⚠️ IMPORTANTE: hoy esta función no tiene ningún caller en la app
 * (ni App.jsx ni ningún componente la invoca) — con la pestaña en
 * primer plano, FCM entrega el mensaje pero nada lo muestra. Si
 * quieren que también se vea algo (toast/banner) con la app abierta,
 * hay que conectar `escucharNotificacionesPrimerPlano` a un callback
 * real en el árbol de la app (ej. en App.jsx, junto al login) — este
 * fix solo deja la función lista para eso, no la conecta.
 *
 * @param {(payload: {titulo:string, cuerpo:string, url:string, raw:object}) => void} callback
 * @returns {Promise<() => void>} función para cancelar la suscripción
 */
export const escucharNotificacionesPrimerPlano = async (callback) => {
  const messaging = await obtenerMessaging();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log("[notificationService.escucharNotificacionesPrimerPlano] payload recibido:", payload);

    const normalizado = {
      titulo: payload.notification?.title || payload.data?.title || "TuCampus",
      cuerpo: payload.notification?.body || payload.data?.body || "Tienes una novedad en tu campus.",
      url:    payload.data?.url || payload.fcmOptions?.link || "/",
      raw:    payload,
    };

    callback(normalizado);
  });
};


// ────────────────────────────────────────────────────────────
//  ORQUESTACIÓN DE PUSH POR EVENTO DE NEGOCIO (FASE 4)
// ────────────────────────────────────────────────────────────
//  El cliente ya NO lee tokens FCM de otros usuarios ni construye
//  el título/cuerpo del push. Solo envía la referencia del evento
//  recién guardado a pushService.solicitarPush, y el servidor
//  (api/enviar-push.js) valida el documento en Firestore y decide
//  los destinatarios y el contenido.
// ────────────────────────────────────────────────────────────

/**
 * Push al destinatario de un mensaje de chat nuevo.
 * Se llama DESPUÉS de que chatService.enviarMensaje ya guardó el
 * mensaje en Firestore — nunca antes ni en la misma transacción.
 *
 * @param {Object} params
 * @param {string} params.chatId
 * @param {string} params.mensajeId
 */
export const notificarNuevoMensaje = async ({ chatId, mensajeId } = {}) => {
  if (!chatId || !mensajeId) return;
  try {
    await solicitarPush({ tipo: "mensaje", chatId, mensajeId });
  } catch (err) {
    logError("[notificationService.notificarNuevoMensaje]", err);
  }
};

/**
 * Push al vendedor cuando recibe una reseña/calificación nueva.
 * Se llama DESPUÉS de que reviewService.guardarOActualizarResena
 * confirmó el runTransaction.
 *
 * @param {Object} params
 * @param {string} params.vendedorUid  UID de quien recibe la calificación
 */
export const notificarNuevaResena = async ({ vendedorUid } = {}) => {
  if (!vendedorUid) return;
  try {
    await solicitarPush({ tipo: "resena", vendedorUid });
  } catch (err) {
    logError("[notificationService.notificarNuevaResena]", err);
  }
};

/**
 * Push a los estudiantes de una sede cuando se publica un producto
 * nuevo. Se llama DESPUÉS de que productService.crearProducto ya
 * confirmó el writeBatch.
 *
 * @param {Object} params
 * @param {string} params.productoId
 */
export const notificarNuevoProductoEnSede = async ({ productoId } = {}) => {
  if (!productoId) return;
  try {
    await solicitarPush({ tipo: "producto", productoId });
  } catch (err) {
    logError("[notificationService.notificarNuevoProductoEnSede]", err);
  }
};
