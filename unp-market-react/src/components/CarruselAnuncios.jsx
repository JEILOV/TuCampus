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
//  NAVEGACIÓN AL HACER CLIC:
//    - Si el anuncio tiene `imagenFlyerUrl` (Flyer Extendido) → se
//      abre un modal a pantalla completa con el afiche (ver
//      ModalFlyerAnuncio.jsx). Dentro del modal, si TAMBIÉN hay
//      `enlaceUrl`, se ofrece un botón "Ver más" para navegar a él.
//    - Si NO tiene `imagenFlyerUrl`, se usa el comportamiento
//      anterior con `a.enlaceUrl`:
//        · Empieza con "http" → se abre en pestaña nueva (auspicio
//          externo, formulario, red social, etc.).
//        · Empieza con "/"    → navegación interna con react-router
//          (ej. "/producto?id=xxx" para promocionar un producto).
//        · Vacío/ausente      → la tarjeta no hace nada al tocarla,
//          solo es informativa.
//
//  USO:
//    <CarruselAnuncios universidadId={universidadActiva} />
// ============================================================

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAnuncios } from "../hooks/useAnuncios";
import { useFlechasScroll } from "../hooks/useFlechasScroll";
import { UNIVERSIDADES } from "../config/universidades";
import ModalFlyerAnuncio from "./ModalFlyerAnuncio";

// 🔧 Skeleton mientras se resuelve la primera respuesta de Firestore.
// Mismas dimensiones exactas que las tarjetas reales (h-28 w-64 en móvil,
// md:h-36 md:w-80, lg:h-44 lg:w-[440px] rounded-[24px]) para que no haya
// salto de layout al reemplazarlo.
const SkeletonAnuncios = () => (
  <div
    className="mt-5 flex gap-3 overflow-x-hidden px-4 pb-1 md:px-5 lg:px-6"
    aria-hidden="true"
  >
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="h-28 w-64 shrink-0 animate-pulse rounded-[24px] bg-ink/10 md:h-36 md:w-80 lg:h-44 lg:w-[440px]"
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

  // 🖼️ Flyer Extendido: anuncio actualmente abierto en el modal de
  // afiche completo (null = modal cerrado).
  const [flyerAbierto, setFlyerAbierto] = useState(null);

  const scrollRef = useRef(null);
  // FASE 7A.1: la dependencia incluye `cargando` para que las flechas se
  // recalculen cuando el contenedor real (scrollRef) aparece tras el
  // skeleton, aunque la cantidad de anuncios no cambie (p. ej. caché).
  const { puedeIzq, puedeDer, ir } = useFlechasScroll(
    scrollRef,
    `${cargando}-${anuncios?.length || 0}`
  );

  if (cargando) return <SkeletonAnuncios />;
  if (!anuncios || anuncios.length === 0) return null;

  // Navega/abre `enlace` según su formato — usado tanto por el click
  // directo en la tarjeta (sin flyer) como por el botón "Ver más"
  // dentro del modal del flyer.
  const irAlEnlace = (enlace) => {
    const limpio = (enlace || "").trim();
    if (!limpio) return;

    if (limpio.startsWith("http")) {
      window.open(limpio, "_blank", "noopener,noreferrer");
    } else if (limpio.startsWith("/")) {
      navigate(limpio);
    }
  };

  const manejarClick = (a) => {
    // Si el anuncio tiene flyer, se abre el modal en vez de navegar
    // de inmediato — la navegación al enlace queda como acción
    // explícita ("Ver más") dentro del modal.
    if ((a.imagenFlyerUrl || "").trim()) {
      setFlyerAbierto(a);
      return;
    }
    irAlEnlace(a.enlaceUrl);
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
    <>
      <div className="relative mt-5">
        {puedeIzq && (
          <button
            type="button"
            onClick={() => ir("izq")}
            aria-label="Anterior"
            className="absolute left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card text-ink shadow-softLg ring-1 ring-ink/5 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
        )}

        {/* FASE 7A.1: md:scroll-px-5 lg:scroll-px-6 hacen que el snap respete
            el padding, así la primera tarjeta queda alineada con el resto del
            Inicio (BannerNotificaciones y secciones) en lugar de pegarse al borde. */}
        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:scroll-px-5 md:px-5 lg:scroll-px-6 lg:px-6"
          aria-label="Anuncios y flyers del campus"
        >
          {anuncios.map((a) => {
            const badge = badgeDeAnuncio(a);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => manejarClick(a)}
                className="relative flex h-28 w-64 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[24px] p-4 text-left shadow-soft transition-all duration-200 ease-out active:scale-[0.98] md:h-36 md:w-80 lg:h-44 lg:w-[440px]"
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
                  <p className="text-[15px] font-extrabold leading-tight text-white md:text-[16px] lg:text-[18px]">
                    {a.titulo}
                  </p>
                  {a.subtitulo && (
                    <p className="mt-1 text-[11.5px] font-semibold leading-snug text-white/80 md:text-[12.5px]">
                      {a.subtitulo}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {puedeDer && (
          <button
            type="button"
            onClick={() => ir("der")}
            aria-label="Siguiente"
            className="absolute right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-card text-ink shadow-softLg ring-1 ring-ink/5 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {flyerAbierto && (
        <ModalFlyerAnuncio
          anuncio={flyerAbierto}
          onClose={() => setFlyerAbierto(null)}
          onIrAlEnlace={(enlace) => {
            irAlEnlace(enlace);
            setFlyerAbierto(null);
          }}
        />
      )}
    </>
  );
};

export default CarruselAnuncios;
