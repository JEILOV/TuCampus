// src/components/ModalFlyerAnuncio.jsx
// ============================================================
//  TuCampus — Modal del Flyer / Afiche completo de un Anuncio
//
//  Se abre desde CarruselAnuncios.jsx cuando el anuncio tocado
//  tiene `imagenFlyerUrl`: en vez de navegar de inmediato a
//  `enlaceUrl`, muestra el afiche completo a pantalla completa.
//  Si el anuncio TAMBIÉN trae `enlaceUrl`, se ofrece un botón
//  "Ver más" para navegar a él; si no, el modal solo se puede
//  cerrar.
//
//  USO (ver integración en CarruselAnuncios.jsx):
//    {flyerAbierto && (
//      <ModalFlyerAnuncio
//        anuncio={flyerAbierto}
//        onClose={() => setFlyerAbierto(null)}
//        onIrAlEnlace={(enlace) => manejarEnlace(enlace)}
//      />
//    )}
// ============================================================

import { X, ExternalLink } from "lucide-react";

const ModalFlyerAnuncio = ({ anuncio, onClose, onIrAlEnlace }) => {
  if (!anuncio) return null;

  const enlace = (anuncio.enlaceUrl || "").trim();
  const tieneEnlace = enlace.length > 0;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-[420px] flex-col overflow-hidden rounded-[28px] bg-card shadow-soft">
        {/* Botón cerrar — flotante sobre la imagen */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
        >
          <X size={18} />
        </button>

        {/* Afiche completo — scrollable si es más alto que el viewport */}
        <div className="flex-1 overflow-y-auto bg-ink/5">
          <img
            src={anuncio.imagenFlyerUrl}
            alt={anuncio.titulo || "Flyer del anuncio"}
            className="w-full object-contain"
          />
        </div>

        {/* Título + acción, fuera del área de scroll de la imagen */}
        <div className="flex items-center gap-3 border-t border-ink/10 bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-extrabold text-ink">{anuncio.titulo}</p>
            {anuncio.subtitulo && (
              <p className="truncate text-[11.5px] font-semibold text-ink/50">{anuncio.subtitulo}</p>
            )}
          </div>
          {tieneEnlace && (
            <button
              type="button"
              onClick={() => onIrAlEnlace?.(enlace)}
              className="flex shrink-0 items-center gap-1.5 rounded-btn bg-primary px-4 py-2.5 text-[13px] font-extrabold text-white shadow-soft"
            >
              Ver más
              <ExternalLink size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalFlyerAnuncio;