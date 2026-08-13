// src/hooks/useAnuncios.js
// ============================================================
//  TuCampus — Hook de suscripción a Anuncios (Home / Carrusel)
//
//  EXTRAE DE: CarruselAnuncios.jsx
//    - Estado: anuncios, cargando
//    - Lógica: suscripción en tiempo real vía adService.suscribirAnuncios,
//      con fallback automático a ANUNCIOS_FALLBACK si la colección
//      está vacía o si la lectura falla (permisos, red, índice
//      faltante, etc.) — esa parte sigue viviendo en adService.js.
//
//  🏫 Multicampus: recibe `universidadActiva` (la sede que el usuario
//  está EXPLORANDO en Home, no necesariamente la de su perfil — mismo
//  criterio que useProducts) y trae tanto los anuncios propios de esa
//  sede como los "global" (visibles en todas). Se vuelve a suscribir
//  cada vez que `universidadActiva` cambia (ej. el usuario cambia de
//  campus en el selector de Home).
//
//  LO QUE QUEDA EN CarruselAnuncios.jsx:
//    - UI (carrusel, skeleton, badges de sede, navegación al click)
// ============================================================

import { useState, useEffect } from "react";
import { suscribirAnuncios } from "../services/adService";

/**
 * @param {string} universidadActiva  Sede activa (ver Home.jsx). Si no
 *                                    se pasa, adService asume "unp".
 * @returns {{ anuncios: Array, cargando: boolean }}
 *
 * @example
 *   const { anuncios, cargando } = useAnuncios(universidadActiva);
 */
export const useAnuncios = (universidadActiva) => {
  // 🔧 Igual que CarruselAnuncios antes: NO se inicializa con
  // ANUNCIOS_FALLBACK para evitar el destello de mocks antes de que
  // llegue la primera respuesta real de Firestore.
  const [anuncios, setAnuncios] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    const unsubscribe = suscribirAnuncios(universidadActiva, (lista) => {
      setAnuncios(lista);
      setCargando(false);
    });
    return () => unsubscribe();
  }, [universidadActiva]);

  return { anuncios, cargando };
};