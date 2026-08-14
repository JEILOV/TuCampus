// src/services/statsService.js
// ============================================================
//  TuCampus — Estadísticas por Campus (Panel Admin)
//
//  Usa consultas de agregación count() de Firestore
//  (getCountFromServer) para traer SOLO el número de documentos
//  que matchean cada filtro, sin descargar los documentos en sí
//  — mucho más barato en lecturas que un getDocs() + .length,
//  sobre todo a medida que crecen /usuarios y /productos.
//
//  Trae, para cada sede soportada (ver config/universidades.js)
//  + el total general:
//    - Usuarios registrados  → count(/usuarios where universidadId == sede)
//    - Publicaciones activas → count(/productos where estado == "disponible"
//                                     AND universidadId == sede)
//
//  USO (ver EstadisticasCampus.jsx):
//    const stats = await obtenerEstadisticasCampus();
//    stats.totales.usuarios        // number
//    stats.totales.publicaciones   // number
//    stats.porSede.unp.usuarios    // number
//    stats.porSede.unp.publicaciones
// ============================================================

import {
  collection, query, where, getCountFromServer,
} from "firebase/firestore";
import { db } from "./firebase";
import { logError } from "../utils/errorHandler";
import { LISTA_UNIVERSIDADES } from "../config/universidades";

const COLECCION_USUARIOS   = "usuarios";
const COLECCION_PRODUCTOS  = "productos";
const ESTADO_ACTIVO        = "disponible";

/**
 * Cuenta los documentos que matchean una query, devolviendo 0 en vez de
 * lanzar si la consulta falla (reglas, índice faltante, sin red, etc.)
 * — así una sede con problemas no rompe el dashboard completo.
 */
const contarSeguro = async (q, etiqueta) => {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    logError(`[statsService] ${etiqueta}`, err);
    return 0;
  }
};

/**
 * Obtiene el conteo de usuarios registrados y publicaciones activas,
 * tanto el total general como el desglose por cada sede soportada.
 *
 * @returns {Promise<{
 *   totales: { usuarios: number, publicaciones: number },
 *   porSede: Record<string, { usuarios: number, publicaciones: number }>,
 * }>}
 */
export const obtenerEstadisticasCampus = async () => {
  const usuariosRef  = collection(db, COLECCION_USUARIOS);
  const productosRef = collection(db, COLECCION_PRODUCTOS);

  // ── Totales generales ──────────────────────────────────────
  const [totalUsuarios, totalPublicaciones] = await Promise.all([
    contarSeguro(usuariosRef, "total usuarios"),
    contarSeguro(
      query(productosRef, where("estado", "==", ESTADO_ACTIVO)),
      "total publicaciones activas",
    ),
  ]);

  // ── Desglose por sede (una consulta count() por sede y colección,
  //    en paralelo — 3 sedes × 2 colecciones = 6 lecturas de conteo) ──
  const porSedeEntries = await Promise.all(
    LISTA_UNIVERSIDADES.map(async (u) => {
      const [usuariosSede, publicacionesSede] = await Promise.all([
        contarSeguro(
          query(usuariosRef, where("universidadId", "==", u.id)),
          `usuarios ${u.id}`,
        ),
        contarSeguro(
          query(
            productosRef,
            where("estado", "==", ESTADO_ACTIVO),
            where("universidadId", "==", u.id),
          ),
          `publicaciones ${u.id}`,
        ),
      ]);
      return [u.id, { usuarios: usuariosSede, publicaciones: publicacionesSede }];
    }),
  );

  return {
    totales: { usuarios: totalUsuarios, publicaciones: totalPublicaciones },
    porSede: Object.fromEntries(porSedeEntries),
  };
};