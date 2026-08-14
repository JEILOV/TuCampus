// src/services/notificationService.js
import { addDoc, arrayUnion, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage }                  from "firebase/messaging";
import { app, db }                                                         from "./firebase";
import { logError }                                                        from "../utils/errorHandler";

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