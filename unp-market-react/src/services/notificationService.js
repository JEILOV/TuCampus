// src/services/notificationService.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db }                                  from "./firebase";
import { logError }                            from "../utils/errorHandler";

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