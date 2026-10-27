// src/hooks/useMediaQuery.js
// ============================================================
//  TuCampus — Hook reactivo para media queries (FASE 7A)
//
//  Lee el valor inicial de forma síncrona con window.matchMedia
//  (sin parpadeo en el primer render) y se suscribe a cambios
//  con addEventListener("change"). Es seguro en entornos sin DOM
//  o sin matchMedia (Vitest en Node / SSR): devuelve false.
// ============================================================

import { useState, useEffect } from "react";

const evaluarConsulta = (consulta) => {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  try {
    return Boolean(window.matchMedia(consulta)?.matches);
  } catch {
    return false;
  }
};

/**
 * Evalúa y escucha una media query CSS en tiempo real.
 *
 * @param {string} consulta - Media query CSS, ej. "(min-width: 768px)"
 * @returns {boolean}
 */
export const useMediaQuery = (consulta) => {
  const [coincide, setCoincide] = useState(() => evaluarConsulta(consulta));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    let mql;
    try {
      mql = window.matchMedia(consulta);
    } catch {
      return undefined;
    }
    if (!mql) return undefined;

    const manejarCambio = (evento) => {
      setCoincide(Boolean(evento.matches));
    };

    // Sincronizar si el valor cambió entre el render y el efecto
    if (Boolean(mql.matches) !== coincide) {
      manejarCambio({ matches: mql.matches });
    }

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", manejarCambio);
      return () => mql.removeEventListener("change", manejarCambio);
    }
    if (typeof mql.addListener === "function") {
      mql.addListener(manejarCambio);
      return () => mql.removeListener(manejarCambio);
    }
    return undefined;
  }, [consulta, coincide]);

  return coincide;
};

/** Tablet y escritorio: >= 768px (md:) */
export const useEsAncho = () => useMediaQuery("(min-width: 768px)");

/** Escritorio: >= 1024px (lg:) */
export const useEsEscritorio = () => useMediaQuery("(min-width: 1024px)");

export default useMediaQuery;
