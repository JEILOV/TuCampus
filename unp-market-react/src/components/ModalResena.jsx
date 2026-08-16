// src/components/ModalResena.jsx
// ============================================================
//  TuCampus — Modal de calificación con estrellas (Fase 3 · Opción B)
//
//  Se abre desde el perfil del vendedor (Vendedor.jsx), con el
//  botón "Calificar vendedor" o "Editar mi reseña". Si el autor ya
//  tenía una reseña para ese vendedor, `resenaExistente` precarga
//  las estrellas y el comentario para editarlos in-place.
//
//  No sabe nada de Firestore directamente: delega el guardado a
//  reviewService.guardarOActualizarResena (writeBatch atómico,
//  ID determinística `${autorUid}_${vendedorUid}`).
// ============================================================

import { useState, useEffect } from "react";
import { guardarOActualizarResena } from "../services/reviewService";

// ── Ícono de estrella (relleno condicional vía prop) ─────────
const Estrella = ({ activa, size = 38 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}
    fill={activa ? "#f5a623" : "none"}
    stroke={activa ? "#f5a623" : "#c3c6d4"}
    strokeWidth="1.6" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.63 22 9.24 16.5 13.97 18.18 21 12 17.27 5.82 21 7.5 13.97 2 9.24 8.91 8.63 12 2" />
  </svg>
);

/**
 * @param {Object} props
 * @param {boolean} props.abierto
 * @param {() => void} props.onCerrar
 * @param {string} props.vendedorUid
 * @param {string} props.vendedorNombre
 * @param {string} props.miUid
 * @param {string} props.miNombre
 * @param {string} [props.miAvatar]
 * @param {Object|null} [props.resenaExistente]  Mi reseña previa a este vendedor, si ya existe (precarga el form).
 * @param {(mensaje: string, tipo?: string) => void} props.onToast
 * @param {(resultado: {esNueva: boolean, nuevoTotal: number, nuevoPromedio: number}) => void} [props.onGuardado]
 */
const ModalResena = ({
  abierto, onCerrar,
  vendedorUid, vendedorNombre,
  miUid, miNombre, miAvatar,
  resenaExistente = null,
  onToast, onGuardado,
}) => {
  const [calificacion, setCalificacion] = useState(0);
  const [hover, setHover]               = useState(0);
  const [comentario, setComentario]     = useState("");
  const [enviando, setEnviando]         = useState(false);

  const esEdicion = !!resenaExistente;

  // Precargar estrellas/comentario cada vez que se abre el modal
  // (o cambia la reseña existente que se está por editar).
  useEffect(() => {
    if (!abierto) return;
    setCalificacion(resenaExistente?.estrellas || 0);
    setComentario(resenaExistente?.comentario || "");
  }, [abierto, resenaExistente]);

  if (!abierto) return null;

  const handleEnviar = async () => {
    if (!calificacion) {
      onToast?.("Elegí de 1 a 5 estrellas antes de enviar", "error");
      return;
    }
    setEnviando(true);
    try {
      const resultado = await guardarOActualizarResena({
        vendedorUid,
        autorUid:    miUid,
        autorNombre: miNombre,
        autorAvatar: miAvatar,
        estrellas:   calificacion,
        comentario,
      });
      onToast?.(esEdicion ? "Tu reseña fue actualizada ✏️" : "¡Gracias por tu reseña! 🌟");
      onGuardado?.(resultado);
      onCerrar();
    } catch (err) {
      onToast?.(err.message || "No se pudo guardar la reseña", "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(15,37,64,0.45)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "480px", background: "white",
          borderRadius: "24px 24px 0 0", padding: "24px 22px 28px",
          boxSizing: "border-box", boxShadow: "0 -8px 30px rgba(0,0,0,0.15)",
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        <div style={{
          width: "40px", height: "5px", borderRadius: "3px",
          background: "#e8e8f0", margin: "0 auto 18px",
        }} />

        <h2 style={{
          margin: "0 0 4px", fontSize: "1.15rem", fontWeight: 800,
          color: "var(--azul-oscuro)", textAlign: "center",
        }}>
          {esEdicion ? "Editar tu reseña" : `Califica a ${vendedorNombre || "este vendedor"}`}
        </h2>
        <p style={{
          margin: "0 0 20px", fontSize: "0.85rem", color: "#5c5c7a",
          fontWeight: 600, textAlign: "center",
        }}>
          {esEdicion
            ? "Podés cambiar tu calificación y comentario cuando quieras."
            : "¿Cómo fue tu experiencia comprándole a este vendedor?"}
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "6px", margin: "8px 0 18px" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCalificacion(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
            >
              <Estrella activa={n <= (hover || calificacion)} />
            </button>
          ))}
        </div>

        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Comentario opcional (ej. Todo perfecto, puntual y amable)"
          rows={3}
          maxLength={300}
          style={{
            width: "100%", boxSizing: "border-box", resize: "none",
            border: "1.5px solid #e8e8f0", borderRadius: "14px",
            padding: "12px 14px", fontSize: "0.88rem",
            fontFamily: "'Nunito', sans-serif", fontWeight: 600,
            color: "var(--azul-oscuro)", outline: "none", marginBottom: "16px",
          }}
        />

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onCerrar}
            disabled={enviando}
            className="resena-btn-cancelar"
            style={{
              flex: 1, background: "var(--bg-crema)", color: "#5c5c7a",
              border: "1.5px solid #e8e8f0", borderRadius: "14px",
              padding: "13px", fontWeight: 700, cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando || !calificacion}
            className="resena-btn-enviar"
            style={{
              flex: 1.4,
              background: calificacion ? "var(--verde-marca)" : "#e8e8f0",
              color: "white", border: "none", borderRadius: "14px",
              padding: "13px", fontWeight: 800,
              cursor: calificacion && !enviando ? "pointer" : "not-allowed",
              fontFamily: "'Nunito', sans-serif",
              opacity: enviando ? 0.75 : 1,
            }}
          >
            {enviando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Enviar reseña"}
          </button>
        </div>
      </div>

      {/* 🔧 Micro-interacción táctil: estilos inline no soportan el
          pseudo-selector :active, así que se define acá (mismo patrón
          que ya usa Spinner.jsx para @keyframes). transform en vez de
          scale de Tailwind porque este modal no está migrado a
          Tailwind todavía. */}
      <style>{`
        .resena-btn-cancelar, .resena-btn-enviar {
          transition: transform 0.2s ease-out;
        }
        .resena-btn-cancelar:active:not(:disabled),
        .resena-btn-enviar:active:not(:disabled) {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
};

export default ModalResena;