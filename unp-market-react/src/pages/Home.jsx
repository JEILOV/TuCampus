// src/pages/Home.jsx
import { useState, useEffect, useRef }              from "react";
import { useNavigate, useSearchParams }             from "react-router-dom";
import { useAuth }                                  from "../context/AuthContext";
import { useProducts }                              from "../hooks/useProducts";
import { useNotifications }                         from "../hooks/useNotifications";
import { useToast, ToastContainer }                 from "../components/Toast"; // ✅ Nuevos imports

// ── Constantes ───────────────────────────────────────────────
const CATEGORIAS = [
  { key: "todos",      label: "Todos",      icon: "🌟", bg: "#f1f3f5" },
  { key: "dulces",     label: "Dulces",     icon: "🍰", bg: "#ffeaea" },
  { key: "salados",    label: "Salados",    icon: "🍔", bg: "#e8f4ff" },
  { key: "bebidas",    label: "Bebidas",    icon: "🥤", bg: "#e6faf0" },
  { key: "servicios",  label: "Servicios",  icon: "🔧", bg: "#fff6e0" },
  { key: "materiales", label: "Materiales", icon: "📚", bg: "#f0eaff" },
];

const ICONOS_CAT = {
  dulces: "🍫", bebidas: "☕", salados: "🍔",
  servicios: "🔧", materiales: "📚",
};

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

// ── Sub-componentes ──────────────────────────────────────────
const ProductCard = ({ producto, onVerDetalle }) => {
  const { id, titulo, precio, imagen, categoria, vendedorNombre, avatarVendedor, estado } = producto;
  const estaAgotado = estado === "agotado";
  const emoji       = ICONOS_CAT[(categoria || "").toLowerCase()] || "📦";

  return (
    <article
      className={`product-card${estaAgotado ? " product-card--agotado" : ""}`}
      onClick={() => onVerDetalle(id)}
    >
      <div className="card-image-wrap">
        {imagen && imagen.trim() ? (
          <img
            src={imagen}
            alt={titulo || "Producto"}
            className={`card-photo${estaAgotado ? " card-photo--agotado" : ""}`}
          />
        ) : (
          <span className={`card-emoji-placeholder${estaAgotado ? " card-emoji-placeholder--agotado" : ""}`}>
            {emoji}
          </span>
        )}
        <span className={`card-price-badge${estaAgotado ? " card-price-badge--agotado" : ""}`}>
          S/ {(precio || 0).toFixed(2)}
        </span>
        {estaAgotado && <div className="card-sold-out-overlay">AGOTADO</div>}
      </div>
      <div className="card-body">
        <h3 className={`card-title${estaAgotado ? " card-title--agotado" : ""}`}>
          {titulo || "Sin título"}
        </h3>
        {vendedorNombre && (
          <div className="card-seller">
            <div className="seller-avatar seller-avatar--gradient">
              {avatarVendedor?.trim() ? (
                <img src={avatarVendedor} alt={vendedorNombre} className="seller-avatar-img" />
              ) : (
                (vendedorNombre || "?")[0].toUpperCase()
              )}
            </div>
            <span className="seller-name">{vendedorNombre}</span>
          </div>
        )}
      </div>
    </article>
  );
};

