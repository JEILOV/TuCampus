import {
  doc, getDoc, setDoc, deleteDoc,
  collection, query, where, getDocs,
  updateDoc, arrayUnion, arrayRemove,
  writeBatch, deleteField, serverTimestamp,
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
 * 🔒 H05 + H10: Guarda telefono + metodosPago en la subcolección privada del dueño
 * y actualiza SOLO los campos permitidos del perfil público en un único writeBatch,
 * eliminando cualquier `telefono` legado del documento público con deleteField().
 * @param {string} uid
 * @param {Object} datos
 */
export const guardarContactoPrivado = async (
  uid,
  {
    telefono,
    metodosPago,
    nombre = "",
    bio = "",
    acercaDe = "",
    ubicacion = "",
    avatar = "",
    portada = "",
    aceptaYape,
    aceptaPlin,
  }
) => {
  try {
    const batch = writeBatch(db);

    batch.set(
      doc(db, "usuarios", uid, "privado", "contacto"),
      { telefono: telefono || "", metodosPago },
      { merge: true }
    );

    batch.update(doc(db, "usuarios", uid), {
      nombre,
      bio,
      acercaDe,
      ubicacion,
      avatar,
      portada,
      aceptaYape: aceptaYape !== undefined ? Boolean(aceptaYape) : !!metodosPago?.yape?.activo,
      aceptaPlin: aceptaPlin !== undefined ? Boolean(aceptaPlin) : !!metodosPago?.plin?.activo,
      telefono: deleteField(),
    });

    await batch.commit();
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
 * Agrega al usuario actual a la lista de seguidores de un vendedor (H04: atómico sin lectura previa).
 * @param {string} vendedorUid
 * @param {string} miUid
 */
export const seguirVendedor = async (vendedorUid, miUid) => {
  const ref = doc(db, "usuarios", vendedorUid);
  try {
    await updateDoc(ref, { seguidores: arrayUnion(miUid) });
  } catch (err) {
    if (err?.code === "permission-denied") {
      try {
        const snap = await getDoc(ref);
        const actuales = (snap.exists() && Array.isArray(snap.data().seguidores))
          ? snap.data().seguidores
          : [];
        if (actuales.includes(miUid)) return;
      } catch {
        // Si la lectura de verificación falla, caemos al manejo de error original
      }
    }
    logError("[userService.seguirVendedor]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

export const dejarDeSeguirVendedor = async (vendedorUid, miUid) => {
  const ref = doc(db, "usuarios", vendedorUid);
  try {
    await updateDoc(ref, { seguidores: arrayRemove(miUid) });
  } catch (err) {
    if (err?.code === "permission-denied") {
      try {
        const snap = await getDoc(ref);
        const actuales = (snap.exists() && Array.isArray(snap.data().seguidores))
          ? snap.data().seguidores
          : [];
        if (!actuales.includes(miUid)) return;
      } catch {
        // Si la lectura de verificación falla, caemos al manejo de error original
      }
    }
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
    const privRef = doc(db, "usuariosPrivado", user.uid);

    const [snap, privSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(privRef).catch((errPriv) => {
        logError("[userService.obtenerOCrearPerfilUsuario.leerPrivado]", errPriv);
        return null;
      }),
    ]);

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
      try {
        await setDoc(privRef, {
          uid: user.uid,
          email: user.email,
          universidadId: universidad?.id || null,
          favoritos: [],
          fcmToken: [],
        });
      } catch (errPriv) {
        logError("[userService.obtenerOCrearPerfilUsuario.crearPrivado]", errPriv);
      }
      return { perfil: perfilBase, favoritosGuardados: [], bloqueadosLegados: [] };
    }

    const datosGuardados = snap.data() || {};
    const bloqueadosLegados = Array.isArray(datosGuardados.bloqueados)
      ? datosGuardados.bloqueados.filter((u) => typeof u === "string" && u.trim())
      : [];

    const existePrivado = Boolean(
      privSnap && typeof privSnap.exists === "function" && privSnap.exists()
    );
    const datosPrivados = existePrivado ? privSnap.data() || {} : null;

    if (!existePrivado) {
      const favsLegados = Array.isArray(datosGuardados.favoritos)
        ? datosGuardados.favoritos
            .filter((f) => typeof f === "string" && f.trim())
            .slice(0, 500)
        : [];
      const tokensLegados = Array.isArray(datosGuardados.fcmToken)
        ? datosGuardados.fcmToken
            .filter((t) => typeof t === "string" && t.trim())
            .slice(-20)
        : [];
      try {
        await setDoc(privRef, {
          uid: user.uid,
          email: user.email || datosGuardados.email || "",
          universidadId: datosGuardados.universidadId || universidad?.id || null,
          favoritos: favsLegados,
          fcmToken: tokensLegados,
        });
      } catch (errPriv) {
        logError(
          "[userService.obtenerOCrearPerfilUsuario.autorrepararPrivado]",
          errPriv
        );
      }
    }

    const favoritosGuardados = Array.isArray(datosPrivados?.favoritos)
      ? datosPrivados.favoritos
      : Array.isArray(datosGuardados.favoritos)
        ? datosGuardados.favoritos
        : [];

    const perfilLimpio = { ...perfilBase, ...datosGuardados };
    delete perfilLimpio.email;
    delete perfilLimpio.favoritos;
    delete perfilLimpio.bloqueados;
    delete perfilLimpio.fcmToken;

    return {
      perfil: perfilLimpio,
      favoritosGuardados,
      bloqueadosLegados,
    };
  } catch (err) {
    logError("[userService.obtenerOCrearPerfilUsuario]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

/**
 * Persiste el array de favoritos del usuario en /usuariosPrivado/{uid} (máximo 500).
 * Tolera fallos para no interrumpir la sesión si las reglas aún no se publicaron.
 * @param {string} uid
 * @param {string[]} favoritos
 */
export const sincronizarFavoritos = async (uid, favoritos) => {
  if (!uid) return;
  const listaRecortada = Array.isArray(favoritos) ? favoritos.slice(0, 500) : [];
  try {
    await setDoc(
      doc(db, "usuariosPrivado", uid),
      { favoritos: listaRecortada },
      { merge: true }
    );
  } catch (err) {
    logError("[userService.sincronizarFavoritos]", err);
  }
};

// ════════════════════════════════════════════════════════════
//  FASE 6A · Bloqueo de usuarios en /bloqueos/{miUid}_{otroUid}
// ════════════════════════════════════════════════════════════

/**
 * Crea el documento de bloqueo /bloqueos/{miUid}_{otroUid}.
 * @param {string} miUid
 * @param {string} otroUid
 */
export const bloquearUsuario = async (miUid, otroUid) => {
  if (!miUid || !otroUid || miUid === otroUid) return;
  try {
    await setDoc(doc(db, "bloqueos", `${miUid}_${otroUid}`), {
      bloqueadorUid: miUid,
      bloqueadoUid: otroUid,
      creadoEn: serverTimestamp(),
    });
  } catch (err) {
    logError("[userService.bloquearUsuario]", err);
    throw new Error(traducirError(err, "firestore"));
  }

  // LEGACY: eliminar en Fase 6B
  try {
    await updateDoc(doc(db, "usuarios", miUid), {
      bloqueados: arrayUnion(otroUid),
    });
  } catch (errLegado) {
    logError("[userService.bloquearUsuario.legado]", errLegado);
  }
};

/**
 * Elimina el documento de bloqueo /bloqueos/{miUid}_{otroUid}.
 * @param {string} miUid
 * @param {string} otroUid
 */
export const desbloquearUsuario = async (miUid, otroUid) => {
  if (!miUid || !otroUid) return;
  try {
    await deleteDoc(doc(db, "bloqueos", `${miUid}_${otroUid}`));
  } catch (err) {
    logError("[userService.desbloquearUsuario]", err);
    throw new Error(traducirError(err, "firestore"));
  }

  // LEGACY: eliminar en Fase 6B
  try {
    await updateDoc(doc(db, "usuarios", miUid), {
      bloqueados: arrayRemove(otroUid),
    });
  } catch (errLegado) {
    logError("[userService.desbloquearUsuario.legado]", errLegado);
  }
};

/**
 * Devuelve la lista de UIDs bloqueados por `miUid` desde /bloqueos.
 * En caso de error registra con logError y devuelve [].
 * @param {string} miUid
 * @returns {Promise<string[]>}
 */
export const obtenerMisBloqueos = async (miUid) => {
  if (!miUid) return [];
  try {
    const q = query(
      collection(db, "bloqueos"),
      where("bloqueadorUid", "==", miUid)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data()?.bloqueadoUid)
      .filter((u) => typeof u === "string" && u.trim().length > 0);
  } catch (err) {
    logError("[userService.obtenerMisBloqueos]", err);
    return [];
  }
};

/**
 * Consulta si existe el bloqueo /bloqueos/{bloqueadorUid}_{bloqueadoUid}.
 * En caso de error registra con logError y devuelve false.
 * @param {string} bloqueadorUid
 * @param {string} bloqueadoUid
 * @returns {Promise<boolean>}
 */
export const existeBloqueo = async (bloqueadorUid, bloqueadoUid) => {
  if (!bloqueadorUid || !bloqueadoUid) return false;
  try {
    const snap = await getDoc(
      doc(db, "bloqueos", `${bloqueadorUid}_${bloqueadoUid}`)
    );
    return Boolean(snap.exists());
  } catch (err) {
    logError("[userService.existeBloqueo]", err);
    return false;
  }
};

/**
 * Crea en /bloqueos los documentos que falten a partir del arreglo legado
 * `bloqueados` del documento público, con try/catch por documento y sin bloquear.
 * @param {string} miUid
 * @param {string[]} bloqueadosLegados
 */
export const migrarBloqueosLegados = async (miUid, bloqueadosLegados = []) => {
  if (!miUid || !Array.isArray(bloqueadosLegados) || bloqueadosLegados.length === 0) {
    return;
  }
  const unicos = [
    ...new Set(
      bloqueadosLegados.filter(
        (u) => typeof u === "string" && u.trim().length > 0 && u !== miUid
      )
    ),
  ];
  for (const otroUid of unicos) {
    try {
      await setDoc(doc(db, "bloqueos", `${miUid}_${otroUid}`), {
        bloqueadorUid: miUid,
        bloqueadoUid: otroUid,
        creadoEn: serverTimestamp(),
      });
    } catch (err) {
      logError("[userService.migrarBloqueosLegados]", err);
    }
  }
};
