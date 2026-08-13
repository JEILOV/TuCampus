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
//
//  🏫 Multicampus — blindaje contra fallos de índice compuesto:
//    Este hook usa getDocs() (fetch puntual), NO onSnapshot(), así que
//    no existe una función unsubscribe real que cancelar. El equivalente
//    correcto aquí es un "generation guard": cada vez que los filtros
//    cambian se incrementa requestGenRef, y cualquier respuesta en vuelo
//    de una generación anterior se descarta al llegar (ni pisa el
//    estado ni dispara error), que es el mismo efecto práctico que
//    cancelar la suscripción anterior antes de abrir una nueva.
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
  // 🔧 Normalizado: el campo debe ser exactamente `calificacionVendedor`
  // (el que reviewService.guardarOActualizarResena sincroniza en cada
  // producto del vendedor), NO `calificacion` a secas — mismatch aquí
  // haría que orderBy() excluya silenciosamente todos los documentos.
  // ⚠️ Caveat de Firestore: orderBy() excluye documentos donde el campo
  // no existe. Los productos publicados ANTES de este cambio no tienen
  // `calificacionVendedor` y por lo tanto no aparecerán en este orden
  // hasta que se editen/republiquen o se corra un script de migración
  // que rellene ese campo en los productos existentes. También requiere
  // crear el índice compuesto que Firestore pedirá en la consola la
  // primera vez que se ejecute esta consulta.
  mejor_valorados: { campo: "calificacionVendedor", dir: "desc" },
};

// 🔧 Códigos/patrones de error ante los que SÍ tiene sentido degradar a
// ordenamiento en memoria en vez de mostrar error al usuario:
//   - failed-precondition: típicamente "The query requires an index..."
//   - unavailable / deadline-exceeded: problemas de red/transporte
// Cualquier OTRO error (permission-denied, invalid-argument, etc.) se
// re-lanza tal cual: son bugs reales o problemas de reglas que NO se
// deben enmascarar con un fallback silencioso.
const esErrorRecuperable = (err) => {
  const codigo = err?.code || "";
  if (codigo === "failed-precondition" || codigo === "unavailable" || codigo === "deadline-exceeded") {
    return true;
  }
  // Firestore a veces reporta el índice faltante como failed-precondition
  // pero el mensaje es la única pista fiable en algunos SDKs/versiones.
  return /requires an index|index/i.test(err?.message || "");
};

