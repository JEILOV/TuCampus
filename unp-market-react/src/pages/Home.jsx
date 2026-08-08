// src/pages/Home.jsx
import { useState, useEffect, useRef }              from "react";
import { useNavigate, useSearchParams }             from "react-router-dom";
import { useAuth }                                  from "../context/AuthContext";
import { useProducts }                              from "../hooks/useProducts";
import { useNotifications }                         from "../hooks/useNotifications";
import { useToast, ToastContainer }                 from "../components/Toast"; // ✅ Nuevos imports
import BottomNav                                    from "../components/BottomNav";
import { CATEGORY_ICON_MAP, IconPackage }           from "../components/CategoryIcons";

// ── Constantes ───────────────────────────────────────────────
const CATEGORIAS = [
 { key: "todos",      label: "Todos",      bg: "#f1f3f5", accent: "#5c5c7a" },
  { key: "dulces",     label: "Dulces",     bg: "#ffeaea", accent: "#e0607a" },
  { key: "salados",    label: "Salados",    bg: "#e8f4ff", accent: "#2f7bc9" },
  { key: "bebidas",    label: "Bebidas",    bg: "#e6faf0", accent: "#2e9e6f" },
  { key: "servicios",  label: "Servicios",  bg: "#fff6e0", accent: "#c98a1f" },
  { key: "materiales", label: "Materiales", bg: "#f0eaff", accent: "#7b5bc9" },
];

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
  const catKey       = (categoria || "").toLowerCase();
  const IconPlaceholder = CATEGORY_ICON_MAP[catKey] || IconPackage;

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
            <IconPlaceholder color="#a07850" />
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
  const { notificaciones, marcarLeida, limpiarTodas } = useNotifications(user?.uid);

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
            {CATEGORIAS.map(({ key, label, bg, accent }) => {
              const Icon = CATEGORY_ICON_MAP[key];
              return (
                <button
                  key={key}
                  className={`category-chip${categoriaActiva === key ? " active" : ""}`}
                  onClick={() => setCategoriaActiva(key)}
                >
                  <span className="chip-icon" style={{ background: bg }}>
                    <Icon color={accent} />
                  </span>
                  <span className="chip-label">{label}</span>
                </button>
              );
            })}
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
      <BottomNav activo={tabActiva} />

      {/* ✅ TOAST CONTAINER LIMPIO */}
      <ToastContainer toasts={toasts} />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Home;