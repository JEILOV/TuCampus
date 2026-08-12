// src/services/adService.js
// ============================================================
//  TuCampus — Servicio de Anuncios / Flyers dinámicos
//
//  Reemplaza el arreglo estático que vivía dentro de
//  CarruselAnuncios.jsx por una colección real de Firestore
//  ("anuncios"), con:
//
//    - suscribirAnuncios(callback): listener en tiempo real
//      (onSnapshot) sobre los anuncios activos, ordenados.
//    - Fallback automático a ANUNCIOS_FALLBACK si la colección
//      está vacía o si la lectura falla (reglas, red, etc.), para
//      que el carrusel NUNCA quede vacío en producción.
//    - CRUD mínimo (crear / actualizar / activar-desactivar /
//      eliminar) usado por PanelAdminAnuncios.jsx.
//
//  ESQUEMA DE UN DOCUMENTO EN /anuncios:
//    {
//      titulo:      string  (requerido)
//      subtitulo:   string  (opcional)
//      colorFondo:  string  (hex, ej. "#1c398e" — usado como
//                            respaldo/overlay si no hay imagen)
//      imagenUrl:   string  (opcional — URL pública, ej. ImgBB)
//      enlaceUrl:   string  (opcional — "https://..." abre en
//                            pestaña nueva, o "/producto?id=xxx"
//                            navega dentro de la app)
//      orden:       number  (requerido — controla el orden asc)
//      activo:      boolean (requerido — filtra qué se muestra)
//      creadoEn:    Timestamp
//      actualizadoEn: Timestamp
//    }
// ============================================================

import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "../utils/errorHandler";

const COLECCION = "anuncios";

// 🔧 Mismo contenido que tenía el mock original de CarruselAnuncios,
// solo que ahora con el shape "oficial" (colorFondo/imagenUrl/enlaceUrl)
// para que el componente no necesite dos formatos distintos según el
// origen de los datos. Se usa cuando /anuncios está vacía o falla.
export const ANUNCIOS_FALLBACK = [
  {
    id: "feria-unp",
    titulo: "Feria UNP 2026",
    subtitulo: "Emprendimientos estudiantiles · 18-20 Ago",
    colorFondo: "#1c398e", // primary
    imagenUrl: "",
    enlaceUrl: "",
  },
  {
    id: "promo-fotocopias",
    titulo: "20% dcto. en fotocopias",
    subtitulo: "Centro de copiado \"El Tigre\" · Puerta 3",
    colorFondo: "#287653",
    imagenUrl: "",
    enlaceUrl: "",
  },
  {
    id: "semana-cultural",
    titulo: "Semana Cultural UNP",
    subtitulo: "Música, arte y talleres · Auditorio central",
    colorFondo: "#a07850",
    imagenUrl: "",
    enlaceUrl: "",
  },
  {
    id: "promo-delivery",
    titulo: "Delivery gratis desde S/15",
    subtitulo: "Pide con estudiantes de tu facultad",
    colorFondo: "#1a1a1a",
    imagenUrl: "",
    enlaceUrl: "",
  },
];

/**
 * Escucha en tiempo real los anuncios activos, ordenados por `orden` asc.
 * Llama a `callback(listaDeAnuncios)` en cada cambio.
 *
 * Fallback: si la colección no tiene documentos activos, o si el listener
 * falla (permiso denegado, sin red, etc.), se invoca `callback` con
 * ANUNCIOS_FALLBACK en vez de dejar el carrusel vacío/roto.
 *
 * @param {(anuncios: object[]) => void} callback
 * @returns {() => void} función para cancelar la suscripción (unsubscribe)
 */
export const suscribirAnuncios = (callback) => {
  try {
    const q = query(
      collection(db, COLECCION),
      where("activo", "==", true),
      orderBy("orden", "asc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          callback(ANUNCIOS_FALLBACK);
          return;
        }
        const anuncios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback(anuncios);
      },
      (err) => {
        // Permiso denegado, sin conexión, índice faltante, etc.
        logError("[adService.suscribirAnuncios]", err);
        callback(ANUNCIOS_FALLBACK);
      },
    );

    return unsubscribe;
  } catch (err) {
    // Error síncrono al construir la query (no debería pasar, pero por
    // si acaso no dejamos el carrusel sin datos).
    logError("[adService.suscribirAnuncios] construcción de query", err);
    callback(ANUNCIOS_FALLBACK);
    return () => {};
  }
};

/**
 * Crea un nuevo anuncio. `orden` y `activo` tienen valores por defecto
 * razonables si no se especifican.
 */
export const crearAnuncio = async ({
  titulo, subtitulo = "", colorFondo = "#1c398e",
  imagenUrl = "", enlaceUrl = "", orden = 0, activo = true,
}) => {
  const tituloLimpio = String(titulo || "").trim();
  if (!tituloLimpio) {
    throw new Error("El título del anuncio es obligatorio.");
  }

  try {
    const ref = await addDoc(collection(db, COLECCION), {
      titulo: tituloLimpio,
      subtitulo: String(subtitulo || "").trim(),
      colorFondo,
      imagenUrl: String(imagenUrl || "").trim(),
      enlaceUrl: String(enlaceUrl || "").trim(),
      orden: Number(orden) || 0,
      activo: !!activo,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    logError("[adService.crearAnuncio]", err);
    throw new Error("No se pudo crear el anuncio.");
  }
};

/**
 * Actualiza campos parciales de un anuncio existente (título, imagen,
 * color, orden, enlace, activo...).
 */
export const actualizarAnuncio = async (anuncioId, cambios) => {
  if (!anuncioId) throw new Error("Falta el ID del anuncio.");
  try {
    await updateDoc(doc(db, COLECCION, anuncioId), {
      ...cambios,
      actualizadoEn: serverTimestamp(),
    });
  } catch (err) {
    logError("[adService.actualizarAnuncio]", err);
    throw new Error("No se pudo actualizar el anuncio.");
  }
};

/** Atajo para el toggle activo/inactivo del panel admin. */
export const alternarActivoAnuncio = async (anuncioId, activo) => {
  await actualizarAnuncio(anuncioId, { activo: !!activo });
};

export const eliminarAnuncio = async (anuncioId) => {
  if (!anuncioId) throw new Error("Falta el ID del anuncio.");
  try {
    await deleteDoc(doc(db, COLECCION, anuncioId));
  } catch (err) {
    logError("[adService.eliminarAnuncio]", err);
    throw new Error("No se pudo eliminar el anuncio.");
  }
};