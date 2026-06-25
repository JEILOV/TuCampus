import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Obtiene un producto por su ID.
 * @param {string} productoId
 * @returns {Promise<Object|null>} El producto con su id, o null si no existe.
 */
export const obtenerProductoPorId = async (productoId) => {
  if (!productoId) return null;
  const snap = await getDoc(doc(db, "productos", productoId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};