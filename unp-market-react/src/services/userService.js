import {
  doc, getDoc, setDoc,
  collection, query, where, getDocs,
  updateDoc, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import { traducirError, logError } from "../utils/errorHandler";
import {
  detectarUniversidad,
  nombreEstudiantePorDefecto,
  bioEstudiantePorDefecto,
} from "../config/universidades";

/**
 * Obtiene el perfil PÚBLICO de un usuario/vendedor por su UID.
 * Ya NO incluye `telefono` ni números de Yape/Plin — solo los
 * booleanos `aceptaYape` / `aceptaPlin` para pintar badges.
 * Para el contacto real (número), usar obtenerContactoPrivado().
 * @param {string} uid
 * @returns {Promise<Object|null>} Los datos del perfil, o null si no existe.
 */
export const obtenerPerfilVendedor = async (uid) => {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
};

/**
 * 🔒 Lee la subcolección privada de contacto (/usuarios/{uid}/privado/contacto).
 * La regla de Firestore exige un usuario autenticado (esEstudianteUNP()),
 * no solo el dueño del perfil — así el botón de WhatsApp funciona entre
 * cualquier comprador y cualquier vendedor.
 * @param {string} uid
 * @returns {Promise<{telefono: string, metodosPago: Object}|null>}
 */
export const obtenerContactoPrivado = async (uid) => {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "usuarios", uid, "privado", "contacto"));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    // Fallo silencioso: si no hay permisos o no existe, el WA/badge
    // simplemente no se muestra — no debe romper la pantalla.
    logError("[userService.obtenerContactoPrivado]", err);
    return null;
  }
};

/**
 * 🔒 Guarda telefono + metodosPago en la subcolección privada del dueño,
 * y espeja SOLO los booleanos (aceptaYape/aceptaPlin) al doc público de
 * usuarios — nunca el número — para que las tarjetas puedan mostrar el
 * badge sin una lectura extra por tarjeta.
 * @param {string} uid
 * @param {{telefono: string, metodosPago: {yape:{activo:boolean,numero:string}, plin:{activo:boolean,numero:string}}}} datos
 */
export const guardarContactoPrivado = async (uid, { telefono, metodosPago }) => {
  try {
    await setDoc(
      doc(db, "usuarios", uid, "privado", "contacto"),
      { telefono: telefono || "", metodosPago },
      { merge: true }
    );

    await updateDoc(doc(db, "usuarios", uid), {
      aceptaYape: !!metodosPago?.yape?.activo,
      aceptaPlin: !!metodosPago?.plin?.activo,
    });
  } catch (err) {
    logError("[userService.guardarContactoPrivado]", err);
    throw new Error(traducirError(err, "firestore"));
  }
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

    // 🏫 Multicampus: se detecta la universidad por el dominio del correo
    // institucional. Si por algún motivo no matchea ninguna sede conocida
    // (no debería pasar, ya que AuthContext bloquea el acceso antes),
    // queda como null en vez de reventar la creación del perfil.
    const universidad = detectarUniversidad(user.email);

    const perfilBase = {
      uid:       user.uid,
      // 🏫 Multicampus: si no personalizó su nombre, el default ahora
      // depende de la sede detectada ("Estudiante UTP", "Estudiante UCV"...)
      // en vez de asumir siempre UNP.
      nombre:    user.displayName || nombreEstudiantePorDefecto(universidad?.id),
      email:     user.email,
      avatar:    user.photoURL || "",
      ubicacion: "Piura",
      bio:       bioEstudiantePorDefecto(universidad?.id),
      acercaDe:  "¡Hola! Bienvenido a mi tienda en el campus.",
      // 🏫 Multicampus — ver src/config/universidades.js
      universidadId: universidad?.id || null,
      // 🔒 telefono y metodosPago ya NO viven en el doc público.
      // Ver /usuarios/{uid}/privado/contacto.
      aceptaYape: false,
      aceptaPlin: false,
      // Fase 3 — Reputación: se actualizan vía writeBatch en
      // transactionService.enviarResena, nunca a mano.
      calificacionPromedio: 0,
      totalResenas: 0,
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

// ════════════════════════════════════════════════════════════
//  FASE 6 · Chat Avanzado — Bloqueo de usuarios
//
//  `bloqueados` vive en el doc PÚBLICO /usuarios/{uid} (a propósito:
//  así cualquiera puede leer si "me bloqueó" con una sola lectura de
//  perfil, sin necesitar una subcolección privada ni una regla nueva).
//  No expone nada sensible — es solo una lista de UIDs.
// ════════════════════════════════════════════════════════════

/**
 * Agrega `otroUid` a mi lista de bloqueados. Atómico (arrayUnion):
 * llamarlo dos veces no duplica la entrada.
 * @param {string} miUid
 * @param {string} otroUid
 */
export const bloquearUsuario = async (miUid, otroUid) => {
  if (!miUid || !otroUid || miUid === otroUid) return;
  try {
    await updateDoc(doc(db, "usuarios", miUid), {
      bloqueados: arrayUnion(otroUid),
    });
  } catch (err) {
    logError("[userService.bloquearUsuario]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

/**
 * Quita a `otroUid` de mi lista de bloqueados.
 * @param {string} miUid
 * @param {string} otroUid
 */
export const desbloquearUsuario = async (miUid, otroUid) => {
  if (!miUid || !otroUid) return;
  try {
    await updateDoc(doc(db, "usuarios", miUid), {
      bloqueados: arrayRemove(otroUid),
    });
  } catch (err) {
    logError("[userService.desbloquearUsuario]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};