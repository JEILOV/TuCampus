// src/components/SeccionCarrusel.jsx
// ============================================================
//  TuCampus — Fila horizontal deslizable de productos por sección
//
//  Reutiliza <ProductCard /> sin modificarlo, envolviendo cada item
//  en un contenedor fijo de 156px (md: 190px, lg: 204px) con scroll-snap
//  horizontal. Incluye carga diferida mediante IntersectionObserver
//  (rootMargin 300px) para las secciones a partir de la tercera (índice >= 2)
//  y flechas laterales en md+.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { useFlechasScroll } from "../hooks/useFlechasScroll";

/**
 * Función pura que decide si una sección debe disparar su carga de datos:
 * - Si el entorno no tiene IntersectionObserver, todas cargan de inmediato.
 * - Las dos primeras secciones (índices 0 y 1) cargan de inmediato.
 * - El resto (índice >= 2) espera a que el observer marque `esVisible: true`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const debeCargarSeccion = ({
  indice = 0,
  esVisible = false,
  soportaObserver = typeof IntersectionObserver === "function",
} = {}) => {
  if (!soportaObserver) return true;
  if (indice < 2) return true;
  return Boolean(esVisible);
};

/**
 * Función pura que decide si se debe invocar `onVisible` para iniciar la carga:
 * solo cuando la sección ya está habilitada (por índice o visibilidad), sigue
 * pendiente de carga y no hay una carga en curso.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const debeSolicitarCarga = ({
  habilitada = false,
  pendienteCarga = false,
  cargando = false,
} = {}) => Boolean(habilitada && pendienteCarga && !cargando);

const useVisible = (ref, { indice = 0, rootMargin = "300px" } = {}) => {
  const soportaObserver = typeof IntersectionObserver === "function";
  const [visible, setVisible] = useState(() =>
    debeCargarSeccion({ indice, esVisible: false, soportaObserver })
  );

  useEffect(() => {
    if (visible || !soportaObserver) return undefined;
    const nodo = ref.current;
    if (!nodo) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    );

    observer.observe(nodo);
    return () => observer.disconnect();
  }, [ref, visible, soportaObserver, rootMargin]);

  return debeCargarSeccion({ indice, esVisible: visible, soportaObserver });
};

const SkeletonTarjeta = () => (
  <div
    aria-hidden="true"
    className="w-[156px] shrink-0 snap-start overflow-hidden rounded-card bg-card shadow-soft md:w-[190px] lg:w-[204px]"
  >
    <div className="aspect-square w-full animate-pulse bg-ink/10" />
    <div className="p-3">
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-ink/10" />
      <div className="mt-2 flex items-center gap-1.5">
        <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-ink/10" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-ink/10" />
      </div>
    </div>
  </div>
);

const SeccionCarrusel = ({
  titulo,
  icono = null,
  productos = [],
  cargando = false,
  onVerTodo,
  onVerDetalle,
  ariaLabel,
  indice = 0,
  onVisible,
  pendienteCarga = false,
}) => {
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const onVisibleRef = useRef(onVisible);
  const habilitada = useVisible(containerRef, { indice, rootMargin: "300px" });

  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    if (debeSolicitarCarga({ habilitada, pendienteCarga, cargando })) {
      onVisibleRef.current?.();
    }
  }, [habilitada, pendienteCarga, cargando]);

  const lista = Array.isArray(productos) ? productos : [];
  const { puedeIzq, puedeDer, ir } = useFlechasScroll(
    scrollRef,
    `${cargando}-${pendienteCarga}-${lista.length}`
  );

  // Si terminó de cargar y hay 0 productos, no se renderiza nada (ni el título).
  if (!cargando && !pendienteCarga && lista.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="mt-6 first:mt-0 lg:rounded-card lg:bg-card lg:p-6 lg:shadow-soft"
    >
      <div className="flex items-center justify-between">
        {pendienteCarga && !habilitada ? (
          <div
            aria-hidden="true"
            className="h-6 w-36 animate-pulse rounded bg-ink/10"
          />
        ) : (
          <>
            <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-ink">
              {icono && <span className="shrink-0">{icono}</span>}
              <span>{titulo}</span>
            </h2>
            {onVerTodo && (
              <button
                type="button"
                onClick={onVerTodo}
                className="flex items-center gap-0.5 text-[13px] font-bold text-primary transition-opacity active:opacity-70"
              >
                Ver todo
                <ChevronRight size={15} strokeWidth={2.5} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="relative mt-3">
        {puedeIzq && (
          <button
            type="button"
            onClick={() => ir("izq")}
            aria-label="Anterior"
            className="absolute -left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card text-ink shadow-softLg ring-1 ring-ink/5 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
        )}

        <div
          ref={scrollRef}
          role="region"
          aria-label={ariaLabel || titulo}
          tabIndex={0}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:outline-none lg:mx-0 lg:px-0"
        >
          {cargando || pendienteCarga ? (
            <>
              <SkeletonTarjeta />
              <SkeletonTarjeta />
              <SkeletonTarjeta />
            </>
          ) : (
            <>
              {lista.map((p) => (
                <div
                  key={p.id}
                  className="w-[156px] shrink-0 snap-start md:w-[190px] lg:w-[204px]"
                >
                  <ProductCard producto={p} onVerDetalle={onVerDetalle} />
                </div>
              ))}

              {onVerTodo && (
                <button
                  type="button"
                  onClick={onVerTodo}
                  className="flex min-h-[218px] w-[156px] shrink-0 snap-start flex-col items-center justify-center gap-2 self-stretch rounded-card border-[1.5px] border-ink/10 bg-card p-4 text-center shadow-soft transition-transform duration-200 ease-out active:scale-[0.98] md:w-[190px] lg:w-[204px]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ChevronRight size={20} strokeWidth={2.5} />
                  </span>
                  <span className="text-[13px] font-extrabold text-ink">
                    Ver todo
                  </span>
                  <span className="text-[11px] font-semibold text-ink/50">
                    {titulo}
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {puedeDer && (
          <button
            type="button"
            onClick={() => ir("der")}
            aria-label="Siguiente"
            className="absolute -right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card text-ink shadow-softLg ring-1 ring-ink/5 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
};

export default SeccionCarrusel;
