// src/services/chatService.js
// ============================================================
//  TuCampus — Servicio de Chat Nativo (Fase 2)
//
//  PLAN SPARK — CERO CLOUD FUNCTIONS:
//    Todo corre desde el cliente con Firestore directo.
//    Tiempo real vía onSnapshot, contadores de no-leídos vía
//    increment() atómico, envío de mensaje + actualización del
//    doc padre en un solo writeBatch (atomicidad sin functions).
//
//  MODELO DE DATOS:
//    /chats/{chatId}
//        participantes:       [uidA, uidB]  (ordenado, para array-contains)
//        participantesInfo:   { [uid]: { nombre, avatar } }
//        productoId, productoTitulo, productoImagen  (contexto de origen)
//        ultimoMensaje, ultimoMensajeFecha, ultimoMensajeDeUid
//        noLeidoPor: { [uid]: number }
//        ocultoPara: [uid, ...]   (Fase 6 — "ocultar chat", ver más abajo)
//        creadoEn
//
//    /chats/{chatId}/mensajes/{mensajeId}
//        deUid, tipo: "texto" | "imagen", texto, imagen, fecha
//
//  chatId DETERMINÍSTICO: [uidA, uidB].sort().join("_")
//    → mismos dos usuarios siempre caen en el mismo doc,
//      sin necesidad de buscar si ya existe una sala.
//
//  FASE 6 · Chat Avanzado (Plan Spark, 0 costos extra):
//    - Bloquear usuario: no vive acá, vive en /usuarios/{uid}.bloqueados
//      (ver userService.bloquearUsuario). Este archivo no necesita
//      saber de bloqueos: la UI simplemente no llama a enviarMensaje
//      si la conversación está bloqueada (ver Chat.jsx).
//    - Ocultar chat: `ocultoPara` es un array de UIDs que NO deben ver
//      este chat en su lista. Se filtra en `suscribirMisChats` (cliente,
//      no hay Cloud Functions). Cuando cualquiera de los dos escribe de
//      nuevo, `enviarMensaje` limpia `ocultoPara` para AMBOS
//      participantes — así el chat "reaparece" para quien lo había
//      ocultado en cuanto hay actividad nueva.
//    - Mensajes de imagen: mismo doc de mensaje, con `tipo: "imagen"` y
//      la URL de ImgBB en `imagen` en vez de `texto`. No hay edición ni
//      borrado de mensajes individuales — es evidencia de acuerdos de
//      compra/venta y se mantiene intacta a propósito.
// ============================================================

import {
  doc, getDoc, setDoc, updateDoc,
  collection, query, where, orderBy,
  onSnapshot, writeBatch, serverTimestamp, increment,
  arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import { traducirError, logError } from "../utils/errorHandler";

// ── Helper: chatId determinístico ────────────────────────────
/**
 * Genera el ID determinístico de una sala 1-a-1 entre dos usuarios.
 * Da igual el orden en que se pasen los UIDs: el resultado es el mismo.
 * @param {string} uidA
 * @param {string} uidB
 * @returns {string}
 */
export const generarChatId = (uidA, uidB) => [uidA, uidB].sort().join("_");

// ── Helper: info de perfil "verdadera" (Firestore, no Google Auth) ──
/**
 * Lee `nombre` y `avatar` del doc público /usuarios/{uid}.
 *
 * 🔧 Auditoría UI/UX: antes, obtenerOCrearChat confiaba ciegamente en
 * el `compradorNombre`/`compradorAvatar` que mandara el componente que
 * lo llamaba — y varias pantallas mandaban `user.displayName` /
 * `user.photoURL` (los datos crudos de Google), no el perfil configurado
 * en Firestore. Ahora el servicio consulta el perfil real él mismo, así
 * el chat nunca depende de que cada caller se acuerde de pasar los datos
 * correctos. Los parámetros de fallback solo se usan si el doc de
 * "usuarios" todavía no existe o falla la lectura.
 *
 * @param {string} uid
 * @param {string} [fallbackNombre]
 * @param {string} [fallbackAvatar]
 * @returns {Promise<{nombre: string, avatar: string}>}
 */
const obtenerInfoPerfilReal = async (uid, fallbackNombre = "", fallbackAvatar = "") => {
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    const data = snap.exists() ? snap.data() : {};
    return {
      nombre: data.nombre || fallbackNombre || "Estudiante UNP",
      avatar: data.avatar || fallbackAvatar || "",
    };
  } catch (err) {
    logError("[chatService.obtenerInfoPerfilReal]", err);
    return { nombre: fallbackNombre || "Estudiante UNP", avatar: fallbackAvatar || "" };
  }
};

