import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Crea una notificación para otro usuario en Firestore.
 * Regla de negocio centralizada: nunca te notificas a ti mismo.
 *
 * @param {Object} params
 * @param {string} params.paraUid       UID que recibe la notificación
 * @param {string} params.deUid         UID que origina la acción
 * @param {string} params.deNombre      Nombre a mostrar del emisor
 * @param {"favorito"|"contacto"|"seguidor"} params.tipo
 * @param {string} [params.productoId]
 * @param {string} [params.productoTitulo]
 */
export const crearNotificacion = async ({
  paraUid,
  deUid,
  deNombre,
  tipo,
  productoId = null,
  productoTitulo = "tu perfil",
}) => {
  if (!paraUid || !deUid) return;
  if (paraUid === deUid) return; // guard único: nunca notificarse a uno mismo

  try {
    await addDoc(collection(db, "notificaciones"), {
      paraUid,
      deUid,
      deNombre: deNombre || "Un usuario",
      tipo,
      productoId,
      productoTitulo,
      leido: false,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Notificación no enviada:", err);
  }
};