// ── Componente principal ─────────────────────────────────────
const Home = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, favoritos } = useAuth();

  // ── Estado de UI ─────────────────────────────────────────
  const [busqueda,         setBusqueda]         = useState("");
  const [busquedaFirebase, setBusquedaFirebase] = useState("");
  const [categoriaActiva,  setCategoriaActiva]  = useState("todos");
  const [toasts,           setToasts]           = useState([]);
  const [orden,            setOrden]            = useState("recientes");
  const [menuOrdenAbierto, setMenuOrdenAbierto] = useState(false);

  const tabUrl = searchParams.get("tab") || "inicio";
  const [tabActiva, setTabActiva] = useState(tabUrl);
  useEffect(() => { setTabActiva(tabUrl); }, [tabUrl]);

  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // ✅ Toast helper unificado (modo array)
  const mostrarToast = useToast(setToasts);

  // ── Debounce búsqueda ────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaFirebase(busqueda), 500);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // ── Hook: Productos ──────────────────────────────────────
  const { productos, cargando, todoCargado, cargarMas } = useProducts({
    orden,
    categoriaActiva,
    busquedaFirebase,
    onError: (msg) => mostrarToast(msg, "error"),
  });

  // ── Hook: Notificaciones ─────────────────────────────────
  const { notificaciones, noLeidas, marcarLeida, limpiarTodas } = useNotifications(user?.uid);

  // ── Infinite scroll ──────────────────────────────────────
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    if (todoCargado || !sentinelRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) cargarMas(); },
      { root: null, rootMargin: "200px", threshold: 0.1 }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [cargarMas, todoCargado]);

  // ── Handlers ─────────────────────────────────────────────
  const productosFiltrados = productos.filter((p) =>
    busqueda.trim() === "" ||
    (p.titulo || "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const handleVerDetalle = (id) => navigate(`/producto?id=${id}`);

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

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="app-shell">
      <header className="header" style={{ justifyContent: "center", paddingBottom: "0" }}>
        <div className="logo" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <img
            src="https://i.ibb.co/XrLDwCBF/Chat-GPT-Image-17-jun-2026-03-37-28-p-m.png"
            alt="Mercado UNP"
            style={{ height: "56px", width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
          />
        </div>
      </header>

      {tabActiva === "inicio" && (
        <>
          <div className="search-wrapper">
            <div className="search-bar">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar postres, libros, tipeos..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <nav className="categories-scroll" aria-label="Categorías">
            {CATEGORIAS.map(({ key, label, icon, bg }) => (
              <button
                key={key}
                className={`category-chip${categoriaActiva === key ? " active" : ""}`}
                onClick={() => setCategoriaActiva(key)}
              >
                <span className="chip-icon" style={{ background: bg }}>{icon}</span>
                <span className="chip-label">{label}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      {tabActiva === "inicio" && (
        <section className="catalog">
          <div className="catalog-header">
            <h2 className="catalog-title">Destacados</h2>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOrdenAbierto(!menuOrdenAbierto)}
                style={{
                  background: "rgba(46, 107, 78, 0.08)", color: "var(--verde-marca)",
                  border: "none", padding: "6px 14px", borderRadius: "14px",
                  fontSize: "0.85rem", fontWeight: 800, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "6px",
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                {orden === "recientes" ? "Más recientes" : orden === "precio_asc" ? "Menor precio" : "Mayor precio"}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: menuOrdenAbierto ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {menuOrdenAbierto && (
                <>
                  <div onClick={() => setMenuOrdenAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: "8px",
                    background: "white", borderRadius: "14px",
                    boxShadow: "0 8px 24px rgba(15,37,64,0.12)",
                    overflow: "hidden", zIndex: 100, minWidth: "145px", display: "flex", flexDirection: "column",
                  }}>
                    {[
                      { id: "recientes",   label: "Más recientes" },
                      { id: "precio_asc",  label: "Menor precio"  },
                      { id: "precio_desc", label: "Mayor precio"  },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => { setOrden(opt.id); setMenuOrdenAbierto(false); }}
                        style={{
                          background: orden === opt.id ? "rgba(46, 107, 78, 0.05)" : "transparent",
                          color: orden === opt.id ? "var(--verde-marca)" : "var(--text-mid)",
                          border: "none", padding: "12px 16px", textAlign: "left",
                          fontSize: "0.85rem", fontWeight: 800, cursor: "pointer",
                          fontFamily: "'Nunito', sans-serif",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="product-grid">
            {productosFiltrados.map((p) => (
              <ProductCard key={p.id} producto={p} onVerDetalle={handleVerDetalle} />
            ))}
          </div>

          {!todoCargado && <div ref={sentinelRef} className="sentinel" />}

          {cargando && (
            <div className="loading-more">
              <div className="loading-pill">
                <svg className="loading-spinner" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#E58A3B" strokeWidth="2.5">
                  <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                  <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
                  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                </svg>
                Cargando más productos...
              </div>
            </div>
          )}
        </section>
      )}

      {tabActiva === "favoritos" && (
        <section className="tab-section">
          <h2 className="tab-section-title">Mis Favoritos</h2>
          <div className="product-grid">
            {favoritos.size === 0 ? (
              <p className="empty-state-text">Aún no tienes favoritos guardados.</p>
            ) : (
              productos.filter((p) => favoritos.has(p.id)).map((p) => (
                <ProductCard key={p.id} producto={p} onVerDetalle={handleVerDetalle} />
              ))
            )}
          </div>
        </section>
      )}

      {tabActiva === "notifs" && (
        <section className="tab-section">
          <div className="tab-section-header">
            <h2 className="tab-section-title" style={{ margin: 0 }}>Notificaciones</h2>
            {notificaciones.length > 0 && (
              <button onClick={handleLimpiarNotificaciones} className="btn-mark-read">
                Limpiar notificaciones
              </button>
            )}
          </div>
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
      )}

      {/* BOTTOM NAVIGATION */}
      <nav className="bottom-nav">
        <button className={`nav-item${tabActiva === "inicio" ? " active" : ""}`} onClick={() => navigate("/")} aria-label="Inicio">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span className="nav-label">Inicio</span>
        </button>
        <button className={`nav-item${tabActiva === "favoritos" ? " active" : ""}`} onClick={() => navigate("/?tab=favoritos")} aria-label="Favoritos">
          <svg className="nav-icon" viewBox="0 0 24 24" fill={tabActiva === "favoritos" ? "currentColor" : "none"} strokeWidth="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span className="nav-label">Favoritos</span>
        </button>
        <button className="nav-item nav-add" onClick={() => navigate("/publicar")} aria-label="Publicar">
          <div className="nav-add-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
          <span className="nav-label">Publicar</span>
        </button>
        <button className={`nav-item${tabActiva === "notifs" ? " active" : ""}`} onClick={() => navigate("/?tab=notifs")} aria-label="Notificaciones">
          <div className="nav-icon-wrap" style={{ position: "relative", display: "inline-flex" }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {noLeidas > 0 && (
              <span className="nav-notif-badge" style={{
                position: "absolute", top: "-4px", right: "-6px",
                background: "#ef4444", color: "white", fontSize: "0.65rem",
                fontWeight: 800, minWidth: "16px", height: "16px",
                borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", border: "2px solid #16a34a",
                padding: "0 4px", lineHeight: 1,
              }}>
                {noLeidas}
              </span>
            )}
          </div>
          <span className="nav-label">Notifs</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/perfil")} aria-label="Perfil">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span className="nav-label">Perfil</span>
        </button>
      </nav>

      {/* ✅ TOAST CONTAINER LIMPIO */}
      <ToastContainer toasts={toasts} />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Home;