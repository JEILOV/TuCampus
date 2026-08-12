// src/services/reviewService.js
// ============================================================
//  TuCampus — Servicio de Reseñas Directas (Fase 3 · Opción B)
//
//  Reemplaza al sistema de "Tratos/Transacciones" (descartado por
//  fricción). Ahora cualquier estudiante puede calificar a un
//  vendedor directamente desde su perfil, sin pasar por un chat
//  ni por una transacción — UNA reseña por par (autor, vendedor),
//  editable indefinidamente.
//
//  PLAN SPARK — CERO CLOUD FUNCTIONS:
//    Todo se resuelve desde el cliente con un writeBatch atómico:
//    el doc de /resenas y el contador/promedio en /usuarios se
//    escriben juntos, o no se escribe ninguno.
//
//  ID DETERMINÍSTICA: `${autorUid}_${vendedorUid}`
//    → un mismo estudiante nunca puede tener dos reseñas para el
//      mismo vendedor. Escribir de nuevo es editar, no duplicar.
//      Esto también es lo que hace posible el cálculo de la
//      DIFERENCIA de estrellas al editar (ver más abajo).
//
//  MODELO DE DATOS:
//    /resenas/{autorUid_vendedorUid}
//        vendedorUid     string   (a quién califican — dueño del promedio)
//        autorUid        string   (quien califica)
//        autorNombre     string
//        autorAvatar     string
//        estrellas       number   (1 a 5)
//        comentario      string   (opcional)
//        fecha           Timestamp        (se fija solo al crear)
//        fechaEdicion    Timestamp | null (se actualiza en cada edición)
//
//    /usuarios/{vendedorUid}  (campos ya agregados en Fase 3)
//        totalResenas          number
//        calificacionPromedio  number  (1 decimal)
//
//  FASE 4 — Notificaciones: cada guardarOActualizarResena() también
//  crea, dentro de la MISMA transacción, un doc en /notificaciones
//  con tipo: "resena" avisando al vendedor. Ver detalle junto al
//  tx.set() correspondiente más abajo.
// ============================================================

