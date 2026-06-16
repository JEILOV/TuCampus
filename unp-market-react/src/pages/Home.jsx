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
//  SUB-COMPONENTE: Tarjeta de Producto (Limpia y con Foto)
// ──────────────────────────────────────────────────────────────
const ProductCard = ({ producto, onVerDetalle }) => {
  const { id, titulo, precio, imagen, categoria, vendedorNombre, avatarVendedor, estado } = producto;
  const estaAgotado = estado === "agotado";
  const emoji       = ICONOS_CAT[(categoria || "").toLowerCase()] || "📦";

  return (
    <article
      className="product-card"
      style={{ cursor: "pointer", position: "relative", display: "flex", flexDirection: "column" }}
      onClick={() => onVerDetalle(id)}
    >
    <div
        className="card-image-wrap"
        style={{
          position: "relative",
          background: "linear-gradient(135deg,#c8a97a 0%,#a07850 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "18px 18px 0 0", overflow: "hidden"
        }}
      
      >
        {imagen && imagen.trim() ? (
          <img
            src={imagen}
            alt={titulo || "Producto"}
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              filter: estaAgotado ? "grayscale(100%) opacity(0.6)" : "none",
            }}
          />
        ) : (
          <span style={{ fontSize: "3rem", filter: estaAgotado ? "grayscale(100%) opacity(0.6)" : "none" }}>
            {emoji}
          </span>
        )}

        <span style={{
          position: "absolute", bottom: "10px", right: "10px",
          background: estaAgotado ? "#555" : "rgba(0,0,0,0.7)", color: "white",
         fontWeight: 700 , fontSize: "0.85rem", padding: "4px 10px",
          borderRadius: "12px", backdropFilter: "blur(4px)"
        }}>
          S/ {(precio || 0).toFixed(2)}
        </span>

        {estaAgotado && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%) rotate(-10deg)",
            background: "#ff4d6d", color: "white", fontWeight: 700,
            fontSize: "1rem", padding: "4px 10px", borderRadius: "6px",
            border: "2px solid white", zIndex: 10,
          }}>
            AGOTADO
          </div>
        )}
      </div>

      <div className="card-body" style={{ padding: "12px", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: estaAgotado ? "#999" : "var(--azul-oscuro)", textDecoration: estaAgotado ? "line-through" : "none" }}>
          {titulo || "Sin título"}
        </h3>

        {vendedorNombre && (
          <div className="card-seller" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "22px", height: "22px", borderRadius: "50%",
              background: "linear-gradient(135deg,#c8a97a,#a07850)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", color: "white", fontWeight: 600, flexShrink: 0,
              overflow: "hidden"
            }}>
              {avatarVendedor?.trim() ? (
                <img src={avatarVendedor} alt={vendedorNombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                (vendedorNombre || "?")[0].toUpperCase()
              )}
            </div>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#5c5c7a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
  <div style={{
    background: tipo === "success" ? "#1e293b" : "#fecaca",
    color: tipo === "success" ? "#ffffff" : "#991b1b",
    padding: "14px 18px", borderRadius: "16px", fontSize: "13.5px",
    fontFamily: "'Nunito', sans-serif", fontWeight: 700,
    boxShadow: "0 8px 20px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: "10px",
  }}>
    {tipo === "success"
      ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
      : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    }
    <span style={{ flex: 1 }}>{mensaje}</span>
  </div>
);

