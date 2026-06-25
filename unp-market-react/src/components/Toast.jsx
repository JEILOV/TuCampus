// src/components/Toast.jsx
// ============================================================
//  UNP Market — Componente Toast unificado
//
//  REEMPLAZA 4 implementaciones distintas encontradas en:
//    • Home.jsx     → Toast con SVG + tipo success/error
//    • Perfil.jsx   → Toast sin SVG, colores por tipo
//    • Publicar.jsx → Toast inline con SVG, sin componente
//    • Producto.jsx → Toast negro sin tipo (solo mensaje)
//    • EditarProducto.jsx → igual que Publicar
//
//  USO — dos modos según la página:
//
//  Modo array (Home, Perfil — múltiples toasts simultáneos):
//    const [toasts, setToasts] = useState([]);
//    const mostrarToast = useToast(setToasts);
//    ...
//    {toasts.map(t => <Toast key={t.id} mensaje={t.mensaje} tipo={t.tipo} />)}
//
//  Modo single (Publicar, EditarProducto — un toast a la vez):
//    const [toast, setToast] = useState(null);
//    const mostrarToast = useToast(setToast, { single: true });
//    ...
//    {toast && <Toast mensaje={toast.mensaje} tipo={toast.tipo} />}
// ============================================================

// ── Componente visual ────────────────────────────────────────
const Toast = ({ mensaje, tipo = "success" }) => {
  const esError = tipo === "error";

  return (
    <div style={{
      background:    esError ? "#fecaca" : "#1e293b",
      color:         esError ? "#991b1b" : "#ffffff",
      padding:       "14px 18px",
      borderRadius:  "16px",
      fontSize:      "13.5px",
      fontWeight:    700,
      fontFamily:    "'Nunito', sans-serif",
      boxShadow:     "0 8px 20px rgba(0,0,0,0.15)",
      display:       "flex",
      alignItems:    "center",
      gap:           "10px",
    }}>
      {esError ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
          stroke="#dc2626" strokeWidth="3">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9"  x2="9"  y2="15"/>
          <line x1="9"  y1="9"  x2="15" y2="15"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
          stroke="#22c55e" strokeWidth="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      <span style={{ flex: 1 }}>{mensaje}</span>
    </div>
  );
};

export default Toast;


// ── Contenedor posicionado para arrays de toasts ─────────────
// Úsalo en páginas con múltiples toasts simultáneos (Home, Perfil)
//
// Ejemplo:
//   <ToastContainer toasts={toasts} />
//
export const ToastContainer = ({ toasts = [] }) => (
  <div style={{
    position:      "fixed",
    bottom:        "84px",
    left:          "50%",
    transform:     "translateX(-50%)",
    zIndex:        1000,
    display:       "flex",
    flexDirection: "column",
    gap:           "8px",
    width:         "calc(100% - 40px)",
    maxWidth:      "390px",
    pointerEvents: "none",
  }}>
    {toasts.map((t) => (
      <Toast key={t.id} mensaje={t.mensaje} tipo={t.tipo} />
    ))}
  </div>
);


// ── Hook helper para manejar el estado de toasts ─────────────
// Exportado aquí para no crear un archivo extra innecesario.
//
// Modo array  (Home, Perfil):
//   const mostrarToast = useToast(setToasts);
//
// Modo single (Publicar, EditarProducto):
//   const mostrarToast = useToast(setToast, { single: true });
//
import { useCallback } from "react";

export const useToast = (setState, { single = false, duracion = 3000 } = {}) =>
  useCallback((mensaje, tipo = "success") => {
    if (single) {
      setState({ mensaje, tipo });
      setTimeout(() => setState(null), duracion);
    } else {
      const id = Date.now();
      setState((prev) => [...prev, { id, mensaje, tipo }]);
      setTimeout(() => setState((prev) => prev.filter((t) => t.id !== id)), duracion);
    }
  }, [setState, single, duracion]);