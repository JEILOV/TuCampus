// src/hooks/useProducts.js
// ============================================================
//  UNP Market — Hook de carga paginada de productos
//
//  EXTRAE DE: Home.jsx
//    - Estado: productos, cargando, todoCargado
//    - Lógica: cargarMasProductos (paginación, filtros, orden)
//    - Refs: ultimoDocRef (cursor de paginación)
//    - Reset automático al cambiar filtros
//
//  LO QUE QUEDA EN Home.jsx:
//    - UI (JSX, categorías, orden, búsqueda visual)
//    - Refs de IntersectionObserver (sentinelRef, observerRef)
//    - mostrarToast (UI concern, no de datos)
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, getDocs, query,
  orderBy, limit, startAfter, where,
} from "firebase/firestore";
import { db }           from "../services/firebase";
import { logError }     from "../utils/errorHandler";

const PAGE_SIZE = 20;

const ORDEN_CONFIG = {
  recientes:      { campo: "fecha",                dir: "desc" },
  precio_asc:     { campo: "precio",                dir: "asc"  },
  precio_desc:    { campo: "precio",                dir: "desc" },
  // ⭐ "Mejor valorados" ordena por la reputación DENORMALIZADA del
  // vendedor (ver calificacionVendedor en productService.crearProducto).
  // ⚠️ Caveat de Firestore: orderBy() excluye documentos donde el campo
  // no existe. Los productos publicados ANTES de este cambio no tienen
  // `calificacionVendedor` y por lo tanto no aparecerán en este orden
  // hasta que se editen/republiquen o se corra un script de migración
  // que rellene ese campo en los productos existentes. También requiere
  // crear el índice compuesto que Firestore pedirá en la consola la
  // primera vez que se ejecute esta consulta.
  mejor_valorados: { campo: "calificacionVendedor", dir: "desc" },
};

/**
 * Hook de carga paginada de productos con soporte de filtros.
 *
 * @param {Object} params
 * @param {string} params.orden           "recientes" | "precio_asc" | "precio_desc"
 * @param {string} params.categoriaActiva Clave de categoría o "todos"
 * @param {string} params.busquedaFirebase Término de búsqueda (debounced, desde Home)
 * @param {Function} params.onError       Callback (mensaje: string) → muestra toast
 *
 * @returns {{
 *   productos: Array,
 *   cargando: boolean,
 *   todoCargado: boolean,
 *   cargarMas: Function,
 * }}
 *
 * @example
 *   const { productos, cargando, todoCargado, cargarMas } = useProducts({
 *     orden, categoriaActiva, busquedaFirebase,
 *     onError: (msg) => mostrarToast(msg, "error"),
 *   });
 */
export const useProducts = ({ orden, categoriaActiva, busquedaFirebase, onError }) => {
  const [productos,   setProductos]   = useState([]);
  const [cargando,    setCargando]    = useState(false);
  const [todoCargado, setTodoCargado] = useState(false);

  const ultimoDocRef = useRef(null);

  // ── Función de carga (estable mientras los filtros no cambien) ──
  const cargarMas = useCallback(async (esNuevoFiltro = false) => {
    if (cargando || (todoCargado && !esNuevoFiltro)) return;
    setCargando(true);

    try {
      const { campo, dir } = ORDEN_CONFIG[orden] ?? ORDEN_CONFIG.recientes;
      const col            = collection(db, "productos");
      const constraints    = [];

      if (busquedaFirebase.trim() !== "") {
        constraints.push(where("keywords", "array-contains", busquedaFirebase.toLowerCase().trim()));
      } else if (categoriaActiva !== "todos") {
        constraints.push(where("categoria", "==", categoriaActiva));
      }

      constraints.push(orderBy(campo, dir));
      constraints.push(limit(PAGE_SIZE));

      if (ultimoDocRef.current && !esNuevoFiltro) {
        constraints.push(startAfter(ultimoDocRef.current));
      }

      const snapshot = await getDocs(query(col, ...constraints));

      if (snapshot.size < PAGE_SIZE) setTodoCargado(true);

      const nuevos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      setProductos((prev) => {
        if (esNuevoFiltro) return nuevos;
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...nuevos.filter((p) => !ids.has(p.id))];
      });

      if (!snapshot.empty) {
        ultimoDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
    } catch (err) {
      logError("[useProducts.cargarMas]", err);
      onError?.("Error al cargar productos");
    } finally {
      setCargando(false);
    }
  }, [cargando, todoCargado, orden, categoriaActiva, busquedaFirebase, onError]);

  // ── Reset y recarga al cambiar cualquier filtro ──
  useEffect(() => {
    setTodoCargado(false);
    setProductos([]);
    ultimoDocRef.current = null;
    // La llamada inicial la dispara el efecto de abajo
    // cuando productos vuelve a [] y todoCargado = false
  }, [orden, categoriaActiva, busquedaFirebase]);

  // ── Carga inicial (y tras reset de filtros) ──
  useEffect(() => {
    if (!todoCargado && productos.length === 0 && !cargando) {
      cargarMas(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, todoCargado]);

  return { productos, cargando, todoCargado, cargarMas };
};