// ──────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL: Home
// ──────────────────────────────────────────────────────────────
const Home = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Estados reales (ADÍOS DATOS FALSOS)
  const [currentUser, setCurrentUser] = useState(null);
  const [notificaciones, setNotificaciones] = useState([]);
  
  const [productos,       setProductos]       = useState([]);
  const [cargando,        setCargando]        = useState(false);
  const [todoCargado,     setTodoCargado]     = useState(false);
  const [busqueda,        setBusqueda]        = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("todos");
  const [toasts,          setToasts]          = useState([]);

  // PARCHE 1 — Sincronización de URL
  const tabUrl = searchParams.get("tab") || "inicio";
  const [tabActiva, setTabActiva] = useState(tabUrl);

  // PARCHE 2 — Favoritos en LocalStorage
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

  // Escuchar cambios en la URL
  useEffect(() => {
    setTabActiva(tabUrl);
  }, [tabUrl]);

  // Guard de sesión (y guardar usuario)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/login", { replace: true });
      else setCurrentUser(user);
    });
    return () => unsub();
  }, [navigate]);

  // ── Leer Notificaciones Reales ──
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

  // ── Botón: Marcar todas leídas ──
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

  const cargarMasProductos = useCallback(async () => {
    if (cargando || todoCargado) return;
    setCargando(true);

    try {
      let q = query(collection(db, "productos"), orderBy("fecha", "desc"), limit(PAGE_SIZE));

      if (ultimoDocRef.current) {
        q = query(collection(db, "productos"), orderBy("fecha", "desc"), limit(PAGE_SIZE), startAfter(ultimoDocRef.current));
      }

      const snapshot = await getDocs(q);

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
  }, [cargando, todoCargado, mostrarToast]);

  useEffect(() => {
    cargarMasProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const productosFiltrados = productos.filter((p) => {
    const matchBusqueda  = busqueda.trim() === "" || (p.titulo || "").toLowerCase().includes(busqueda.toLowerCase());
    const matchCategoria = categoriaActiva === "todos" || (p.categoria || "").toLowerCase() === categoriaActiva;
    return matchBusqueda && matchCategoria;
  });

  const handleVerDetalle = (id) => navigate(`/producto?id=${id}`);

  // ──────────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <header className="header">
        <div className="logo">
          <span className="logo-unp">UNP</span><span className="logo-market">Market</span>
        </div>
      </header>

      {tabActiva === "inicio" && (
        <>
          <div className="search-wrapper">
            <div className="search-bar">
              <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" placeholder="Buscar postres, libros, tipeos..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
          <nav className="categories-scroll" aria-label="Categorías">
            {CATEGORIAS.map(({ key, label, icon, bg }) => (
              <button key={key} className={`category-chip${categoriaActiva === key ? " active" : ""}`} onClick={() => setCategoriaActiva(key)}>
                <span className="chip-icon" style={{ background: bg }}>{icon}</span><span className="chip-label">{label}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      {tabActiva === "inicio" && (
        <section className="catalog">
          <div className="catalog-header">
            <h2 className="catalog-title">Destacados</h2><span className="catalog-see-all">Ver todo</span>
          </div>
          <div className="product-grid">
            {productosFiltrados.map((p) => (
              <ProductCard key={p.id} producto={p} onVerDetalle={handleVerDetalle} />
            ))}
          </div>
          {!todoCargado && <div ref={sentinelRef} style={{ width: "100%", height: "20px", margin: "10px 0" }} />}
          {cargando && (
            <div style={{ display: "block", textAlign: "center", padding: "20px 0" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "white", padding: "12px 20px", borderRadius: "50px", boxShadow: "0 4px 15px rgba(0,0,0,0.06)", fontSize: "0.85rem", fontWeight: 600, color: "#5c5c7a" }}>
                <svg style={{ animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#c8a97a" strokeWidth="2.5"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                Cargando más productos...
              </div>
            </div>
          )}
        </section>
      )}

      {tabActiva === "favoritos" && (
        <section style={{ padding: "20px 16px 100px" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "15px" }}>Mis Favoritos</h2>
          <div className="product-grid">
            {favoritos.size === 0 ? (
              <p style={{ textAlign: "center", width: "100%", color: "#666", gridColumn: "1/-1" }}>Aún no tienes favoritos guardados.</p>
            ) : (
              productos.filter((p) => favoritos.has(p.id)).map((p) => (
                <ProductCard key={p.id} producto={p} onVerDetalle={handleVerDetalle} />
              ))
            )}
          </div>
        </section>
      )}

      {tabActiva === "notifs" && (
        <section style={{ padding: "20px 16px 100px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 600, margin: 0 }}>Notificaciones</h2>
            {notificaciones.some((n) => !n.leido) && (
              <button onClick={handleMarcarLeidas} style={{ background: "transparent", border: "1.5px solid #22c55e", color: "#22c55e", padding: "6px 12px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                Marcar todas leídas
              </button>
            )}
          </div>

          {notificaciones.length === 0 ? (
            <div style={{ background: "var(--bg-crema)", padding: "24px 16px", borderRadius: "14px", border: "1.5px solid #e8e8f0", textAlign: "center" }}>
              <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "8px" }}>🔔</span>
              <p style={{ fontWeight: 600, fontSize: "1rem", color: "var(--azul-oscuro)", margin: "0 0 6px 0" }}>Todo al día</p>
              <p style={{ fontSize: "0.85rem", color: "#5c5c7a", margin: 0 }}>Aquí verás cuando alguien interactúe con tus productos.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {notificaciones.map((notif) => {
                const esFav = notif.tipo === "favorito";
                return (
                  <div key={notif.id} style={{ background: esFav ? "#fff1f2" : "#f0fdf4", border: `1px solid ${esFav ? "#ffe4e6" : "#dcfce7"}`, padding: "16px", borderRadius: "14px", display: "flex", gap: "12px", alignItems: "flex-start", opacity: notif.leido ? 0.6 : 1 }}>
                    <div style={{ fontSize: "1.5rem" }}>{esFav ? "❤️" : "💬"}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 4px 0", fontSize: "0.9rem", color: "var(--azul-oscuro)", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600 }}>{notif.deNombre}</span> {esFav ? "guardó" : "quiere comprar"} <span style={{ fontWeight: 600 }}>"{notif.productoTitulo}"</span>
                      </p>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>{formatearTiempo(notif.timestamp)}</span>
                    </div>
                    {!notif.leido && <span style={{ background: "#22c55e", color: "white", padding: "4px 8px", borderRadius: "8px", fontSize: "0.7rem", fontWeight: 700 }}>NUEVA</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* BOTTOM NAVIGATION */}
      <nav className="bottom-nav">
        <button className={`nav-item${tabActiva === "inicio" ? " active" : ""}`} onClick={() => navigate("/")} aria-label="Inicio">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span className="nav-label">Inicio</span>
        </button>
        <button className={`nav-item${tabActiva === "favoritos" ? " active" : ""}`} onClick={() => navigate("/?tab=favoritos")} aria-label="Favoritos">
          <svg className="nav-icon" viewBox="0 0 24 24" fill={tabActiva === "favoritos" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span className="nav-label">Favoritos</span>
        </button>
        <button className="nav-item nav-add" onClick={() => navigate("/publicar")} aria-label="Publicar">
          <div className="nav-add-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
          <span className="nav-label">Publicar</span>
        </button>
        <button className={`nav-item${tabActiva === "notifs" ? " active" : ""}`} onClick={() => navigate("/?tab=notifs")} aria-label="Notificaciones">
          <div className="nav-icon-wrap">
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {notificaciones.some(n => !n.leido) && <span className="nav-notif-badge">{notificaciones.filter(n => !n.leido).length}</span>}
          </div>
          <span className="nav-label">Notifs</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/perfil")} aria-label="Perfil">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span className="nav-label">Perfil</span>
        </button>
      </nav>

      <div style={{ position: "fixed", bottom: "84px", left: "50%", transform: "translateX(-50%)", zIndex: 1000, display: "flex", flexDirection: "column", gap: "8px", width: "calc(100% - 40px)", maxWidth: "390px", pointerEvents: "none" }}>
        {toasts.map((t) => <Toast key={t.id} mensaje={t.mensaje} tipo={t.tipo} />)}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Home;
