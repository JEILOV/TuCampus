// src/components/PanelFiltrosLateral.jsx
// ============================================================
//  TuCampus — Panel lateral de filtros para escritorio (lg:, FASE 7A)
//
//  Columna fija (~256px) sticky bajo la cabecera, visible solo en lg
//  cuando Home está en modo grilla (búsqueda, categoría o filtros activos).
//  Reutiliza las constantes exportadas por FeedFiltros.jsx sin duplicarlas.
// ============================================================

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  CATEGORIAS,
  CONDICIONES,
  OPCIONES_ORDEN,
  FILTROS_AVANZADOS_INICIALES,
} from "./FeedFiltros";

const BloqueRangoPrecio = ({ filtros, onAplicarFiltros }) => {
  const [precioMin, setPrecioMin] = useState(filtros?.precioMin ?? "");
  const [precioMax, setPrecioMax] = useState(filtros?.precioMax ?? "");

  const manejarSubmitPrecio = (e) => {
    e.preventDefault();
    let min = String(precioMin ?? "").trim();
    let max = String(precioMax ?? "").trim();
    if (min !== "" && max !== "" && Number(min) > Number(max)) {
      [min, max] = [max, min];
      setPrecioMin(min);
      setPrecioMax(max);
    }
    onAplicarFiltros({
      ...(filtros || FILTROS_AVANZADOS_INICIALES),
      precioMin: min,
      precioMax: max,
    });
  };

  return (
    <form onSubmit={manejarSubmitPrecio} className="mt-5">
      <h3 className="mb-2.5 text-[12.5px] font-extrabold uppercase tracking-wide text-ink/55">
        Rango de precio (S/)
      </h3>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="Mín."
          aria-label="Precio mínimo"
          value={precioMin}
          onChange={(e) => setPrecioMin(e.target.value)}
          className="w-full rounded-2xl border-[1.5px] border-ink/10 bg-background px-3 py-2 text-[13px] font-bold text-ink placeholder:font-semibold placeholder:text-ink/35 focus:border-primary focus:outline-none"
        />
        <span className="shrink-0 text-ink/30">—</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="Máx."
          aria-label="Precio máximo"
          value={precioMax}
          onChange={(e) => setPrecioMax(e.target.value)}
          className="w-full rounded-2xl border-[1.5px] border-ink/10 bg-background px-3 py-2 text-[13px] font-bold text-ink placeholder:font-semibold placeholder:text-ink/35 focus:border-primary focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="mt-2.5 w-full rounded-btn bg-primary py-2.5 text-[13px] font-extrabold text-white shadow-soft transition-transform hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Aplicar
      </button>
    </form>
  );
};

const PanelFiltrosLateral = ({
  categoriaActiva = "todos",
  onCategoriaChange,
  filtros = FILTROS_AVANZADOS_INICIALES,
  onAplicarFiltros,
  onLimpiar,
}) => {
  const f = filtros || FILTROS_AVANZADOS_INICIALES;

  const cambiarCondicion = (condicionId) => {
    onAplicarFiltros?.({ ...f, condicion: condicionId });
  };

  const cambiarOrden = (ordenId) => {
    onAplicarFiltros?.({ ...f, orden: ordenId });
  };

  return (
    <aside
      aria-label="Filtros de productos"
      className="hidden w-64 shrink-0 self-start rounded-card bg-card p-5 shadow-soft lg:sticky lg:top-28 lg:block"
    >
      {/* Categorías */}
      <div>
        <h3 className="mb-2.5 text-[12.5px] font-extrabold uppercase tracking-wide text-ink/55">
          Categorías
        </h3>
        <div className="flex flex-col gap-1">
          {CATEGORIAS.map(({ key, label }) => {
            const activa = categoriaActiva === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onCategoriaChange?.(key)}
                className={`flex items-center justify-between rounded-2xl px-3.5 py-2 text-left text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activa
                    ? "bg-[var(--color-accent,#0639B8)] text-background shadow-soft"
                    : "text-ink/70 hover:bg-background hover:text-ink"
                }`}
              >
                <span>{label}</span>
                {activa && (
                  <span className="h-1.5 w-1.5 rounded-full bg-background" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Condición */}
      <div className="mt-5 border-t border-ink/10 pt-5">
        <h3 className="mb-2.5 text-[12.5px] font-extrabold uppercase tracking-wide text-ink/55">
          Condición
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {CONDICIONES.map(({ id, label }) => {
            const activa = f.condicion === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => cambiarCondicion(id)}
                className={`rounded-chip px-3 py-1.5 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activa
                    ? "bg-primary text-white"
                    : "bg-background text-ink/65 hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ordenar por */}
      <div className="mt-5 border-t border-ink/10 pt-5">
        <h3 className="mb-2.5 text-[12.5px] font-extrabold uppercase tracking-wide text-ink/55">
          Ordenar por
        </h3>
        <div className="flex flex-col gap-1.5">
          {OPCIONES_ORDEN.map(({ id, label }) => {
            const activo = f.orden === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => cambiarOrden(id)}
                className={`flex items-center justify-between rounded-2xl border-[1.5px] px-3.5 py-2.5 text-left text-[12.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activo
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-ink/10 text-ink/65 hover:border-ink/20 hover:text-ink"
                }`}
              >
                <span>{label}</span>
                {activo && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rango de precio */}
      <div className="border-t border-ink/10">
        <BloqueRangoPrecio
          key={`${f.precioMin ?? ""}-${f.precioMax ?? ""}`}
          filtros={f}
          onAplicarFiltros={onAplicarFiltros}
        />
      </div>

      {/* Limpiar filtros */}
      <div className="mt-5 border-t border-ink/10 pt-4">
        <button
          type="button"
          onClick={() => {
            if (typeof onLimpiar === "function") {
              onLimpiar();
            } else {
              onCategoriaChange?.("todos");
              onAplicarFiltros?.(FILTROS_AVANZADOS_INICIALES);
            }
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-btn border-[1.5px] border-ink/10 bg-background py-2.5 text-[13px] font-extrabold text-ink/70 transition-colors hover:border-ink/20 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RotateCcw size={14} strokeWidth={2.4} />
          <span>Limpiar filtros</span>
        </button>
      </div>
    </aside>
  );
};

export default PanelFiltrosLateral;
