// src/hooks/useFlechasScroll.js
// ============================================================
//  TuCampus — Hook para flechas de desplazamiento horizontal (FASE 7A)
//
//  Dado un ref al contenedor con overflow-x-auto, calcula si hay
//  contenido desplazable a la izquierda (`puedeIzq`) o a la derecha
//  (`puedeDer`) y expone `ir(direccion)` para hacer scrollBy suave
//  del 80 % del ancho visible.
// ============================================================

import { useState, useEffect, useCallback } from "react";

const UMBRAL_PX = 4;

/**
 * Controla el estado y desplazamiento de flechas laterales en un carrusel.
 *
 * @param {React.RefObject<HTMLElement>} scrollRef
 * @param {any} [dependencia] - Valor opcional para recalcular cuando cambian los items
 * @returns {{ puedeIzq: boolean, puedeDer: boolean, ir: (direccion: "izq"|"der"|number) => void }}
 */
export const useFlechasScroll = (scrollRef, dependencia = null) => {
  const [puedeIzq, setPuedeIzq] = useState(false);
  const [puedeDer, setPuedeDer] = useState(false);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;

    const recalcular = () => {
      const nodo = scrollRef?.current;
      if (!nodo) return;
      const scrollLeft = Math.round(nodo.scrollLeft || 0);
      const clientWidth = Math.round(nodo.clientWidth || 0);
      const scrollWidth = Math.round(nodo.scrollWidth || 0);

      setPuedeIzq(scrollLeft > UMBRAL_PX);
      setPuedeDer(scrollLeft + clientWidth < scrollWidth - UMBRAL_PX);
    };

    const rafId =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(recalcular)
        : null;

    el.addEventListener("scroll", recalcular, { passive: true });

    let resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => recalcular());
      resizeObserver.observe(el);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", recalcular);
    }

    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
      }
      el.removeEventListener("scroll", recalcular);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else if (typeof window !== "undefined") {
        window.removeEventListener("resize", recalcular);
      }
    };
  }, [scrollRef, dependencia]);

  const ir = useCallback(
    (direccion) => {
      const el = scrollRef?.current;
      if (!el || typeof el.scrollBy !== "function") return;
      const signo =
        direccion === "izq" || direccion === "left" || direccion < 0 ? -1 : 1;
      const paso = Math.max(160, Math.round((el.clientWidth || 300) * 0.8));
      el.scrollBy({ left: signo * paso, behavior: "smooth" });
    },
    [scrollRef]
  );

  return { puedeIzq, puedeDer, ir };
};

export default useFlechasScroll;
