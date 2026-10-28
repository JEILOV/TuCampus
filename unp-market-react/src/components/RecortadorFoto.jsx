// src/components/RecortadorFoto.jsx
// ============================================================
//  TuCampus — Modal de recorte y rotación de fotos (FASE 7D.2)
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { RotateCw, ZoomIn, ZoomOut, Check, Loader2, X } from "lucide-react";
import { recortarFoto } from "../utils/cropUtils";

/**
 * Modal para recortar y rotar fotos con relación de aspecto 1:1.
 * Se monta en un portal directo a document.body con z-[200] y bloqueo de scroll.
 *
 * @param {Object} props
 * @param {File|Blob|string} props.imagen - Foto a recortar (File, Blob o URL)
 * @param {(fileRecortado: File) => void} props.onListo - Callback al confirmar recorte
 * @param {(imagenOriginal: File|Blob|string) => void} props.onUsarOriginal - Callback para omitir recorte
 * @param {() => void} props.onCancelar - Callback al cancelar
 */
const RecortadorFoto = ({ imagen, onListo, onUsarOriginal, onCancelar }) => {
  // Inicialización síncrona: evita efectos con setState que provocan render en cascada
  const [imageSrc] = useState(() => {
    if (!imagen) return "";
    if (typeof imagen === "string") return imagen;
    if (imagen instanceof Blob) return URL.createObjectURL(imagen);
    return "";
  });

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Revocar el object URL generado al desmontar para evitar fugas de memoria
  useEffect(() => {
    return () => {
      if (imageSrc && typeof imagen !== "string") {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc, imagen]);

  // Bloquear el scroll del body mientras el modal está activo
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Manejar tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !procesando) {
        onCancelar?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancelar, procesando]);

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const rotar90 = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleListo = async () => {
    if (!croppedAreaPixels || procesando) return;
    setProcesando(true);
    setErrorMsg("");

    try {
      const nombreArchivo =
        imagen instanceof File && imagen.name
          ? `${imagen.name.replace(/\.[^.]+$/, "")}-recortada.jpg`
          : "foto-recortada.jpg";

      const fileRecortado = await recortarFoto(
        imagen,
        croppedAreaPixels,
        rotation,
        nombreArchivo
      );
      onListo(fileRecortado);
    } catch (err) {
      console.error("[RecortadorFoto] Error al procesar recorte:", err);
      setErrorMsg("No se pudo recortar la imagen. Puedes usarla sin recortar.");
    } finally {
      setProcesando(false);
    }
  };

  if (!imageSrc) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recortar foto"
      className="fixed inset-0 z-[200] flex flex-col bg-neutral-950 text-white select-none"
    >
      {/* ── Cabecera ────────────────────────────────────────── */}
      <header className="relative flex items-center justify-between border-b border-white/10 px-4 py-3 bg-neutral-900/90 backdrop-blur z-10">
        <button
          type="button"
          onClick={onCancelar}
          disabled={procesando}
          aria-label="Cerrar recorte"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <X size={20} />
        </button>

        <h2 className="text-[15px] font-extrabold tracking-wide text-white">
          Ajustar foto
        </h2>

        <button
          type="button"
          onClick={rotar90}
          disabled={procesando}
          aria-label="Rotar 90 grados"
          className="inline-flex items-center gap-1.5 rounded-btn bg-white/10 px-3 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-white/20 active:scale-95 disabled:opacity-50"
        >
          <RotateCw size={15} />
          <span className="hidden sm:inline">Rotar 90°</span>
        </button>
      </header>

      {/* ── Contenedor de Cropper ───────────────────────────── */}
      <main className="relative flex-1 w-full overflow-hidden bg-black">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
          showGrid
        />
        {errorMsg && (
          <div className="absolute top-4 left-4 right-4 z-20 rounded-xl bg-red-600/90 px-3.5 py-2 text-center text-[13px] font-bold text-white shadow-lg backdrop-blur">
            {errorMsg}
          </div>
        )}
      </main>

      {/* ── Barra de controles y acciones ───────────────────── */}
      <footer className="border-t border-white/10 bg-neutral-900/95 backdrop-blur px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] z-10">
        {/* Control de Zoom (1 a 3) */}
        <div className="mx-auto flex max-w-sm items-center gap-3 px-2 py-1">
          <ZoomOut size={16} className="text-white/60 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Nivel de zoom"
            disabled={procesando}
            className="flex-1 h-1.5 accent-primary bg-white/25 rounded-lg appearance-none cursor-pointer"
          />
          <ZoomIn size={16} className="text-white/60 shrink-0" />
        </div>

        {/* Botones de acción */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={procesando}
            className="rounded-btn px-3.5 py-2 text-[13px] font-bold text-white/70 transition-colors hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUsarOriginal(imagen)}
              disabled={procesando}
              className="rounded-btn border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-bold text-white transition-colors hover:bg-white/20 active:scale-95 disabled:opacity-50"
            >
              Usar sin recortar
            </button>
            <button
              type="button"
              onClick={handleListo}
              disabled={procesando || !croppedAreaPixels}
              className="inline-flex items-center gap-1.5 rounded-btn bg-primary px-4 py-2 text-[13px] font-bold text-background shadow-soft transition-colors hover:bg-primary-dark active:scale-95 disabled:opacity-50"
            >
              {procesando ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  <span>Listo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>,
    document.body
  );
};

export default RecortadorFoto;
