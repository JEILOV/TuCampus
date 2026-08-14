// src/components/EstadisticasCampus.jsx
// ============================================================
//  TuCampus — Dashboard de Métricas por Sede (Panel Admin)
//
//  Tarjetas visuales con el total de Usuarios Registrados y
//  Publicaciones Activas, desglosados por campus (UNP/UTP/UCV),
//  usando consultas count() de Firestore vía statsService
//  (obtenerEstadisticasCampus) — no descarga documentos, solo
//  el conteo, así que es barato incluso con la colección grande.
//
//  USO (ver integración en PanelAdminAnuncios.jsx):
//    <EstadisticasCampus />
// ============================================================

import { useEffect, useState } from "react";
import { Users, Package, RefreshCw } from "lucide-react";
import { obtenerEstadisticasCampus } from "../services/statsService";
import { LISTA_UNIVERSIDADES } from "../config/universidades";

const EstadisticasCampus = () => {
  const [stats, setStats]         = useState(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(false);

  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const data = await obtenerEstadisticasCampus();
      setStats(data);
    } catch (err) {
      console.error("[EstadisticasCampus] Error al cargar estadísticas:", err);
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="rounded-[28px] bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[15px] font-extrabold text-ink">Estadísticas por Campus</p>
          <p className="text-[11.5px] font-semibold text-ink/45">
            Usuarios y publicaciones activas, en vivo
          </p>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          aria-label="Actualizar estadísticas"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-ink/60 disabled:opacity-50"
        >
          <RefreshCw size={16} className={cargando ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Totales generales ─────────────────────────────── */}
      <div className="mb-3.5 grid grid-cols-2 gap-3">
        <TarjetaMetricaTotal
          icono={<Users size={18} />}
          etiqueta="Usuarios Registrados"
          valor={stats?.totales.usuarios}
          cargando={cargando}
          color="#0639B8"
        />
        <TarjetaMetricaTotal
          icono={<Package size={18} />}
          etiqueta="Publicaciones Activas"
          valor={stats?.totales.publicaciones}
          cargando={cargando}
          color="#287653"
        />
      </div>

      {error && (
        <p className="mb-3 text-[12px] font-semibold text-red-500">
          No se pudieron cargar algunas métricas. Toca actualizar para reintentar.
        </p>
      )}

      {/* ── Desglose por sede ─────────────────────────────── */}
      <p className="mb-2 px-0.5 text-[12px] font-extrabold uppercase tracking-wide text-ink/40">
        Desglose por sede
      </p>
      <div className="flex flex-col gap-2.5">
        {LISTA_UNIVERSIDADES.map((u) => (
          <TarjetaMetricaSede
            key={u.id}
            universidad={u}
            datos={stats?.porSede[u.id]}
            cargando={cargando}
          />
        ))}
      </div>
    </div>
  );
};

// ── Tarjeta de total general (Usuarios / Publicaciones) ──────────
const TarjetaMetricaTotal = ({ icono, etiqueta, valor, cargando, color }) => (
  <div
    className="rounded-2xl p-3.5"
    style={{ backgroundColor: `${color}12` }}
  >
    <div
      className="mb-2 flex h-8 w-8 items-center justify-center rounded-full text-white"
      style={{ backgroundColor: color }}
    >
      {icono}
    </div>
    <p className="text-[20px] font-extrabold leading-none text-ink">
      {cargando ? "—" : (valor ?? 0).toLocaleString("es-PE")}
    </p>
    <p className="mt-1 text-[11px] font-bold leading-tight text-ink/55">{etiqueta}</p>
  </div>
);

// ── Fila de métricas de una sede puntual, con su color institucional ──
const TarjetaMetricaSede = ({ universidad, datos, cargando }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-background p-3">
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
      style={{ backgroundColor: universidad.color }}
    >
      {universidad.id.toUpperCase()}
    </span>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[12.5px] font-extrabold text-ink">{universidad.nombre}</p>
      <p className="text-[11px] font-semibold text-ink/45">Campus registrado</p>
    </div>
    <div className="flex shrink-0 gap-4 text-right">
      <div>
        <p className="text-[14px] font-extrabold text-ink">
          {cargando ? "—" : (datos?.usuarios ?? 0).toLocaleString("es-PE")}
        </p>
        <p className="text-[9.5px] font-bold uppercase tracking-wide text-ink/40">Usuarios</p>
      </div>
      <div>
        <p className="text-[14px] font-extrabold text-ink">
          {cargando ? "—" : (datos?.publicaciones ?? 0).toLocaleString("es-PE")}
        </p>
        <p className="text-[9.5px] font-bold uppercase tracking-wide text-ink/40">Activas</p>
      </div>
    </div>
  </div>
);

export default EstadisticasCampus;