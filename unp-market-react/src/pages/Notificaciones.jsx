// src/pages/Notificaciones.jsx
// ============================================================
//  TuCampus — Notificaciones (página independiente)
//
//  ANTES: vivía como un tab dentro de Home.jsx (?tab=notifs),
//  accesible solo desde el ícono de campana en BottomNav.
//
//  AHORA: página propia en /notificaciones, con su propio header
//  (back button + "Limpiar"), a la que se llega desde el botón
//  flotante <BotonNotificaciones /> montado en las vistas principales.
//  El markup/CSS del listado (notif-list, notif-item, etc.) es el
//  mismo que ya existía — solo se movió de archivo.
// ============================================================

import { useState }                 from "react";
import { useNavigate }              from "react-router-dom";
import { useAuth }                  from "../context/AuthContext";
import { useNotifications }         from "../hooks/useNotifications";
import { useToast, ToastContainer } from "../components/Toast";
import BottomNav                    from "../components/BottomNav";

const formatearTiempo = (timestamp) => {
  if (!timestamp) return "Hace un momento";
  const segundos = Math.floor((new Date() - timestamp.toDate()) / 1000);
  if (segundos < 60) return `Hace ${segundos} seg`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  return `Hace ${Math.floor(horas / 24)} d`;
};

const IconoVolver = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const Notificaciones = () => {
  const navigate = useNavigate();
  const { user }  = useAuth();

  const [toasts, setToasts] = useState([]);
  const mostrarToast        = useToast(setToasts);

  const { notificaciones, marcarLeida, limpiarTodas } = useNotifications(user?.uid);

  const handleLimpiarNotificaciones = async () => {
    try {
      await limpiarTodas();
      mostrarToast("Notificaciones eliminadas");
    } catch {
      mostrarToast("Error al procesar", "error");
    }
  };

  const handleNotifClick = async (notif) => {
    try {
      if (!notif.leido) await marcarLeida(notif.id);
    } finally {
      if (notif.tipo === "nuevo_producto" && notif.productoId) {
        navigate(`/producto?id=${notif.productoId}`);
      } else {
        navigate(`/vendedor?uid=${notif.deUid}`);
      }
    }
  };

  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", paddingBottom: "90px" }}>

      {/* ── HEADER (mismo patrón que Chat.jsx: back button + título + acción) ── */}
      <div style={{
        flexShrink: 0, background: "white", borderBottom: "1px solid #f1f3f5",
        display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px",
      }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{
            width: "36px", height: "36px", flexShrink: 0,
            background: "var(--bg-crema)", borderRadius: "50%",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--azul-oscuro)",
          }}
        >
          <IconoVolver />
        </button>

        <h1 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--azul-oscuro)", flex: 1 }}>
          Notificaciones
        </h1>

        {notificaciones.length > 0 && (
          <button onClick={handleLimpiarNotificaciones} className="btn-mark-read">
            Limpiar
          </button>
        )}
      </div>

      {/* ── CONTENIDO ── */}
      <section className="tab-section">
        {notificaciones.length === 0 ? (
          <div className="notif-empty">
            <span className="notif-empty-icon">🔔</span>
            <p className="notif-empty-title">Todo al día</p>
            <p className="notif-empty-subtitle">Aquí verás cuando alguien interactúe con tus productos.</p>
          </div>
        ) : (
          <div className="notif-list">
            {notificaciones.map((notif) => {
              const esFav       = notif.tipo === "favorito";
              const esSeguidor  = notif.tipo === "seguidor";
              const esNuevoProd = notif.tipo === "nuevo_producto";
              let icono = "💬";
              if (esFav)       icono = "❤️";
              if (esSeguidor)  icono = "👤";
              if (esNuevoProd) icono = "📢";
              let textoAccion    = "quiere comprar";
              let mostrarProducto = true;
              if (esFav)           { textoAccion = "guardó"; }
              else if (esSeguidor) { textoAccion = "empezó a seguirte"; mostrarProducto = false; }
              else if (esNuevoProd){ textoAccion = "publicó un nuevo producto:"; }

              return (
                <div
                  key={notif.id}
                  className={`notif-item notif-item--${esFav ? "fav" : "msg"}${notif.leido ? " notif-item--leido" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => handleNotifClick(notif)}
                >
                  <div className="notif-item-icon">{icono}</div>
                  <div className="notif-item-body">
                    <p className="notif-item-text">
                      <span className="notif-item-name">{notif.deNombre}</span>{" "}
                      {textoAccion}{" "}
                      {mostrarProducto && <span className="notif-item-name">"{notif.productoTitulo}"</span>}
                    </p>
                    <span className="notif-item-time">{formatearTiempo(notif.timestamp)}</span>
                  </div>
                  {!notif.leido && <span className="notif-badge-nueva">NUEVA</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* BOTTOM NAVIGATION (sin tab activo: Notificaciones ya no es un tab) */}
      <BottomNav />

      <ToastContainer toasts={toasts} />
    </div>
  );
};

export default Notificaciones;