// ── Obtener o crear un chat ──────────────────────────────────
/**
 * Recupera el chat entre comprador y vendedor, o lo crea si es la
 * primera vez que hablan. Idempotente: llamarlo muchas veces no
 * duplica la sala gracias al chatId determinístico.
 *
 * 🔧 `participantesInfo` (nombre/avatar de ambos) se resuelve SIEMPRE
 * contra /usuarios/{uid}, tanto para chats nuevos como existentes —
 * así, si alguien edita su nombre o foto de perfil después de haber
 * empezado a chatear, la próxima vez que se abra esa conversación el
 * chat se "auto-sana" y muestra los datos actualizados.
 *
 * @param {string} uidComprador
 * @param {string} uidVendedor
 * @param {Object} [productoInfo]  Contexto del producto que originó el chat.
 *   Solo se guarda la primera vez (si el chat ya existía, se ignora
 *   para no pisar el producto original de la conversación).
 * @param {string} [productoInfo.productoId]
 * @param {string} [productoInfo.productoTitulo]
 * @param {string} [productoInfo.productoImagen]
 * @param {string} [productoInfo.compradorNombre]  Fallback si aún no hay perfil en Firestore.
 * @param {string} [productoInfo.compradorAvatar]  Fallback si aún no hay perfil en Firestore.
 * @param {string} [productoInfo.vendedorNombre]   Fallback si aún no hay perfil en Firestore.
 * @param {string} [productoInfo.vendedorAvatar]   Fallback si aún no hay perfil en Firestore.
 * @returns {Promise<{id: string, [key: string]: any}>} El doc del chat (con id)
 */
