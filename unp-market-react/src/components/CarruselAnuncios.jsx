// src/components/CarruselAnuncios.jsx
// ============================================================
//  TuCampus — Carrusel de Anuncios / Flyers del Campus
//
//  Franja deslizable horizontal para eventos de la universidad,
//  promociones o auspicios de negocios cercanos.
//
//  🔧 Fase "Anuncios dinámicos": ya no usa un arreglo estático.
//  Usa el hook useAnuncios (src/hooks/useAnuncios.js), que se
//  suscribe en tiempo real (onSnapshot) a la colección Firestore
//  "anuncios" vía adService.suscribirAnuncios(). Si esa colección
//  está vacía o falla la lectura (permisos, red, etc.), adService
//  entrega automáticamente ANUNCIOS_FALLBACK — así el carrusel
//  nunca se queda vacío ni rompe la pantalla de inicio.
//
//  🏫 Multicampus: recibe `universidadId` (la sede que Home está
//  explorando) y solo trae los anuncios de esa sede + los globales
//  ("Todas las sedes"). Cada anuncio exclusivo de un campus muestra
//  un badge con su sede; los globales muestran el badge "TuCampus".
//
//  NAVEGACIÓN AL HACER CLIC (a.enlaceUrl):
//    - Empieza con "http" → se abre en pestaña nueva (auspicio
//      externo, formulario, red social, etc.).
//    - Empieza con "/"    → navegación interna con react-router
//      (ej. "/producto?id=xxx" para promocionar un producto).
//    - Vacío/ausente      → la tarjeta no hace nada al tocarla,
//      solo es informativa.
//
//  USO:
//    <CarruselAnuncios universidadId={universidadActiva} />
// ============================================================

import { useNavigate } from "react-router-dom";
import { useAnuncios } from "../hooks/useAnuncios";
import { UNIVERSIDADES } from "../config/universidades";

// 🔧 Skeleton mientras se resuelve la primera respuesta de Firestore.
// Mismas dimensiones exactas que las tarjetas reales (h-28 w-64
// rounded-[24px]) para que no haya salto de layout al reemplazarlo.
const SkeletonAnuncios = () => (
  <div
    className="mt-5 flex gap-3 overflow-x-hidden px-4 pb-1"
    aria-hidden="true"
  >
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="h-28 w-64 shrink-0 animate-pulse rounded-[24px] bg-ink/10"
      />
    ))}
  </div>
);

const CarruselAnuncios = ({ universidadId }) => {
  const navigate = useNavigate();

  // 🔧 La suscripción (incluido el fallback a ANUNCIOS_FALLBACK) vive
  // en useAnuncios/adService — este componente solo consume el estado
  // y dibuja el carrusel.
  const { anuncios, cargando } = useAnuncios(universidadId);

  if (cargando) return <SkeletonAnuncios />;
  if (!anuncios || anuncios.length === 0) return null;

  const manejarClick = (a) => {
    const enlace = (a.enlaceUrl || "").trim();
    if (!enlace) return;

    if (enlace.startsWith("http")) {
      window.open(enlace, "_blank", "noopener,noreferrer");
    } else if (enlace.startsWith("/")) {
      navigate(enlace);
    }
  };

  // 🏫 Multicampus: texto + color del badge de sede. "global" (o
  // ausente, para compatibilidad con anuncios creados antes de este
  // cambio) → "TuCampus"; cualquier sede puntual → "Exclusivo XXX".
  const badgeDeAnuncio = (a) => {
    const sedeId = a.universidadId || "global";
    if (sedeId === "global") return { texto: "TuCampus", color: "rgba(0,0,0,0.55)" };
    const u = UNIVERSIDADES[sedeId];
    return {
      texto: `Exclusivo ${u ? u.id.toUpperCase() : sedeId.toUpperCase()}`,
      color: u?.color || "rgba(0,0,0,0.55)",
    };
  };

  return (
    <div
      className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Anuncios y flyers del campus"
    >
      {anuncios.map((a) => {
        const badge = badgeDeAnuncio(a);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => manejarClick(a)}
            className="relative flex h-28 w-64 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[24px] p-4 text-left shadow-soft transition-transform active:scale-[0.98]"
            style={{ backgroundColor: a.colorFondo || "#1c398e" }}
          >
            {a.imagenUrl && (
              <>
                <img
                  src={a.imagenUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Overlay para que el texto blanco siga siendo legible
                    sin importar qué tan clara sea la foto de fondo. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              </>
            )}

            {/* 🏫 Badge de sede — esquina superior derecha */}
            <span
              className="absolute right-2.5 top-2.5 rounded-chip px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-soft backdrop-blur"
              style={{ backgroundColor: badge.color }}
            >
              {badge.texto}
            </span>

            <div className="relative">
              <p className="text-[15px] font-extrabold leading-tight text-white">{a.titulo}</p>
              {a.subtitulo && (
                <p className="mt-1 text-[11.5px] font-semibold leading-snug text-white/80">
                  {a.subtitulo}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default CarruselAnuncios;