import {
  doc, getDoc,
  collection, query, where, orderBy, getDocs,
  serverTimestamp, runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { traducirError, logError } from "../utils/errorHandler";

// ── Helper: recorta el comentario para el mensaje de notificación ──
// La notificación es un aviso corto, no el lugar para leer la reseña
// completa (eso ya se ve en el perfil del vendedor).
const resumirComentario = (comentario, maxLen = 60) => {
  const limpio = (comentario || "").trim();
  if (!limpio) return "";
  return limpio.length > maxLen ? `${limpio.slice(0, maxLen)}…` : limpio;
};

// ── Helper: ID determinística de reseña ──────────────────────
const idResena = (autorUid, vendedorUid) => `${autorUid}_${vendedorUid}`;

// ── ¿Ya dejé una reseña a este vendedor? ──────────────────────
/**
 * @param {string} vendedorUid
 * @param {string} autorUid
 * @returns {Promise<Object|null>} La reseña (con id), o null si no existe.
 */
export const obtenerMiResena = async (vendedorUid, autorUid) => {
  if (!vendedorUid || !autorUid) return null;
  try {
    const snap = await getDoc(doc(db, "resenas", idResena(autorUid, vendedorUid)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    logError("[reviewService.obtenerMiResena]", err);
    return null; // fallo silencioso: si no carga, simplemente se ofrece "Calificar" en vez de "Editar"
  }
};

// ── Lista de reseñas recibidas por un vendedor ────────────────
/**
 * @param {string} vendedorUid
 * @returns {Promise<Array<Object>>} Reseñas ordenadas de más reciente a más antigua.
 */
export const obtenerResenasDeVendedor = async (vendedorUid) => {
  if (!vendedorUid) return [];
  try {
    const q = query(
      collection(db, "resenas"),
      where("vendedorUid", "==", vendedorUid),
      orderBy("fecha", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    logError("[reviewService.obtenerResenasDeVendedor]", err);
    return [];
  }
};

// ── Crear o editar mi reseña a un vendedor ────────────────────
/**
 * Escribe (o reescribe) la reseña de `autorUid` sobre `vendedorUid`
 * usando la ID determinística — así "guardar" y "editar" son la
 * misma operación desde afuera.
 *
 * NUEVA  → suma 1 a totalResenas y mezcla las estrellas al promedio.
 * EDICIÓN → totalResenas NO cambia; solo se aplica la DIFERENCIA
 *           entre la calificación anterior y la nueva al promedio,
 *           lo cual evita tener que releer/recorrer todas las
 *           reseñas del vendedor cada vez (imposible sin Cloud
 *           Functions de forma barata).
 *
 * @param {Object} datos
 * @param {string} datos.vendedorUid
 * @param {string} datos.autorUid
 * @param {string} datos.autorNombre
 * @param {string} [datos.autorAvatar]
 * @param {number} datos.estrellas    Entero 1 a 5
 * @param {string} [datos.comentario]
 * @returns {Promise<{id: string, esNueva: boolean, nuevoTotal: number, nuevoPromedio: number}>}
 */
export const guardarOActualizarResena = async ({
  vendedorUid, autorUid, autorNombre, autorAvatar = "",
  estrellas, comentario = "",
}) => {
  const puntaje = Math.round(Number(estrellas));

  if (!vendedorUid || !autorUid) {
    throw new Error("Faltan datos para guardar la reseña.");
  }
  if (!puntaje || puntaje < 1 || puntaje > 5) {
    throw new Error("La calificación debe ser de 1 a 5 estrellas.");
  }
  if (autorUid === vendedorUid) {
    throw new Error("No podés calificarte a vos mismo.");
  }

  try {
    const resenaRef   = doc(db, "resenas", idResena(autorUid, vendedorUid));
    const vendedorRef = doc(db, "usuarios", vendedorUid);

    // 🔧 ANTES: se leían resenaSnap/vendedorSnap fuera de una transacción
    // y luego se escribían en un writeBatch normal. Ese patrón "leer,
    // calcular, escribir" NO es atómico de punta a punta: si dos personas
    // califican al mismo vendedor casi al mismo tiempo, ambas pueden leer
    // el mismo `totalActual` antes de que la otra escriba, y una de las
    // dos actualizaciones del contador se pierde (aunque las DOS reseñas
    // sí queden guardadas) — eso desincroniza el banner de reputación
    // del listado real de reseñas.
    //
    // AHORA: runTransaction() vuelve a leer los documentos dentro de la
    // transacción y Firestore reintenta automáticamente si algo cambió
    // entre la lectura y la escritura, garantizando que el contador
    // siempre refleje exactamente las reseñas que existen.
    const resultado = await runTransaction(db, async (tx) => {
      const [resenaSnap, vendedorSnap] = await Promise.all([
        tx.get(resenaRef),
        tx.get(vendedorRef),
      ]);

      const esNueva = !resenaSnap.exists();
      const vendedorData   = vendedorSnap.exists() ? vendedorSnap.data() : {};
      const totalActual    = vendedorData.totalResenas || 0;
      const promedioActual = vendedorData.calificacionPromedio || 0;
      const sumaActual     = promedioActual * totalActual;

      let nuevoTotal;
      let nuevaSuma;

      if (esNueva) {
        nuevoTotal = totalActual + 1;
        nuevaSuma  = sumaActual + puntaje;
      } else {
        const estrellasAnteriores = resenaSnap.data().estrellas || 0;
        nuevoTotal = totalActual; // una edición no suma una reseña nueva
        nuevaSuma  = sumaActual - estrellasAnteriores + puntaje; // aplica solo la diferencia
      }

      const nuevoPromedio = nuevoTotal > 0
        ? Math.round((nuevaSuma / nuevoTotal) * 10) / 10 // 1 decimal
        : 0;

      if (esNueva) {
        tx.set(resenaRef, {
          vendedorUid,
          autorUid,
          autorNombre: autorNombre || "Estudiante UNP",
          autorAvatar: autorAvatar || "",
          estrellas:   puntaje,
          comentario:  (comentario || "").trim(),
          fecha:        serverTimestamp(),
          fechaEdicion: null,
        });
      } else {
        tx.update(resenaRef, {
          autorNombre: autorNombre || "Estudiante UNP",
          autorAvatar: autorAvatar || "",
          estrellas:   puntaje,
          comentario:  (comentario || "").trim(),
          fechaEdicion: serverTimestamp(),
        });
      }

      tx.set(vendedorRef, {
        totalResenas:         nuevoTotal,
        calificacionPromedio: nuevoPromedio,
      }, { merge: true });

      // 🔔 Notificación al vendedor — misma transacción: si el batch de
      // arriba falla y reintenta, la notificación se crea (o recrea) junto
      // con él, nunca por separado. Se dispara tanto en reseñas nuevas
      // como en ediciones, porque para el vendedor ambas son "me dejaron
      // una calificación" (autorUid === vendedorUid ya está bloqueado más
      // arriba, pero se repite la guarda acá por seguridad/consistencia
      // con el resto de notificationService.js).
      //
      // NOTA de nombres de campo: se usan paraUid/deUid/deNombre/timestamp
      // (no usuarioUid/autorUid/fecha) porque son los campos que ya lee
      // useNotifications() vía where("paraUid"...) + orderBy("timestamp"...).
      // Los campos nuevos para este feature (deAvatar, mensaje, estrellas,
      // referenciaId) sí se agregan tal cual porque no existían antes.
      if (autorUid !== vendedorUid) {
        const notifRef = doc(collection(db, "notificaciones"));
        tx.set(notifRef, {
          paraUid:      vendedorUid,           // quien recibe la notificación
          deUid:        autorUid,              // quien califica
          deNombre:     autorNombre || "Estudiante UNP",
          deAvatar:     autorAvatar || "",
          tipo:         "resena",
          mensaje:      resumirComentario(comentario)
            ? `te calificó con ${puntaje} ⭐: "${resumirComentario(comentario)}"`
            : `te calificó con ${puntaje} ⭐`,
          estrellas:    puntaje,
          referenciaId: vendedorUid,           // para navegar al perfil al hacer clic
          leido:        false,
          timestamp:    serverTimestamp(),
        });
      }

      return { esNueva, nuevoTotal, nuevoPromedio };
    });

    return { id: resenaRef.id, ...resultado };
  } catch (err) {
    logError("[reviewService.guardarOActualizarResena]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};