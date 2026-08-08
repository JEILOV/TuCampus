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
//        creadoEn
//
//    /chats/{chatId}/mensajes/{mensajeId}
//        deUid, texto, fecha
//
//  chatId DETERMINÍSTICO: [uidA, uidB].sort().join("_")
//    → mismos dos usuarios siempre caen en el mismo doc,
//      sin necesidad de buscar si ya existe una sala.
// ============================================================

import {
  doc, getDoc, setDoc, updateDoc,
  collection, query, where, orderBy,
  onSnapshot, writeBatch, serverTimestamp, increment,
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

// ── Obtener o crear un chat ──────────────────────────────────
/**
 * Recupera el chat entre comprador y vendedor, o lo crea si es la
 * primera vez que hablan. Idempotente: llamarlo muchas veces no
 * duplica la sala gracias al chatId determinístico.
 *
 * @param {string} uidComprador
 * @param {string} uidVendedor
 * @param {Object} [productoInfo]  Contexto del producto que originó el chat.
 *   Solo se guarda la primera vez (si el chat ya existía, se ignora
 *   para no pisar el producto original de la conversación).
 * @param {string} [productoInfo.productoId]
 * @param {string} [productoInfo.productoTitulo]
 * @param {string} [productoInfo.productoImagen]
 * @param {string} [productoInfo.compradorNombre]
 * @param {string} [productoInfo.compradorAvatar]
 * @param {string} [productoInfo.vendedorNombre]
 * @param {string} [productoInfo.vendedorAvatar]
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
    const snap = await getDoc(chatRef);
    if (snap.exists()) {
      return { id: chatId, ...snap.data() };
    }

    const nuevoChat = {
      participantes: [uidComprador, uidVendedor].sort(),
      participantesInfo: {
        [uidComprador]: {
          nombre: productoInfo.compradorNombre || "Estudiante UNP",
          avatar: productoInfo.compradorAvatar || "",
        },
        [uidVendedor]: {
          nombre: productoInfo.vendedorNombre || "Estudiante UNP",
          avatar: productoInfo.vendedorAvatar || "",
        },
      },
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
 * @param {string} deUid   UID de quien envía
 * @param {string} texto
 * @returns {Promise<{id: string, otroUid: string|null}|undefined>}
 *   El id del mensaje creado y el UID del destinatario (útil para
 *   disparar la notificación desde el componente, sin otra lectura).
 */
export const enviarMensaje = async (chatId, deUid, texto) => {
  const limpio = (texto || "").trim();
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
      texto: limpio,
      fecha: serverTimestamp(),
    });

    const actualizacionChat = {
      ultimoMensaje:      limpio.length > 120 ? limpio.slice(0, 117) + "..." : limpio,
      ultimoMensajeFecha: serverTimestamp(),
      ultimoMensajeDeUid: deUid,
      [`noLeidoPor.${deUid}`]: 0, // quien envía ve su propio mensaje como leído
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
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    logError("[chatService.suscribirMisChats] onSnapshot error", err);
  });

  return unsub;
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