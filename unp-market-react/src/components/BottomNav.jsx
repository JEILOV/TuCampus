// src/components/BottomNav.jsx
// ============================================================
//  TuCampus — Barra de navegación inferior (compartida)
//
//  REEMPLAZA 5 copias casi idénticas del mismo <nav className="bottom-nav">
//  encontradas en Home.jsx, Vendedor.jsx, Publicar.jsx, Perfil.jsx y
//  EditarProducto.jsx. Perfil.jsx además tenía su propio onSnapshot de
//  "notificaciones" corriendo EN PARALELO al de useNotifications, solo
//  para pintar el badge acá — ese listener duplicado se elimina al
//  centralizar el nav en un solo componente.
//
//  USO:
//    <BottomNav activo="inicio" />    // resalta "Inicio"
//    <BottomNav activo="perfil" />    // resalta "Perfil"
//    <BottomNav />                    // ninguna pestaña resaltada
//
//  En Home.jsx, "activo" es dinámico (depende de ?tab=), en el resto
//  de las páginas es un string fijo.
// ============================================================

import { useNavigate }      from "react-router-dom";
import { useAuth }          from "../context/AuthContext";
import { useNotifications } from "../hooks/useNotifications";
import { useChatsNoLeidos } from "../hooks/useChatsNoLeidos";

// ── Badge numérico reutilizable (notifs y mensajes usan el mismo estilo) ──
const Badge = ({ cantidad }) => {
  if (!cantidad) return null;
  return (
    <span style={{
      position: "absolute", top: "-4px", right: "-6px",
      background: "#ef4444", color: "white",
      fontSize: "0.65rem", fontWeight: 800,
      minWidth: "16px", height: "16px", borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "2px solid #1e293b", padding: "0 4px", lineHeight: 1,
    }}>
      {cantidad > 9 ? "9+" : cantidad}
    </span>
  );
};

const BottomNav = ({ activo = null }) => {
  const navigate = useNavigate();
  const { user }  = useAuth();

  // Mismos hooks que ya usa el resto de la app — cero listeners nuevos
  // más allá de los que ya existían, solo centralizados acá.
  const { noLeidas }    = useNotifications(user?.uid);
  const mensajesNoLeidos = useChatsNoLeidos(user?.uid);

  const claseItem = (id) => (activo === id ? "nav-item active" : "nav-item");

  return (
    <nav className="bottom-nav">
      <button className={claseItem("inicio")} onClick={() => navigate("/")} aria-label="Inicio">
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span className="nav-label">Inicio</span>
      </button>

      <button className={claseItem("favoritos")} onClick={() => navigate("/?tab=favoritos")} aria-label="Favoritos">
        <svg className="nav-icon" viewBox="0 0 24 24" fill={activo === "favoritos" ? "currentColor" : "none"} strokeWidth="2.2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span className="nav-label">Favoritos</span>
      </button>

      <button className="nav-item nav-add" onClick={() => navigate("/publicar")} aria-label="Publicar">
        <div className="nav-add-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <span className="nav-label">Publicar</span>
      </button>

      <button className={claseItem("mensajes")} onClick={() => navigate("/chat")} aria-label="Mensajes">
        <div className="nav-icon-wrap">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          <Badge cantidad={mensajesNoLeidos} />
        </div>
        <span className="nav-label">Mensajes</span>
      </button>

      <button className={claseItem("notifs")} onClick={() => navigate("/?tab=notifs")} aria-label="Notificaciones">
        <div className="nav-icon-wrap">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <Badge cantidad={noLeidas} />
        </div>
        <span className="nav-label">Notifs</span>
      </button>

      <button className={claseItem("perfil")} onClick={() => navigate("/perfil")} aria-label="Perfil">
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span className="nav-label">Perfil</span>
      </button>
    </nav>
  );
};

export default BottomNav;