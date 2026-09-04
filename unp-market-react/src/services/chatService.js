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
//      la URL de ImgBB en `imagen` en vez de `texto`.
//
//  FASE 8 · Contexto dinámico + edición de mensajes:
//    - `productoReferencia: { id, titulo, precio, imagenUrl }` es el
//      producto ACTIVO de la conversación (lo que se muestra en el
//      banner superior de Chat.jsx). A diferencia del comportamiento
//      original (que solo se guardaba la primera vez que se creaba el
//      chat), ahora `obtenerOCrearChat` lo actualiza en CADA llamada que
//      traiga un `productoId` — así, si dos personas ya tenían un chat
//      abierto y una de ellas escribe de nuevo desde OTRO producto, la
//      referencia activa cambia para reflejar la consulta más reciente.
//      Los campos legacy (productoId/productoTitulo/productoImagen) se
//      mantienen en sync por compatibilidad con el resto de la UI
//      (tarjetas de ListaChats, buscador de /chat).
//    - Edición de mensajes de texto: `editarMensaje` actualiza `texto`
//      y marca `editado: true` + `fechaEdicion`. Las reglas de Firestore
//      (`firestore.rules`) son quienes hacen cumplir que SOLO el autor
//      pueda editar, SOLO mensajes de tipo "texto", y SOLO esos tres
//      campos — nunca `deUid`, `fecha` ni `imagen`. Los mensajes de
//      imagen y el borrado siguen sin poder tocarse (evidencia de
//      acuerdos de compra/venta).
// ============================================================