/**
 * Hook de carga paginada de productos con soporte de filtros.
 *
 * @param {Object} params
 * @param {string} params.orden           "recientes" | "precio_asc" | "precio_desc" | "mejor_valorados"
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

  // 🔧 Ref de error: una vez que una carga falla (tras agotar el
  // fallback en memoria), esta ref bloquea llamadas automáticas
  // subsecuentes a cargarMas (tanto el disparo de carga inicial como
  // el "cargar más" del scroll infinito) hasta que los filtros cambien
  // de verdad (ver el efecto de reset más abajo, que es el único lugar
  // donde se limpia). Así el toast de error se dispara una única vez
  // por combinación de filtros, en vez de reintentar sin control.
  const erroreRef = useRef(false);

  // 🔧 Guardia de "cancelación limpia" (ver nota de cabecera del
  // archivo): se incrementa cada vez que cambia la combinación de
  // filtros. Toda respuesta de getDocs que resuelva perteneciendo a
  // una generación distinta de la actual se descarta sin tocar el
  // estado — equivalente práctico a cancelar un onSnapshot anterior
  // antes de abrir uno nuevo.
  const requestGenRef = useRef(0);

  // ── Función de carga (identidad estable mientras los filtros no cambien) ──
  const cargarMas = useCallback(async (esNuevoFiltro = false) => {
    if (cargandoRef.current) return;           // ya hay una carga en curso
    if (erroreRef.current) return;              // la última carga falló: no reintentar solo
    if (todoCargado && !esNuevoFiltro) return;   // ya no hay más páginas
    if (!universidadId) return;                 // 🏫 perfil aún no resuelto: sin sede no se consulta

    // Generación de ESTA llamada: si al terminar ya no coincide con
    // requestGenRef.current es que los filtros cambiaron mientras la
    // consulta estaba en vuelo, y el resultado se descarta.
    const miGeneracion = requestGenRef.current;

    cargandoRef.current = true;
    setCargando(true);

    try {
      const { campo, dir } = ORDEN_CONFIG[orden] ?? ORDEN_CONFIG.recientes;
      const col = collection(db, "productos");

      // Constraints "base": los where() que no dependen del orden y por
      // lo tanto son válidos tanto en el intento primario (con orderBy)
      // como en el fallback (sin orderBy) ante falta de índice.
      const constraintsBase = [];

      // 🏫 Multicampus: acota SIEMPRE por la sede del usuario actual, para
      // que UNP/UCV/UTP vean únicamente los productos de su propio campus.
      // Si por algún motivo no hay universidadId (perfil aún cargando),
      // se omite la carga en vez de mostrar productos de otras sedes.
      if (universidadId) {
        constraintsBase.push(where("universidadId", "==", universidadId));
      }

      if (busquedaFirebase.trim() !== "") {
        constraintsBase.push(where("keywords", "array-contains", busquedaFirebase.toLowerCase().trim()));
      } else if (categoriaActiva !== "todos") {
        constraintsBase.push(where("categoria", "==", categoriaActiva));
      }

      const hayCursor = ultimoDocRef.current && !esNuevoFiltro;

      let snapshot;
      let ordenadoEnMemoria = false;

      try {
        // ── Intento primario: orden en el servidor (requiere índice compuesto
        //    universidadId + categoria/keywords + campo de orden) ──
        const constraintsConOrden = [
          ...constraintsBase,
          orderBy(campo, dir),
          limit(PAGE_SIZE),
        ];
        if (hayCursor) constraintsConOrden.push(startAfter(ultimoDocRef.current));

        snapshot = await getDocs(query(col, ...constraintsConOrden));
      } catch (errPrimario) {
        if (!esErrorRecuperable(errPrimario)) throw errPrimario; // bug real: no enmascarar

        logError("[useProducts.cargarMas] fallback a orden en memoria (posible índice faltante)", errPrimario);

        // ── Fallback: mismos where(), SIN orderBy en el servidor. Firestore
        //    ordena implícitamente por __name__, así que startAfter(doc)
        //    sigue siendo un cursor válido aunque no coincida con el orden
        //    que el usuario pidió. El orden solicitado (precio/calificación)
        //    se aplica después, en memoria, sobre lo que ya se cargó. ──
        const constraintsSinOrden = [...constraintsBase, limit(PAGE_SIZE)];
        if (hayCursor) constraintsSinOrden.push(startAfter(ultimoDocRef.current));

        snapshot = await getDocs(query(col, ...constraintsSinOrden));
        ordenadoEnMemoria = true;
      }

      // Si la combinación de filtros cambió mientras esta consulta estaba
      // en vuelo, se descarta el resultado sin tocar estado ni disparar error.
      if (requestGenRef.current !== miGeneracion) return;

      if (snapshot.size < PAGE_SIZE) setTodoCargado(true);

      const nuevos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      setProductos((prev) => {
        const base = esNuevoFiltro ? [] : prev;
        const ids  = new Set(base.map((p) => p.id));
        const combinados = [...base, ...nuevos.filter((p) => !ids.has(p.id))];

        if (!ordenadoEnMemoria) return combinados;

        // Ordenamiento en memoria (fallback): mismo campo/dir que se le
        // pidió a Firestore, aplicado sobre TODO lo acumulado hasta ahora.
        // Nota: al no poder ordenar en el servidor, esto es un orden
        // "mejor esfuerzo" sobre las páginas ya traídas, no un orden
        // global garantizado en todo el catálogo — trade-off aceptado
        // para no romper el hook mientras falta el índice compuesto.
        const factor = dir === "asc" ? 1 : -1;
        return [...combinados].sort((a, b) => {
          const va = a?.[campo];
          const vb = b?.[campo];
          if (va == null && vb == null) return 0;
          if (va == null) return 1;  // sin el campo → al final, igual que orderBy en servidor
          if (vb == null) return -1;
          if (va < vb) return -1 * factor;
          if (va > vb) return  1 * factor;
          return 0;
        });
      });

      if (!snapshot.empty) {
        ultimoDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
    } catch (err) {
      // Descarta también errores de una generación ya obsoleta.
      if (requestGenRef.current !== miGeneracion) return;

      logError("[useProducts.cargarMas]", err);
      // 🔧 Disparo único: erroreRef ya bloqueó cualquier llamada
      // concurrente/posterior antes de llegar aquí, así que este catch
      // solo se ejecuta una vez por combinación de filtros.
      erroreRef.current = true;
      setErrorCarga(true);
      onError?.("Error al cargar productos");
    } finally {
      if (requestGenRef.current === miGeneracion) {
        cargandoRef.current = false;
        setCargando(false);
      }
    }
  }, [todoCargado, orden, categoriaActiva, busquedaFirebase, universidadId, onError]);

  // ── Reset y recarga al cambiar cualquier filtro (incluye universidadId,
  //    por si el perfil termina de cargar después del primer render) ──
  useEffect(() => {
    // Nueva generación de consultas: cualquier getDocs en vuelo de la
    // combinación de filtros anterior queda invalidado (ver cargarMas).
    requestGenRef.current += 1;

    setTodoCargado(false);
    setProductos([]);
    setErrorCarga(false);
    erroreRef.current = false; // único lugar donde se libera la guarda de error
    cargandoRef.current = false;
    setCargando(false);
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
    requestGenRef.current += 1; // invalida cualquier consulta zombie previa
    erroreRef.current = false;
    setErrorCarga(false);
    ultimoDocRef.current = null;
    setTodoCargado(false);
    setProductos([]);
  }, []);

  return { productos, cargando, todoCargado, errorCarga, cargarMas, reintentar };
};