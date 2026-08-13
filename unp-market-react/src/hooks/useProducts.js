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

// 🔧 Antes era 20. Se reduce a 12 para que la primera pantalla del
// Home cargue más rápido (menos documentos + menos imágenes que
// pedir de entrada). El mismo tamaño se reutiliza para cada página
// siguiente del scroll infinito (cargarMas), así que el "cargar más"
// también trae de 12 en 12 en vez de 20 en 20.
const PAGE_SIZE = 12;

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
 * @param {string} params.universidadId   🏫 Multicampus — id de la sede del usuario
 *                                        actual (ver src/config/universidades.js).
 *                                        Si viene, cada consulta se acota con
 *                                        where("universidadId","==",universidadId)
 *                                        para que cada campus vea solo lo suyo.
 * @param {Function} params.onError       Callback (mensaje: string) → muestra toast
 *
 * @returns {{
 *   productos: Array,
 *   cargando: boolean,
 *   todoCargado: boolean,
 *   errorCarga: boolean,
 *   cargarMas: Function,
 *   reintentar: Function,
 * }}
 *
 * @example
 *   const { productos, cargando, todoCargado, errorCarga, cargarMas, reintentar } = useProducts({
 *     orden, categoriaActiva, busquedaFirebase, universidadId: perfil?.universidadId,
 *     onError: (msg) => mostrarToast(msg, "error"),
 *   });
 */
export const useProducts = ({ orden, categoriaActiva, busquedaFirebase, universidadId, onError }) => {
  const [productos,   setProductos]   = useState([]);
  const [cargando,    setCargando]    = useState(false);
  const [todoCargado, setTodoCargado] = useState(false);
  // 🔧 Se expone como estado (no solo ref) para que Home.jsx pueda,
  // si quiere, mostrar un botón "Reintentar" cuando la carga falló,
  // en vez de la app quedándose en un estado de error silencioso.
  const [errorCarga,  setErrorCarga]  = useState(false);

  const ultimoDocRef = useRef(null);

  // 🔧 Ref espejo de `cargando`, leída de forma síncrona dentro de
  // cargarMas. Antes `cargando` era una dependencia del useCallback,
  // así que CADA VEZ que cargando cambiaba (false→true→false) cargarMas
  // recibía una identidad NUEVA. Si algún efecto en Home.jsx (p. ej. el
  // IntersectionObserver del scroll infinito) tiene `cargarMas` en su
  // arreglo de dependencias, cada cambio de identidad reconstruye ese
  // efecto — y si el sentinel del scroll sigue visible (como pasa
  // cuando la lista quedó vacía por un error), el observer dispara
  // cargarMas otra vez de inmediato. Eso era la cascada: error → nueva
  // identidad → nueva suscripción → nueva llamada → nuevo error → toast
  // tras toast. Usar una ref para la guarda evita que cargando forme
  // parte de las dependencias, así que cargarMas ya NO cambia de
  // identidad en cada carga.
  const cargandoRef = useRef(false);

  // 🔧 Ref de error: una vez que una carga falla, esta ref bloquea
  // llamadas automáticas subsecuentes a cargarMas (tanto el disparo de
  // carga inicial como el "cargar más" del scroll infinito) hasta que
  // los filtros cambien de verdad (ver el efecto de reset más abajo,
  // que es el único lugar donde se limpia). Así el toast de error se
  // dispara una única vez por combinación de filtros, en vez de
  // reintentar sin control.
  const erroreRef = useRef(false);

  // ── Función de carga (identidad estable mientras los filtros no cambien) ──
  const cargarMas = useCallback(async (esNuevoFiltro = false) => {
    if (cargandoRef.current) return;           // ya hay una carga en curso
    if (erroreRef.current) return;              // la última carga falló: no reintentar solo
    if (todoCargado && !esNuevoFiltro) return;   // ya no hay más páginas
    if (!universidadId) return;                 // 🏫 perfil aún no resuelto: sin sede no se consulta

    cargandoRef.current = true;
    setCargando(true);

    try {
      const { campo, dir } = ORDEN_CONFIG[orden] ?? ORDEN_CONFIG.recientes;
      const col            = collection(db, "productos");
      const constraints    = [];

      // 🏫 Multicampus: acota SIEMPRE por la sede del usuario actual, para
      // que UNP/UCV/UTP vean únicamente los productos de su propio campus.
      // Si por algún motivo no hay universidadId (perfil aún cargando),
      // se omite la carga en vez de mostrar productos de otras sedes.
      if (universidadId) {
        constraints.push(where("universidadId", "==", universidadId));
      }

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
      // 🔧 Disparo único: erroreRef ya bloqueó cualquier llamada
      // concurrente/posterior antes de llegar aquí, así que este catch
      // solo se ejecuta una vez por combinación de filtros.
      erroreRef.current = true;
      setErrorCarga(true);
      onError?.("Error al cargar productos");
    } finally {
      cargandoRef.current = false;
      setCargando(false);
    }
  }, [todoCargado, orden, categoriaActiva, busquedaFirebase, universidadId, onError]);

  // ── Reset y recarga al cambiar cualquier filtro (incluye universidadId,
  //    por si el perfil termina de cargar después del primer render) ──
  useEffect(() => {
    setTodoCargado(false);
    setProductos([]);
    setErrorCarga(false);
    erroreRef.current = false; // único lugar donde se libera la guarda de error
    ultimoDocRef.current = null;
    // La llamada inicial la dispara el efecto de abajo
    // cuando productos vuelve a [] y todoCargado = false
  }, [orden, categoriaActiva, busquedaFirebase, universidadId]);

  // ── Carga inicial (y tras reset de filtros) ──
  useEffect(() => {
    if (!universidadId) return; // 🏫 esperar a que el perfil resuelva la sede
    if (!todoCargado && !errorCarga && productos.length === 0 && !cargandoRef.current) {
      cargarMas(true);
    }
  }, [productos, todoCargado, errorCarga, universidadId, cargarMas]);

  // 🔧 Reintento manual explícito — para un botón "Reintentar" en la UI
  // si Home.jsx quiere ofrecerlo, en vez de reintentos automáticos.
  const reintentar = useCallback(() => {
    erroreRef.current = false;
    setErrorCarga(false);
    ultimoDocRef.current = null;
    setTodoCargado(false);
    setProductos([]);
  }, []);

  return { productos, cargando, todoCargado, errorCarga, cargarMas, reintentar };
};