import {
  doc, getDoc, getDocs, setDoc, updateDoc,
  collection, query, where, orderBy, limitToLast, endBefore,
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
 *   Si trae `productoId`, se guarda/actualiza como `productoReferencia`
 *   (producto ACTIVO de la conversación) — inclusive si el chat ya
 *   existía y tenía otro producto de referencia distinto (ver Fase 8
 *   en el encabezado del archivo).
 * @param {string} [productoInfo.productoId]
 * @param {string} [productoInfo.productoTitulo]
 * @param {number} [productoInfo.productoPrecio]
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

    // 🏷️ Fase 8 · Contexto dinámico: solo se arma si vino un productoId
    // en esta llamada — si alguien abre el chat desde /vendedor (sin
    // producto puntual) o desde /chat (lista), no se toca la referencia
    // que ya tenía la conversación.
    const productoReferencia = productoInfo.productoId
      ? {
          id:        productoInfo.productoId,
          titulo:    productoInfo.productoTitulo || "",
          precio:    typeof productoInfo.productoPrecio === "number" ? productoInfo.productoPrecio : null,
          imagenUrl: productoInfo.productoImagen || "",
        }
      : null;

    const camposProducto = productoReferencia
      ? {
          productoReferencia,
          // legacy — se mantienen en sync para no romper ListaChats/buscador
          productoId:     productoReferencia.id,
          productoTitulo: productoReferencia.titulo,
          productoImagen: productoReferencia.imagenUrl,
        }
      : {};

    if (snap.exists()) {
      const actualizacion = { participantesInfo, ...camposProducto };
      // Se espera esta escritura (a diferencia del refresco de perfil,
      // que es fire-and-forget) porque Chat.jsx navega inmediatamente
      // después y lee el doc — si no se espera, puede mostrar el
      // producto de referencia viejo por una fracción de segundo.
      await updateDoc(chatRef, actualizacion).catch((err) => {
        logError("[chatService.obtenerOCrearChat] refresco de contexto", err);
      });
      return { id: chatId, ...snap.data(), ...actualizacion };
    }

    const nuevoChat = {
      participantes: [uidComprador, uidVendedor].sort(),
      participantesInfo,
      productoId:         productoReferencia?.id        || null,
      productoTitulo:     productoReferencia?.titulo     || null,
      productoImagen:     productoReferencia?.imagenUrl  || null,
      productoReferencia: productoReferencia || null,

      ultimoMensaje:      "",
      ultimoMensajeFecha: serverTimestamp(),
      ultimoMensajeDeUid: null,
      ultimoMensajeLeido: null, // aún no hay mensajes — null en vez de bool para distinguir "sin mensajes" de "no leído"

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
 * @param {{id: string, texto: string, autorNombre: string}|null} [respondiendoA=null]
 *   Cita del mensaje al que se responde (estilo WhatsApp). Se guarda tal
 *   cual la arma el componente — acá no se revalida contra la subcolección
 *   `mensajes` a propósito: es solo una "foto" de referencia visual, igual
 *   que `ultimoMensaje` en el doc padre, y no necesita una lectura extra.
 * @returns {Promise<{id: string, otroUid: string|null}|undefined>}
 *   El id del mensaje creado y el UID del destinatario (útil para
 *   disparar la notificación desde el componente, sin otra lectura).
 */
export const enviarMensaje = async (chatId, deUid, contenido, tipo = "texto", respondiendoA = null) => {
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
      // 🆕 Doble check: false al enviar, se pone true en un solo
      // writeBatch (ver marcarMensajesComoLeidos) cuando el destinatario
      // tiene la conversación abierta — nunca un updateDoc por mensaje.
      leido:  false,
      // Cita opcional (Fase 7 — Responder mensaje). `null` y no `undefined`
      // porque Firestore rechaza `undefined` en un `set()`; así el campo
      // siempre existe en el doc, vacío cuando no se respondió a nada.
      respondiendoA: respondiendoA || null,
    });

    const previewLista = tipo === "imagen"
      ? "📷 Imagen"
      : (limpio.length > 120 ? limpio.slice(0, 117) + "..." : limpio);

    const actualizacionChat = {
      ultimoMensaje:      previewLista,
      ultimoMensajeFecha: serverTimestamp(),
      ultimoMensajeDeUid: deUid,
      // 🆕 Campo HERMANO de `ultimoMensaje` (no anidado) — `ultimoMensaje`
      // sigue siendo un string plano porque Chat.jsx ya lo consume así en
      // dos puntos (preview de la lista y buscador, `chat.ultimoMensaje`
      // como texto directo). false al enviar: el mensaje recién creado
      // todavía no lo vio el destinatario.
      ultimoMensajeLeido: false,
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

// ── Editar un mensaje propio (Fase 8) ────────────────────────
/**
 * Edita el texto de un mensaje ya enviado. Solo aplica a mensajes de
 * tipo "texto" — los de imagen no se pueden editar. La autoría real
 * (que `deUid` del mensaje sea igual al UID que edita) y que no se
 * toquen otros campos (`fecha`, `deUid`, `imagen`, `tipo`) las hacen
 * cumplir las reglas de Firestore; acá solo se arma el `updateDoc`.
 *
 * @param {string} chatId
 * @param {string} mensajeId
 * @param {string} miUid       UID de quien edita — usado solo para una
 *   validación temprana en cliente; el candado real vive en las reglas.
 * @param {string} nuevoTexto
 * @returns {Promise<void>}
 */
export const editarMensaje = async (chatId, mensajeId, miUid, nuevoTexto) => {
  const limpio = (nuevoTexto || "").trim();
  if (!chatId || !mensajeId || !miUid) return;
  if (!limpio) {
    throw new Error("El mensaje no puede quedar vacío.");
  }
  if (limpio.length > 1000) {
    throw new Error("El mensaje es demasiado largo.");
  }

  const mensajeRef = doc(db, "chats", chatId, "mensajes", mensajeId);
  try {
    await updateDoc(mensajeRef, {
      texto:        limpio,
      editado:      true,
      fechaEdicion: serverTimestamp(),
    });
  } catch (err) {
    logError("[chatService.editarMensaje]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

// ── Paginación de mensajes ────────────────────────────────────
// 🔧 Por qué hace falta un límite: antes `suscribirMensajes` traía TODA
// la subcolección de golpe con un solo onSnapshot — en una conversación
// larga (cientos de mensajes) eso significa una lectura de Firestore por
// cada mensaje histórico en CADA carga de la página, más un listener que
// recalcula el array completo ante cualquier cambio. `MENSAJES_LIMITE_INICIAL`
// acota la ventana en vivo a los últimos N mensajes; los más viejos se
// traen bajo demanda con `cargarMensajesAnteriores` (una sola lectura,
// sin listener) cuando el usuario los pide explícitamente.
export const MENSAJES_LIMITE_INICIAL = 40;

// ── Suscribirse a los mensajes de un chat (tiempo real) ──────
/**
 * Escucha en tiempo real los ÚLTIMOS `limite` mensajes de una sala,
 * ordenados cronológicamente (asc). Devuelve la función de limpieza
 * (unsubscribe).
 *
 * Esto es la "ventana en vivo": siempre refleja los mensajes más
 * recientes tal como llegan. El historial más antiguo que esta ventana
 * NO se trae acá — para eso está `cargarMensajesAnteriores`, que hace
 * una lectura puntual (sin listener) y el componente que llama es quien
 * combina ambos arrays en la UI (ver Chat.jsx).
 *
 * @param {string} chatId
 * @param {(mensajes: Array<Object>) => void} callback
 * @param {number} [limite]  Cantidad de mensajes recientes a mantener en vivo.
 * @returns {() => void} unsubscribe
 */
export const suscribirMensajes = (chatId, callback, limite = MENSAJES_LIMITE_INICIAL) => {
  if (!chatId) return () => {};

  const q = query(
    collection(db, "chats", chatId, "mensajes"),
    orderBy("fecha", "asc"),
    limitToLast(limite)
  );

  const unsub = onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    logError("[chatService.suscribirMensajes] onSnapshot error", err);
  });

  return unsub;
};

// ── Cargar una página de mensajes más antiguos ────────────────
/**
 * Trae (una sola vez, SIN listener) hasta `limite` mensajes anteriores
 * a `fechaMasAntigua` — pensado para el botón/scroll "Cargar mensajes
 * anteriores" de Chat.jsx. `fechaMasAntigua` es el campo `fecha`
 * (Timestamp de Firestore) del mensaje más viejo que ya está cargado en
 * pantalla (ya sea de la ventana en vivo o de una página anterior).
 *
 * Devuelve `hayMas: true` cuando la página vino completa (`limite`
 * resultados) — señal de que probablemente queden más mensajes antes;
 * `false` cuando vino incompleta, es decir que se llegó al principio
 * de la conversación.
 *
 * @param {string} chatId
 * @param {*} fechaMasAntigua       Timestamp de Firestore del mensaje más viejo ya cargado.
 * @param {number} [limite]
 * @returns {Promise<{mensajes: Array<Object>, hayMas: boolean}>}
 */
export const cargarMensajesAnteriores = async (chatId, fechaMasAntigua, limite = MENSAJES_LIMITE_INICIAL) => {
  if (!chatId || !fechaMasAntigua) return { mensajes: [], hayMas: false };

  try {
    const q = query(
      collection(db, "chats", chatId, "mensajes"),
      orderBy("fecha", "asc"),
      endBefore(fechaMasAntigua),
      limitToLast(limite)
    );
    const snap = await getDocs(q);
    const mensajes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { mensajes, hayMas: mensajes.length === limite };
  } catch (err) {
    logError("[chatService.cargarMensajesAnteriores]", err);
    throw new Error(traducirError(err, "firestore"));
  }
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
 * 🔧 Sanación en tiempo real (auditoría UI/UX): `participantesInfo`
 * guardado en cada doc de /chats es una FOTO ESTÁTICA de cuando se creó
 * (o se reabrió) la conversación — si el otro usuario cambia su nombre
 * o foto de perfil después, la tarjeta de la lista quedaba mostrando el
 * dato viejo (a veces el `displayName`/`photoURL` crudo de Google Auth
 * con el que se sembró el perfil la primera vez) hasta que alguien
 * volvía a abrir ese chat puntual (lo cual dispara el refresco en
 * `obtenerOCrearChat`, pero SOLO para ese chat, y no en la lista).
 *
 * Acá se abre, además de la query de /chats, UN listener de perfil
 * (`onSnapshot` sobre /usuarios/{uid}) por cada "otro" participante
 * distinto que aparezca en mi lista — típicamente un puñado de
 * vendedores/compradores, no uno por mensaje. Los datos de Firestore
 * SIEMPRE pisan lo guardado en `participantesInfo` (nunca al revés), y
 * si el otro usuario edita su nombre o avatar mientras la lista está
 * abierta, se refleja al instante sin recargar ni reabrir el chat.
 * Los listeners de perfil se dan de baja solos cuando un chat deja de
 * aparecer en la lista (se oculta/ya no hay más chats con esa persona),
 * y todos se cortan al hacer unsubscribe.
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

  let ultimosChatsRaw = [];         // último snapshot crudo de /chats (participantesInfo tal cual está guardado)
  const perfilesVivos  = new Map(); // otroUid -> { nombre, avatar } resuelto en vivo desde /usuarios
  const perfilUnsubs   = new Map(); // otroUid -> unsubscribe de su listener de perfil

  // Combina cada chat con el perfil en vivo del otro participante (si ya
  // llegó) y emite la lista al callback. Se llama tanto cuando cambian
  // los chats como cuando llega una actualización de cualquier perfil.
  const emitir = () => {
    const chats = ultimosChatsRaw.map((chat) => {
      const otroUid    = chat.participantes?.find((uid) => uid !== miUid);
      const perfilVivo = otroUid ? perfilesVivos.get(otroUid) : null;
      if (!perfilVivo) return chat; // perfil en vivo aún no resuelto → se ve el dato guardado, sin parpadeo

      return {
        ...chat,
        participantesInfo: {
          ...chat.participantesInfo,
          [otroUid]: {
            ...chat.participantesInfo?.[otroUid],
            ...perfilVivo, // /usuarios/{uid} (Firestore) siempre gana sobre el snapshot estático del chat
          },
        },
      };
    });
    callback(chats);
  };

  // Abre (si no existe ya) el listener de perfil en vivo de un UID.
  const asegurarListenerPerfil = (uid) => {
    if (perfilUnsubs.has(uid)) return;
    const unsub = onSnapshot(
      doc(db, "usuarios", uid),
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        perfilesVivos.set(uid, {
          nombre: data.nombre || "Estudiante UNP",
          avatar: data.avatar || "",
        });
        emitir();
      },
      (err) => logError("[chatService.suscribirMisChats] perfil onSnapshot error", err)
    );
    perfilUnsubs.set(uid, unsub);
  };

  const unsubChats = onSnapshot(q, (snap) => {
    ultimosChatsRaw = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((chat) => !(chat.ocultoPara || []).includes(miUid));

    const otrosUidsActuales = new Set(
      ultimosChatsRaw
        .map((chat) => chat.participantes?.find((uid) => uid !== miUid))
        .filter(Boolean)
    );

    // Un listener de perfil por cada "otro" participante distinto en la
    // lista actual (nuevos chats → nuevos listeners).
    otrosUidsActuales.forEach(asegurarListenerPerfil);

    // Perfiles de gente que ya no aparece en mi lista (chat ocultado/sin
    // actividad que lo saque de la query) → dar de baja su listener para
    // no dejar suscripciones huérfanas corriendo en segundo plano.
    perfilUnsubs.forEach((unsub, uid) => {
      if (!otrosUidsActuales.has(uid)) {
        unsub();
        perfilUnsubs.delete(uid);
        perfilesVivos.delete(uid);
      }
    });

    emitir();
  }, (err) => {
    logError("[chatService.suscribirMisChats] onSnapshot error", err);
  });

  // Unsubscribe combinado: corta la query de /chats Y todos los
  // listeners de perfil que se hayan abierto.
  return () => {
    unsubChats();
    perfilUnsubs.forEach((unsub) => unsub());
    perfilUnsubs.clear();
  };
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

// ── Marcar mensajes individuales como leídos (doble check) ────
/**
 * Marca `leido: true` en los mensajes RECIBIDOS (no propios) que todavía
 * están en `leido: false`, en un solo `writeBatch` — nunca un `updateDoc`
 * por mensaje, para no inflar la cuota de escrituras al abrir una
 * conversación con varios mensajes pendientes de golpe.
 *
 * No-op total (sin lecturas ni escrituras a Firestore) si no hay nada
 * pendiente — pensado para llamarse en cada snapshot nuevo de
 * `suscribirMensajes` sin costo cuando ya todo está leído.
 *
 * Si el ÚLTIMO mensaje de la lista (mensajes[mensajes.length - 1], ya
 * que `suscribirMensajes` los entrega ordenados por fecha ascendente)
 * es uno de los que se está marcando, el mismo batch pone además
 * `ultimoMensajeLeido: true` en el doc padre del chat — así la lista de
 * chats puede mostrar el check azul junto al último mensaje propio sin
 * tener que abrir la subcolección de esa conversación.
 *
 * Best-effort, igual que `marcarComoLeido`: un fallo acá no debe
 * interrumpir la lectura de la conversación.
 *
 * @param {string} chatId
 * @param {Array<{id: string, deUid: string, leido?: boolean}>} mensajes
 *   Lista actual de mensajes del chat (ordenada asc), tal cual la
 *   entrega `suscribirMensajes`.
 * @param {string} miUid
 * @returns {Promise<void>}
 */
export const marcarMensajesComoLeidos = async (chatId, mensajes, miUid) => {
  if (!chatId || !miUid || !Array.isArray(mensajes) || mensajes.length === 0) return;

  const pendientes = mensajes.filter((m) => m.deUid !== miUid && m.leido === false);
  if (pendientes.length === 0) return; // ya está todo leído — cero writes

  try {
    const batch = writeBatch(db);
    pendientes.forEach((m) => {
      batch.update(doc(db, "chats", chatId, "mensajes", m.id), { leido: true });
    });

    // El último mensaje de la conversación es el que se refleja en la
    // lista de chats (junto a "Tú: ...") — solo si es uno de los que
    // se acaba de marcar, actualizamos el flag a nivel del chat.
    const ultimoMensaje = mensajes[mensajes.length - 1];
    if (pendientes.some((m) => m.id === ultimoMensaje.id)) {
      batch.update(doc(db, "chats", chatId), { ultimoMensajeLeido: true });
    }

    await batch.commit();
  } catch (err) {
    logError("[chatService.marcarMensajesComoLeidos]", err);
    // No relanzamos: es best-effort, no debe bloquear la lectura de mensajes.
  }
};