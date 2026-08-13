// src/pages/Home.jsx
import { useState, useEffect, useRef }              from "react";
import { useNavigate, useSearchParams }             from "react-router-dom";
import { Search, ChevronDown }                      from "lucide-react";
import { useAuth }                                  from "../context/AuthContext";
import { useProducts }                              from "../hooks/useProducts";
import { useToast, ToastContainer }                 from "../components/Toast";
import BottomNav                                    from "../components/BottomNav";
import BotonNotificaciones                          from "../components/BotonNotificaciones";
import ProductCard                                  from "../components/ProductCard";
import CarruselAnuncios                             from "../components/CarruselAnuncios";
import { CATEGORY_ICON_MAP }                        from "../components/CategoryIcons";

// ── Constantes ───────────────────────────────────────────────
// Placeholder de imagen — reemplazar por el archivo final.
const MASCOTA_ICONO = "/assets/mascota-icono-placeholder.png";

// 🔧 Categorías ampliadas — deben coincidir EXACTAMENTE (misma key)
// con el <select> de Publicar.jsx / EditarProducto.jsx y con
// CATEGORIAS_VALIDAS en services/productService.js.
const CATEGORIAS = [
  { key: "todos",      label: "Todos" },
  { key: "comida",     label: "Comida & Snacks" },
  { key: "tecnologia", label: "Tecnología" },
  { key: "ropa",       label: "Ropa & Moda" },
  { key: "materiales", label: "Materiales & Libros" },
  { key: "servicios",  label: "Servicios & Tipeos" },
  { key: "otros",      label: "Otros" },
];

const OPCIONES_ORDEN = [
  { id: "recientes",       label: "Más recientes"   },
  { id: "precio_asc",      label: "Menor precio"    },
  { id: "precio_desc",     label: "Mayor precio"    },
  { id: "mejor_valorados", label: "Mejor valorados ⭐" },
];

// ── Componente principal ─────────────────────────────────────
const Home = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, perfil, favoritos } = useAuth();

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

  // 🔧 Compat: links viejos con ?tab=notifs (guardados/compartidos antes
  // de este refactor) redirigen a la nueva página independiente.
  useEffect(() => {
    if (tabUrl === "notifs") navigate("/notificaciones", { replace: true });
  }, [tabUrl, navigate]);

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
    universidadId: perfil?.universidadId, // 🏫 Multicampus — cada sede ve solo sus productos
    onError: (msg) => mostrarToast(msg, "error"),
  });

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

  const labelOrden = OPCIONES_ORDEN.find((o) => o.id === orden)?.label ?? "Más recientes";

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="app-shell font-sans">

      {/* HEADER AZUL */}
      <header className="relative rounded-b-[32px] bg-primary px-6 pb-10 pt-8">
        <div className="flex items-center justify-center gap-3">
          <img src={MASCOTA_ICONO} alt="TuCampus" className="h-14 w-14 object-contain" />
          <div className="text-left">
            <p className="text-2xl font-extrabold leading-none text-background">TuCampus</p>
            <p className="mt-1 text-[12px] font-medium text-background/75">Conecta. Comparte. Crece.</p>
          </div>
        </div>
      </header>

      {/* Botón flotante de notificaciones — fijo en la esquina superior
          derecha, visible en todas las vistas principales sin taparse
          con el header. */}
      <BotonNotificaciones />

      {tabActiva === "inicio" && (
        <>
          {/* Buscador — se monta sobre el borde inferior del header */}
          <div className="relative z-10 -mt-5 px-4">
            <div className="flex items-center gap-2.5 rounded-btn bg-card px-4 py-3.5 shadow-softLg">
              <Search size={18} className="shrink-0 text-ink/40" />
              <input
                type="text"
                placeholder="Buscar postres, libros, tipeos..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-ink placeholder:font-medium placeholder:text-ink/40 focus:outline-none"
              />
            </div>
          </div>

          {/* Carrusel de Anuncios — flyers de eventos/promos del campus */}
          <CarruselAnuncios />

          {/* Categorías — carrusel horizontal */}
          <nav
            aria-label="Categorías"
            className="mt-5 flex gap-5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {CATEGORIAS.map(({ key, label }) => {
              const Icon = CATEGORY_ICON_MAP[key];
              const activa = categoriaActiva === key;
              return (
                <button
                  key={key}
                  onClick={() => setCategoriaActiva(key)}
                  className="flex shrink-0 flex-col items-center gap-1.5"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-card shadow-soft transition-colors ${
                      activa ? "bg-primary" : "bg-card"
                    }`}
                  >
                    <Icon color={activa ? "#F7EEDC" : "#102C4D"} />
                  </span>
                  <span className={`text-[11px] font-semibold ${activa ? "text-primary" : "text-ink/60"}`}>
                    {label}
                  </span>
                  <span className={`h-[3px] w-4 rounded-full ${activa ? "bg-primary" : "bg-transparent"}`} />
                </button>
              );
            })}
          </nav>
        </>
      )}

      {tabActiva === "inicio" && (
        <section className="px-4 pb-28 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-ink">Destacados</h2>
            <div className="relative">
              <button
                onClick={() => setMenuOrdenAbierto(!menuOrdenAbierto)}
                className="flex items-center gap-1.5 rounded-chip bg-card px-3.5 py-1.5 text-[13px] font-bold text-ink shadow-soft"
              >
                {labelOrden}
                <ChevronDown
                  size={14}
                  strokeWidth={2.5}
                  className={`transition-transform ${menuOrdenAbierto ? "rotate-180" : ""}`}
                />
              </button>
              {menuOrdenAbierto && (
                <>
                  <div onClick={() => setMenuOrdenAbierto(false)} className="fixed inset-0 z-[90]" />
                  <div className="absolute right-0 top-full z-[100] mt-2 flex min-w-[150px] flex-col overflow-hidden rounded-card bg-card shadow-softLg">
                    {OPCIONES_ORDEN.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => { setOrden(opt.id); setMenuOrdenAbierto(false); }}
                        className={`px-4 py-3 text-left text-[13px] font-bold ${
                          orden === opt.id ? "bg-primary/5 text-primary" : "text-ink/60"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {productosFiltrados.map((p) => (
              <ProductCard key={p.id} producto={p} onVerDetalle={handleVerDetalle} />
            ))}
          </div>

          {!todoCargado && <div ref={sentinelRef} className="h-2" />}

          {cargando && (
            <div className="mt-6 flex justify-center">
              <div className="flex items-center gap-2 rounded-chip bg-card px-4 py-2 text-[13px] font-bold text-ink/60 shadow-soft">
                <svg className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="#0639B8" strokeWidth="2.5">
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
        <section className="px-4 pb-28 pt-6">
          <h2 className="text-lg font-extrabold text-ink">Mis Favoritos</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {favoritos.size === 0 ? (
              <p className="col-span-2 py-10 text-center text-sm font-semibold text-ink/40">
                Aún no tienes favoritos guardados.
              </p>
            ) : (
              productos.filter((p) => favoritos.has(p.id)).map((p) => (
                <ProductCard key={p.id} producto={p} onVerDetalle={handleVerDetalle} />
              ))
            )}
          </div>
        </section>
      )}

      {/* Notificaciones ya no es un tab: ahora vive en /notificaciones,
          accesible desde el botón flotante de la campana (ver arriba). */}

      {/* BOTTOM NAVIGATION */}
      <BottomNav activo={tabActiva} />

      {/* ✅ TOAST CONTAINER LIMPIO */}
      <ToastContainer toasts={toasts} />
    </div>
  );
};

export default Home;