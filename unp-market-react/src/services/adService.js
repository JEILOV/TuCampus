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
//      imagenUrl:   string  (opcional — URL pública, ej. ImgBB —
//                            imagen de FONDO de la tarjeta del carrusel)
//      imagenFlyerUrl: string (opcional — URL pública del flyer/afiche
//                            COMPLETO. Si viene seteado, al tocar la
//                            tarjeta en el carrusel se abre un modal a
//                            pantalla completa con esta imagen en vez
//                            de navegar directo a `enlaceUrl` — ver
//                            ModalFlyerAnuncio.jsx / CarruselAnuncios.jsx)
//      enlaceUrl:   string  (opcional — "https://..." abre en
//                            pestaña nueva, o "/producto?id=xxx"
//                            navega dentro de la app. Si el anuncio
//                            tiene imagenFlyerUrl, este enlace se ofrece
//                            como botón "Ver más" DENTRO del modal del
//                            flyer, en vez de abrirse de inmediato)
//      orden:       number  (requerido — controla el orden asc)
//      activo:      boolean (requerido — filtra qué se muestra)
//      universidadId: string (requerido — 🏫 Multicampus: "global"
//                            para que se vea en TODAS las sedes, o
//                            uno de los ids de universidades.js
//                            ("unp"|"ucv"|"utp") para que sea
//                            exclusivo de esa sede)
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

// 🏫 Multicampus: sedes válidas + el pseudo-id "global" que un anuncio
// puede usar para aparecer en el carrusel de TODAS las sedes.
export const SEDES_ANUNCIO = ["global", "unp", "ucv", "utp"];
const SEDE_GLOBAL = "global";

// 🔧 Mismo contenido que tenía el mock original de CarruselAnuncios,
// solo que ahora con el shape "oficial" (colorFondo/imagenUrl/enlaceUrl)
// para que el componente no necesite dos formatos distintos según el
// origen de los datos. Se usa cuando /anuncios está vacía o falla.
// 🏫 Todos marcados como "global" para que se sigan viendo sin importar
// qué sede esté explorando el usuario.
export const ANUNCIOS_FALLBACK = [
  {
    id: "feria-unp",
    titulo: "Feria UNP 2026",
    subtitulo: "Emprendimientos estudiantiles · 18-20 Ago",
    colorFondo: "#1c398e", // primary
    imagenUrl: "",
    enlaceUrl: "",
    universidadId: SEDE_GLOBAL,
  },
  {
    id: "promo-fotocopias",
    titulo: "20% dcto. en fotocopias",
    subtitulo: "Centro de copiado \"El Tigre\" · Puerta 3",
    colorFondo: "#287653",
    imagenUrl: "",
    enlaceUrl: "",
    universidadId: SEDE_GLOBAL,
  },
  {
    id: "semana-cultural",
    titulo: "Semana Cultural UNP",
    subtitulo: "Música, arte y talleres · Auditorio central",
    colorFondo: "#a07850",
    imagenUrl: "",
    enlaceUrl: "",
    universidadId: SEDE_GLOBAL,
  },
  {
    id: "promo-delivery",
    titulo: "Delivery gratis desde S/15",
    subtitulo: "Pide con estudiantes de tu facultad",
    colorFondo: "#1a1a1a",
    imagenUrl: "",
    enlaceUrl: "",
    universidadId: SEDE_GLOBAL,
  },
];

/**
 * Escucha en tiempo real los anuncios activos de una sede (los propios
 * de esa sede + los globales), ordenados por `orden` asc.
 * Llama a `callback(listaDeAnuncios)` en cada cambio.
 *
 * 🏫 Multicampus: usa where("universidadId","in",[universidadActiva,
 * "global"]) para traer en una sola consulta tanto los anuncios
 * exclusivos del campus activo como los globales. Firestore exige un
 * índice compuesto para esta combinación (activo == true + universidadId
 * in [...] + orderBy(orden)) — la consola te dará el link para crearlo
 * la primera vez que corra en producción; hasta entonces cae al fallback.
 *
 * Fallback: si la colección no tiene documentos activos para esa sede,
 * o si el listener falla (permiso denegado, sin red, índice faltante,
 * etc.), se invoca `callback` con ANUNCIOS_FALLBACK en vez de dejar el
 * carrusel vacío/roto.
 *
 * @param {string} universidadActiva  Sede que se está explorando (ver
 *                                    universidadActiva en Home.jsx). Si
 *                                    no se especifica, se asume "unp".
 * @param {(anuncios: object[]) => void} callback
 * @returns {() => void} función para cancelar la suscripción (unsubscribe)
 */
export const suscribirAnuncios = (universidadActiva, callback) => {
  // 🔧 Compat: si alguien todavía llama suscribirAnuncios(callback) con
  // la firma vieja (un solo argumento), no rompemos — se interpreta
  // como "sin sede" y se corrige internamente.
  if (typeof universidadActiva === "function") {
    callback = universidadActiva;
    universidadActiva = "unp";
  }
  const sede = universidadActiva || "unp";

  try {
    const q = query(
      collection(db, COLECCION),
      where("activo", "==", true),
      where("universidadId", "in", [sede, SEDE_GLOBAL]),
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
 * razonables si no se especifican. `universidadId` por defecto es
 * "global" (visible en todas las sedes) si no se especifica o si viene
 * un valor fuera de SEDES_ANUNCIO.
 */
export const crearAnuncio = async ({
  titulo, subtitulo = "", colorFondo = "#1c398e",
  imagenUrl = "", imagenFlyerUrl = "", enlaceUrl = "", orden = 0, activo = true,
  universidadId = SEDE_GLOBAL,
}) => {
  const tituloLimpio = String(titulo || "").trim();
  if (!tituloLimpio) {
    throw new Error("El título del anuncio es obligatorio.");
  }

  const sedeLimpia = SEDES_ANUNCIO.includes(universidadId) ? universidadId : SEDE_GLOBAL;

  try {
    const ref = await addDoc(collection(db, COLECCION), {
      titulo: tituloLimpio,
      subtitulo: String(subtitulo || "").trim(),
      colorFondo,
      imagenUrl: String(imagenUrl || "").trim(),
      // 🖼️ Flyer Extendido: imagen del afiche completo mostrada en el
      // modal al tocar la tarjeta (ver esquema arriba). Opcional.
      imagenFlyerUrl: String(imagenFlyerUrl || "").trim(),
      enlaceUrl: String(enlaceUrl || "").trim(),
      orden: Number(orden) || 0,
      activo: !!activo,
      universidadId: sedeLimpia,
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