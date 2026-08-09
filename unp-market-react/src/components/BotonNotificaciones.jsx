// src/components/BotonNotificaciones.jsx
// ============================================================
//  TuCampus — Botón flotante de Notificaciones
//
//  REEMPLAZA el tab "Notifs" que vivía dentro de BottomNav.jsx.
//  Se monta una sola vez por página (junto a <BottomNav />, en las
//  mismas 5 vistas principales: Home, Perfil, Publicar, Vendedor,
//  EditarProducto) y flota fijo en la esquina superior derecha,
//  visible sin importar el scroll.
//
//  Autocontenido: abre su propio listener de useNotifications, así
//  que no requiere props ni que la página padre calcule el conteo.
//  Si no hay sesión iniciada, no se renderiza (no hay notifs que ver).
//
//  USO:
//    <BotonNotificaciones />
// ============================================================

import { useNavigate } from "react-router-dom";
import { useAuth }     from "../context/AuthContext";
import { useNotifications } from "../hooks/useNotifications";

const IconoCampana = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const BotonNotificaciones = () => {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const { noLeidas: sinLeerCount } = useNotifications(user?.uid);

  // Sin sesión → sin notificaciones que mostrar
  if (!user) return null;

  return (
    <button
      className="notif-float-btn"
      onClick={() => navigate("/notificaciones")}
      aria-label={sinLeerCount > 0 ? `Notificaciones, ${sinLeerCount} sin leer` : "Notificaciones"}
    >
      <IconoCampana />
      {sinLeerCount > 0 && (
        <span className="notif-float-badge">
          {sinLeerCount > 9 ? "9+" : sinLeerCount}
        </span>
      )}
    </button>
  );
};

export default BotonNotificaciones;