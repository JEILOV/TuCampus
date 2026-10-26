// src/services/seccionesService.js
// ============================================================
//  TuCampus — Capa de datos para las secciones horizontales del Inicio
//
//  Consulta los productos más recientes por sede (y opcionalmente por
//  categoría) con caché en memoria de 3 minutos por combinación
//  `${universidadId}:${categoria || "todas"}`.
//
//  Si falta un índice compuesto en Firestore (failed-precondition),
//  NO degrada a ordenamiento en memoria (mostraría productos en orden
//  arbitrario): imprime el error completo en consola (con el enlace
//  directo para crear el índice) y devuelve `error: "indice"` para que
//  Home active el modo degradado (grilla tradicional).
// ============================================================

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "../utils/errorHandler";

export const TTL_CACHE_SECCIONES_MS = 3 * 60 * 1000; // 3 minutos

// Caché en memoria del módulo: clave `${universidadId}:${categoria || "todas"}`
// -> { productos: Array, timestamp: number }
const cacheSecciones = new Map();

export const limpiarCacheSecciones = () => {
  cacheSecciones.clear();
};

const esErrorIndiceFaltante = (err) => {
  if (err?.code === "failed-precondition") return true;
  return /requires an index/i.test(err?.message || "");
};

/**
 * Obtiene los productos más recientes de una sede (general o por categoría).
 * No filtra por `estado` (igual que la grilla actual: ProductCard ya marca
 * visualmente los productos con `estado === "agotado"`).
 *
 * @param {Object} params
 * @param {string} params.universidadId
 * @param {string|null} [params.categoria=null]
 * @param {number} [params.limite=10]
 * @param {() => number} [params.now=Date.now] Función de reloj inyectable para tests
 * @returns {Promise<{ productos: Array<Object>, error: null | "indice" | "otro" }>}
 */
export const obtenerProductosSeccion = async ({
  universidadId,
  categoria = null,
  limite = 10,
  now = Date.now,
} = {}) => {
  if (!universidadId) {
    return { productos: [], error: null };
  }

  const categoriaNormalizada =
    categoria && categoria !== "todos" && categoria !== "todas"
      ? categoria
      : null;
  const claveCache = `${universidadId}:${categoriaNormalizada || "todas"}`;
  const ahora = now();

  const enCache = cacheSecciones.get(claveCache);
  if (enCache && ahora - enCache.timestamp < TTL_CACHE_SECCIONES_MS) {
    return { productos: enCache.productos, error: null };
  }

  try {
    const constraints = [where("universidadId", "==", universidadId)];
    if (categoriaNormalizada) {
      constraints.push(where("categoria", "==", categoriaNormalizada));
    }
    constraints.push(orderBy("fecha", "desc"), limit(limite));

    const q = query(collection(db, "productos"), ...constraints);
    const snap = await getDocs(q);
    const productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    cacheSecciones.set(claveCache, {
      productos,
      timestamp: ahora,
    });

    return { productos, error: null };
  } catch (err) {
    if (esErrorIndiceFaltante(err)) {
      console.error(
        "[seccionesService.obtenerProductosSeccion] Falta índice compuesto en Firestore:",
        err?.message || err,
        err
      );
      return { productos: [], error: "indice" };
    }

    logError("[seccionesService.obtenerProductosSeccion]", err);
    return { productos: [], error: "otro" };
  }
};
