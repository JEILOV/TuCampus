// src/components/CarruselAnuncios.jsx
// ============================================================
//  TuCampus — Carrusel de Anuncios / Flyers del Campus
//
//  Franja deslizable horizontal para eventos de la universidad,
//  promociones o auspicios de negocios cercanos.
//
//  🔧 Fase "Anuncios dinámicos": ya no usa un arreglo estático.
//  Se suscribe en tiempo real (onSnapshot) a la colección
//  Firestore "anuncios" vía adService.suscribirAnuncios(). Si esa
//  colección está vacía o falla la lectura (permisos, red, etc.),
//  adService entrega automáticamente ANUNCIOS_FALLBACK — así el
//  carrusel nunca se queda vacío ni rompe la pantalla de inicio.
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
//    <CarruselAnuncios />
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { suscribirAnuncios } from "../services/adService";

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

const CarruselAnuncios = () => {
  const navigate = useNavigate();

  // 🔧 Ya NO se inicializa con ANUNCIOS_FALLBACK: eso era lo que
  // causaba el destello de mocks antes de que llegara la primera
  // respuesta real de Firestore. Arranca vacío + cargando=true, y
  // muestra un skeleton hasta que `suscribirAnuncios` invoque el
  // callback por primera vez (con datos reales, o con
  // ANUNCIOS_FALLBACK si adService detectó que la colección está
  // vacía o que la lectura falló — esa sustitución sigue viviendo
  // en adService.js, no aquí).
  const [anuncios, setAnuncios] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsubscribe = suscribirAnuncios((lista) => {
      setAnuncios(lista);
      setCargando(false);
    });
    return () => unsubscribe();
  }, []);

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

  return (
    <div
      className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Anuncios y flyers del campus"
    >
      {anuncios.map((a) => (
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
          <div className="relative">
            <p className="text-[15px] font-extrabold leading-tight text-white">{a.titulo}</p>
            {a.subtitulo && (
              <p className="mt-1 text-[11.5px] font-semibold leading-snug text-white/80">
                {a.subtitulo}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
};

export default CarruselAnuncios;