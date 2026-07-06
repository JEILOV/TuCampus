import {
  doc, getDoc, setDoc,
  collection, query, where, getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { traducirError, logError } from "../utils/errorHandler";

/**
 * Obtiene el perfil de un usuario/vendedor por su UID.
 * @param {string} uid
 * @returns {Promise<Object|null>} Los datos del perfil, o null si no existe.
 */
export const obtenerPerfilVendedor = async (uid) => {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
};

/**
 * Obtiene todos los productos publicados por un vendedor.
 * @param {string} uid
 * @returns {Promise<Array>} Lista de productos con su id.
 */
export const obtenerProductosPorVendedor = async (uid) => {
  if (!uid) return [];
  const q = query(collection(db, "productos"), where("userUid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Agrega al usuario actual a la lista de seguidores de un vendedor.
 * @param {string} vendedorUid
 * @param {string} miUid
 */
export const seguirVendedor = async (vendedorUid, miUid) => {
  try {
    const ref  = doc(db, "usuarios", vendedorUid);
    const snap = await getDoc(ref);
    const actuales = (snap.exists() && Array.isArray(snap.data().seguidores))
      ? snap.data().seguidores
      : [];

    if (actuales.includes(miUid)) return; // ya lo sigue, nada que hacer

    await updateDoc(ref, { seguidores: [...actuales, miUid] });
  } catch (err) {
    logError("[userService.seguirVendedor]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};


export const dejarDeSeguirVendedor = async (vendedorUid, miUid) => {
  try {
    const ref  = doc(db, "usuarios", vendedorUid);
    const snap = await getDoc(ref);
    const actuales = (snap.exists() && Array.isArray(snap.data().seguidores))
      ? snap.data().seguidores
      : [];

    if (!actuales.includes(miUid)) return; // ya no lo sigue, nada que hacer

    await updateDoc(ref, { seguidores: actuales.filter((uid) => uid !== miUid) });
  } catch (err) {
    logError("[userService.dejarDeSeguirVendedor]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

/**
 * Obtiene el perfil Firestore de un usuario recién autenticado con Google.
 * Si es su primera vez, crea el documento con datos por defecto.
 *
 * @param {import("firebase/auth").User} user  Usuario de Firebase Auth
 * @returns {Promise<{perfil: Object, favoritosGuardados: string[]}>}
 */
export const obtenerOCrearPerfilUsuario = async (user) => {
  try {
    const userRef = doc(db, "usuarios", user.uid);
    const snap    = await getDoc(userRef);

    const perfilBase = {
      uid:       user.uid,
      nombre:    user.displayName || "Estudiante UNP",
      email:     user.email,
      avatar:    user.photoURL || "",
      ubicacion: "Piura",
      bio:       "Estudiante de la UNP",
      acercaDe:  "¡Hola! Bienvenido a mi tienda en el campus.",
      telefono:  "",
    };

    if (!snap.exists()) {
      await setDoc(userRef, perfilBase);
      return { perfil: perfilBase, favoritosGuardados: [] };
    }

    const datosGuardados = snap.data();
    return {
      perfil:             { ...perfilBase, ...datosGuardados },
      favoritosGuardados: datosGuardados.favoritos || [],
    };
  } catch (err) {
    logError("[userService.obtenerOCrearPerfilUsuario]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

/**
 * Persiste el array de favoritos del usuario en su documento de Firestore.
 * @param {string} uid
 * @param {string[]} favoritos
 */
export const sincronizarFavoritos = async (uid, favoritos) => {
  await setDoc(doc(db, "usuarios", uid), { favoritos }, { merge: true });
};