export const obtenerOCrearChat = async (uidComprador, uidVendedor, productoInfo = {}) => {
  if (!uidComprador || !uidVendedor) {
    throw new Error("Faltan usuarios para iniciar el chat.");
  }
  if (uidComprador === uidVendedor) {
    throw new Error("No podés iniciar un chat contigo mismo.");
  }

  const chatId  = generarChatId(uidComprador, uidVendedor);
  const chatRef = doc(db, "chats", chatId);

  try {
    const [snap, infoComprador, infoVendedor] = await Promise.all([
      getDoc(chatRef),
      obtenerInfoPerfilReal(uidComprador, productoInfo.compradorNombre, productoInfo.compradorAvatar),
      obtenerInfoPerfilReal(uidVendedor, productoInfo.vendedorNombre, productoInfo.vendedorAvatar),
    ]);

    const participantesInfo = {
      [uidComprador]: infoComprador,
      [uidVendedor]:  infoVendedor,
    };

    if (snap.exists()) {
      // Auto-sanar datos de perfil desatualizados — best-effort, no bloquea
      // la apertura del chat si esta escritura de "refresco" falla.
      updateDoc(chatRef, { participantesInfo }).catch((err) =>
        logError("[chatService.obtenerOCrearChat] refresco de participantesInfo", err)
      );
      return { id: chatId, ...snap.data(), participantesInfo };
    }

    const nuevoChat = {
      participantes: [uidComprador, uidVendedor].sort(),
      participantesInfo,
      productoId:     productoInfo.productoId     || null,
      productoTitulo: productoInfo.productoTitulo || null,
      productoImagen: productoInfo.productoImagen || null,

      ultimoMensaje:      "",
      ultimoMensajeFecha: serverTimestamp(),
      ultimoMensajeDeUid: null,

      noLeidoPor: { [uidComprador]: 0, [uidVendedor]: 0 },
      creadoEn:   serverTimestamp(),
    };

    await setDoc(chatRef, nuevoChat);
    return { id: chatId, ...nuevoChat };
  } catch (err) {
    logError("[chatService.obtenerOCrearChat]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

// ── Enviar un mensaje ────────────────────────────────────────
/**
 * Agrega un mensaje a la subcolección y actualiza el doc padre
 * (ultimoMensaje + contador de no-leídos del destinatario) en
 * un solo writeBatch — atómico, sin Cloud Functions.
 *
 * @param {string} chatId
 * @param {string} deUid    UID de quien envía
 * @param {string} contenido  Texto del mensaje, o URL de la imagen si tipo="imagen"
 * @param {"texto"|"imagen"} [tipo="texto"]
 * @returns {Promise<{id: string, otroUid: string|null}|undefined>}
 *   El id del mensaje creado y el UID del destinatario (útil para
 *   disparar la notificación desde el componente, sin otra lectura).
 */
export const enviarMensaje = async (chatId, deUid, contenido, tipo = "texto") => {
  const limpio = (contenido || "").trim();
  if (!chatId || !deUid || !limpio) return;

  const chatRef = doc(db, "chats", chatId);

  try {
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
      throw new Error("El chat no existe. Llamá a obtenerOCrearChat primero.");
    }

    const { participantes = [] } = chatSnap.data();
    const otroUid = participantes.find((uid) => uid !== deUid) || null;

    const mensajesRef     = collection(db, "chats", chatId, "mensajes");
    const nuevoMensajeRef = doc(mensajesRef); // auto-ID

    const batch = writeBatch(db);

    batch.set(nuevoMensajeRef, {
      deUid,
      tipo,                                     // "texto" | "imagen"
      texto:  tipo === "texto"  ? limpio : "",
      imagen: tipo === "imagen" ? limpio : "",   // URL pública de ImgBB
      fecha:  serverTimestamp(),
    });

    const previewLista = tipo === "imagen"
      ? "📷 Imagen"
      : (limpio.length > 120 ? limpio.slice(0, 117) + "..." : limpio);

    const actualizacionChat = {
      ultimoMensaje:      previewLista,
      ultimoMensajeFecha: serverTimestamp(),
      ultimoMensajeDeUid: deUid,
      [`noLeidoPor.${deUid}`]: 0, // quien envía ve su propio mensaje como leído
      // Fase 6: cualquier actividad nueva "revive" el chat para quien lo
      // hubiera ocultado — tanto para el que envía como para el que recibe.
      ocultoPara: arrayRemove(...participantes),
    };
    if (otroUid) {
      actualizacionChat[`noLeidoPor.${otroUid}`] = increment(1);
    }

    batch.update(chatRef, actualizacionChat);
    await batch.commit();

    return { id: nuevoMensajeRef.id, otroUid };
  } catch (err) {
    logError("[chatService.enviarMensaje]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

// ── Suscribirse a los mensajes de un chat (tiempo real) ──────
/**
 * Escucha en tiempo real los mensajes de una sala, ordenados
 * cronológicamente. Devuelve la función de limpieza (unsubscribe).
 *
 * @param {string} chatId
 * @param {(mensajes: Array<Object>) => void} callback
 * @returns {() => void} unsubscribe
 */
export const suscribirMensajes = (chatId, callback) => {
  if (!chatId) return () => {};

  const q = query(
    collection(db, "chats", chatId, "mensajes"),
    orderBy("fecha", "asc")
  );

  const unsub = onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    logError("[chatService.suscribirMensajes] onSnapshot error", err);
  });

  return unsub;
};

// ── Suscribirse a la lista de chats del usuario (tiempo real) ─
/**
 * Escucha en tiempo real todas las conversaciones donde el usuario
 * es participante, ordenadas por actividad reciente.
 *
 * Fase 6: filtra en el cliente los chats que el usuario ocultó
 * (`ocultoPara` incluye su UID). No hace falta un índice ni una
 * query aparte — Firestore no permite filtrar "array NOT contains",
 * así que se resuelve acá, sobre los pocos chats que ya trajo la
 * query de `participantes`.
 *
 * @param {string} miUid
 * @param {(chats: Array<Object>) => void} callback
 * @returns {() => void} unsubscribe
 */
export const suscribirMisChats = (miUid, callback) => {
  if (!miUid) return () => {};

  const q = query(
    collection(db, "chats"),
    where("participantes", "array-contains", miUid),
    orderBy("ultimoMensajeFecha", "desc")
  );

  const unsub = onSnapshot(q, (snap) => {
    const chats = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((chat) => !(chat.ocultoPara || []).includes(miUid));
    callback(chats);
  }, (err) => {
    logError("[chatService.suscribirMisChats] onSnapshot error", err);
  });

  return unsub;
};

// ── Ocultar / limpiar un chat de mi lista ─────────────────────
/**
 * Agrega mi UID a `ocultoPara` del chat — desaparece de mi lista sin
 * borrar nada para la otra persona ni perder el historial. Vuelve a
 * aparecer solo. si cualquiera de los dos escribe de nuevo (ver
 * `enviarMensaje`, que limpia `ocultoPara` en cada mensaje nuevo).
 *
 * @param {string} chatId
 * @param {string} miUid
 */
export const ocultarChat = async (chatId, miUid) => {
  if (!chatId || !miUid) return;
  try {
    await updateDoc(doc(db, "chats", chatId), {
      ocultoPara: arrayUnion(miUid),
    });
  } catch (err) {
    logError("[chatService.ocultarChat]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

// ── Marcar como leído ─────────────────────────────────────────
/**
 * Resetea a 0 el contador de no-leídos del usuario actual en un chat.
 * Best-effort: se llama al abrir la conversación, no debe romper la UI.
 *
 * @param {string} chatId
 * @param {string} miUid
 */
export const marcarComoLeido = async (chatId, miUid) => {
  if (!chatId || !miUid) return;
  try {
    await updateDoc(doc(db, "chats", chatId), {
      [`noLeidoPor.${miUid}`]: 0,
    });
  } catch (err) {
    logError("[chatService.marcarComoLeido]", err);
    // No relanzamos: es best-effort, no debe bloquear la lectura de mensajes.
  }
};