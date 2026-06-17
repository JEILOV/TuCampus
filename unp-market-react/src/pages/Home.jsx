// src/pages/Home.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams }             from "react-router-dom";
import {
  collection, getDocs, query,
  orderBy, limit, startAfter,
  where, onSnapshot, writeBatch, doc
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth }           from "../services/firebase";

// ──────────────────────────────────────────────────────────────
//  CONSTANTES Y UTILIDADES
// ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

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

// ── Mapeo orden → campo y dirección para Firestore ──
const ORDEN_CONFIG = {
  recientes:     { campo: "fecha",  dir: "desc" },
  precio_asc:    { campo: "precio", dir: "asc"  },
  precio_desc:   { campo: "precio", dir: "desc" },
};

const formatearTiempo = (timestamp) => {
  if (!timestamp) return "Hace un momento";
  const segundos = Math.floor((new Date() - timestamp.toDate()) / 1000);
  if (segundos < 60) return `Hace ${segundos} seg`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `Hace ${dias} d`;
};

// ──────────────────────────────────────────────────────────────
//  SUB-COMPONENTE: Tarjeta de Producto
// ──────────────────────────────────────────────────────────────
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

        {estaAgotado && (
          <div className="card-sold-out-overlay">
            AGOTADO
          </div>
        )}
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
            <span className="seller-name">
              {vendedorNombre}
            </span>
          </div>
        )}
      </div>
    </article>
  );
};

// ──────────────────────────────────────────────────────────────
//  SUB-COMPONENTE: Toast
// ──────────────────────────────────────────────────────────────
const Toast = ({ mensaje, tipo }) => (
  <div className={`toast toast--${tipo}`}>
    {tipo === "success"
      ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
      : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    }
    <span className="toast-text">{mensaje}</span>
  </div>
);

// ──────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL: Home
// ──────────────────────────────────────────────────────────────
const Home = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [currentUser,    setCurrentUser]    = useState(null);
  const [notificaciones, setNotificaciones] = useState([]);

  const [productos,       setProductos]       = useState([]);
  const [cargando,        setCargando]        = useState(false);
  const [todoCargado,     setTodoCargado]     = useState(false);
  const [busqueda,        setBusqueda]        = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("todos");
  const [toasts,          setToasts]          = useState([]);

  // ── NUEVO: estado de ordenamiento ──
  const [orden, setOrden] = useState("recientes");
  const [menuOrdenAbierto, setMenuOrdenAbierto] = useState(false);

  const tabUrl = searchParams.get("tab") || "inicio";
  const [tabActiva, setTabActiva] = useState(tabUrl);

  const [favoritos, setFavoritos] = useState(() => {
    try {
      const guardados = localStorage.getItem("listaFavoritos");
      return new Set(guardados ? JSON.parse(guardados) : []);
    } catch {
      return new Set();
    }
  });

  const sentinelRef  = useRef(null);
  const ultimoDocRef = useRef(null);
  const observerRef  = useRef(null);

  useEffect(() => {
    setTabActiva(tabUrl);
  }, [tabUrl]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/login", { replace: true });
      else setCurrentUser(user);
    });
    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "notificaciones"),
      where("paraUid", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotificaciones(notifs);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const handleMarcarLeidas = async () => {
    if (notificaciones.every(n => n.leido)) return;
    try {
      const batch = writeBatch(db);
      notificaciones.forEach(n => {
        if (!n.leido) {
          const ref = doc(db, "notificaciones", n.id);
          batch.update(ref, { leido: true });
        }
      });
      await batch.commit();
      mostrarToast("Todas las notificaciones leídas");
    } catch (error) {
      console.error("Error al marcar leídas:", error);
      mostrarToast("Error al procesar", "error");
    }
  };

  const mostrarToast = useCallback((mensaje, tipo = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // ──────────────────────────────────────────────────────────────
  //  CARGA DE PRODUCTOS — combina categoría (where) + orden (orderBy)
  //
  //  Nota sobre índices compuestos:
  //  Cuando categoriaActiva !== "todos", Firestore combina un where()
  //  con un orderBy() en un campo distinto, lo que requiere un índice
  //  compuesto. Si la consola arroja un error con un enlace de Firebase,
  //  haz clic en él para crearlo en un paso.
  //  Las combinaciones necesarias son:
  //    - categoria (asc) + fecha (desc)
  //    - categoria (asc) + precio (asc)
  //    - categoria (asc) + precio (desc)
  // ──────────────────────────────────────────────────────────────
  const cargarMasProductos = useCallback(async () => {
    if (cargando || todoCargado) return;
    setCargando(true);

    try {
      const { campo, dir } = ORDEN_CONFIG[orden];
      const col            = collection(db, "productos");

      // Construir constraints dinámicamente para poder combinar
      // where + orderBy sin repetir la query base dos veces.
      const constraints = [];

      if (categoriaActiva !== "todos") {
        constraints.push(where("categoria", "==", categoriaActiva));
      }

      constraints.push(orderBy(campo, dir));
      constraints.push(limit(PAGE_SIZE));

      if (ultimoDocRef.current) {
        constraints.push(startAfter(ultimoDocRef.current));
      }

      const snapshot = await getDocs(query(col, ...constraints));

      if (snapshot.size < PAGE_SIZE) setTodoCargado(true);

      const nuevos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      setProductos((prev) => {
        const idsExistentes = new Set(prev.map((p) => p.id));
        const sinDuplicados = nuevos.filter((p) => !idsExistentes.has(p.id));
        return [...prev, ...sinDuplicados];
      });

      if (!snapshot.empty) {
        ultimoDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
    } catch (err) {
      console.error("Error cargando productos:", err);
      mostrarToast("Error al cargar productos", "error");
    } finally {
      setCargando(false);
    }
  }, [cargando, todoCargado, mostrarToast, orden, categoriaActiva]);

  // ── Reiniciar y recargar cuando cambia el orden O la categoría ──
  useEffect(() => {
    setProductos([]);
    setTodoCargado(false);
    ultimoDocRef.current = null;
  }, [orden, categoriaActiva]);

  // ── Dispara la primera carga después del reset ──
  useEffect(() => {
    if (!todoCargado && productos.length === 0 && !cargando) {
      cargarMasProductos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, todoCargado]);

  // ── Infinite scroll ──
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    if (todoCargado || !sentinelRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) cargarMasProductos(); },
      { root: null, rootMargin: "200px", threshold: 0.1 }
    );

    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [cargarMasProductos, todoCargado]);

  // ── Filtro de búsqueda (client-side, sobre la página ya cargada) ──
  const productosFiltrados = productos.filter((p) =>
    busqueda.trim() === "" ||
    (p.titulo || "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const handleVerDetalle = (id) => navigate(`/producto?id=${id}`);

  // ──────────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="header" style={{ justifyContent: "center", paddingBottom: "0" }}>
        <div className="logo" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <img
            src="https://i.ibb.co/fzNKyX51/Dise-o-sin-t-tulo-1.png"
            alt="Mercado UNP"
            style={{ height: "56px", width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
          />
        </div>
      </header>

      {tabActiva === "inicio" && (
        <>
          <div className="search-wrapper">
            <div className="search-bar">
              <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

            {/* DROPDOWN CUSTOMIZADO DE ORDENAMIENTO */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOrdenAbierto(!menuOrdenAbierto)}
                style={{
                  background: "rgba(46, 107, 78, 0.08)",
                  color: "var(--verde-marca)",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "14px",
                  fontSize: "0.85rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontFamily: "'Nunito', sans-serif",
                  transition: "background 0.2s"
                }}
              >
                {orden === "recientes" ? "Más recientes" : orden === "precio_asc" ? "Menor precio" : "Mayor precio"}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: menuOrdenAbierto ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {menuOrdenAbierto && (
                <>
                  {/* Capa invisible para cerrar el menú al hacer clic afuera */}
                  <div onClick={() => setMenuOrdenAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
                  
                  {/* Caja flotante de opciones */}
                  <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: "8px",
                    background: "white", borderRadius: "14px",
                    boxShadow: "0 8px 24px rgba(15,37,64,0.12)",
                    border: "1px solid rgba(15,37,64,0.06)",
                    overflow: "hidden", zIndex: 100, minWidth: "145px",
                    display: "flex", flexDirection: "column"
                  }}>
                    {[
                      { id: "recientes", label: "Más recientes" },
                      { id: "precio_asc", label: "Menor precio" },
                      { id: "precio_desc", label: "Mayor precio" }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => { setOrden(opt.id); setMenuOrdenAbierto(false); }}
                        style={{
                          background: orden === opt.id ? "rgba(46, 107, 78, 0.05)" : "transparent",
                          color: orden === opt.id ? "var(--verde-marca)" : "var(--text-mid)",
                          border: "none", padding: "12px 16px", textAlign: "left",
                          fontSize: "0.85rem", fontWeight: 800, cursor: "pointer",
                          fontFamily: "'Nunito', sans-serif", transition: "background 0.2s"
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
            {notificaciones.some((n) => !n.leido) && (
              <button onClick={handleMarcarLeidas} className="btn-mark-read">
                Marcar todas leídas
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
                const esFav = notif.tipo === "favorito";
                return (
                  <div
                    key={notif.id}
                    className={`notif-item notif-item--${esFav ? "fav" : "msg"}${notif.leido ? " notif-item--leido" : ""}`}
                  >
                    <div className="notif-item-icon">{esFav ? "❤️" : "💬"}</div>
                    <div className="notif-item-body">
                      <p className="notif-item-text">
                        <span className="notif-item-name">{notif.deNombre}</span>{" "}
                        {esFav ? "guardó" : "quiere comprar"}{" "}
                        <span className="notif-item-name">"{notif.productoTitulo}"</span>
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
          <div className="nav-icon-wrap">
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {notificaciones.some(n => !n.leido) && (
              <span className="nav-notif-badge">{notificaciones.filter(n => !n.leido).length}</span>
            )}
          </div>
          <span className="nav-label">Notifs</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/perfil")} aria-label="Perfil">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span className="nav-label">Perfil</span>
        </button>
      </nav>

      <div className="toast-container">
        {toasts.map((t) => <Toast key={t.id} mensaje={t.mensaje} tipo={t.tipo} />)}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Home;