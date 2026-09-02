// src/pages/Home.jsx
import { useState, useEffect, useMemo, useRef }     from "react";
import { useNavigate, useSearchParams }             from "react-router-dom";
import { ChevronDown, MapPin, SearchX, Store }      from "lucide-react";
import { useAuth }                                  from "../context/AuthContext";
import { useCampus }                                from "../context/CampusContext";
import { useProducts }                              from "../hooks/useProducts";
import { useToast, ToastContainer }                 from "../components/Toast";
import BottomNav                                    from "../components/BottomNav";
import BotonNotificaciones                          from "../components/BotonNotificaciones";
import BannerNotificaciones                          from "../components/BannerNotificaciones";
import ProductCard                                  from "../components/ProductCard";
import CarruselAnuncios                             from "../components/CarruselAnuncios";
import FeedFiltros, {
  FILTROS_AVANZADOS_INICIALES,
}                                                    from "../components/FeedFiltros";
import { LISTA_UNIVERSIDADES, obtenerColorUniversidad } from "../config/universidades";

// ── Constantes ───────────────────────────────────────────────
// Placeholder de imagen — reemplazar por el archivo final.
const MASCOTA_ICONO = "/assets/mascota-icono-placeholder.png";

// ── Componente principal ─────────────────────────────────────
const Home = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, perfil, favoritos } = useAuth();

  // ── Estado de UI ─────────────────────────────────────────
  // 🔧 `busqueda` ahora llega YA debounced (250ms) desde FeedFiltros —
  // Home.jsx ya no necesita su propio setTimeout duplicado. Se sigue
  // usando tanto para el filtro server-side (keywords, vía useProducts)
  // como para el filtro client-side fino de título+descripción de abajo.
  const [busqueda,          setBusqueda]          = useState("");
  const [categoriaActiva,   setCategoriaActiva]   = useState("todos");
  const [filtrosAvanzados,  setFiltrosAvanzados]  = useState(FILTROS_AVANZADOS_INICIALES);
  const [toasts,            setToasts]            = useState([]);

  // 🏫 Multicampus — sede que el Home está EXPLORANDO en este momento.
  // Ahora vive en CampusContext (compartido con toda la app) en vez de
  // estado local: así el selector de acá también recolorea BottomNav
  // y el badge de notificaciones (ver CampusContext.jsx para el porqué
  // y el detalle de cómo se sincroniza con perfil.universidadId).
  const { sedeActiva: universidadActiva, setSedeActiva, resetearSedeActiva, explorandoOtraSede } = useCampus();
  const [selectorCampusAbierto, setSelectorCampusAbierto] = useState(false);

  const handleCambiarCampus = (universidadId) => {
    setSedeActiva(universidadId);
    setSelectorCampusAbierto(false);
  };

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

  // ── Hook: Productos (server-side: sede, categoría, orden, keywords) ──
  const { productos, cargando, todoCargado, cargarMas } = useProducts({
    orden: filtrosAvanzados.orden,
    categoriaActiva,
    busquedaFirebase: busqueda,
    universidadId: universidadActiva, // 🏫 Multicampus — sede que se está explorando (puede diferir de la del perfil)
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

  // 🔧 Cuenta de favoritos de un producto — mismo criterio flexible que
  // pide el ordenamiento "Más populares": `favoritosCount` (contador
  // denormalizado, si existiera) > `favoritos.length` (array) >
  // `likes.length` (alias legado) > 0 si nada de eso existe. Ningún
  // producto queda excluido por no tener el campo — a diferencia de
  // orderBy() en Firestore, acá los que no tienen favoritos simplemente
  // quedan al final, no se pierden.
  const contarFavoritos = (p) =>
    p?.favoritosCount ?? p?.favoritos?.length ?? p?.likes?.length ?? 0;

  // ── Filtrado client-side ──────────────────────────────────
  // Se aplica sobre lo que ya trajo useProducts (server-side ya filtró
  // por sede/categoría/keywords/orden). Acá se afinan:
  //   · texto libre en título O descripción (más permisivo que el
  //     array-contains exacto de keywords que hace Firestore)
  //   · condición (Nuevo/Como nuevo/Usado — ver nota en FeedFiltros.jsx
  //     sobre por qué hoy no hay productos con este campo)
  //   · rango de precio mín/máx
  //   · "Más populares": useProducts (ORDEN_CONFIG) no reconoce
  //     'populares' y por lo tanto pide al servidor el orden por
  //     defecto ("recientes") — acá se re-ordena en memoria por
  //     cantidad de favoritos, evitando así tener que crear un nuevo
  //     índice compuesto en Firestore solo para este criterio.
  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const { condicion, precioMin, precioMax, orden } = filtrosAvanzados;
    const min = precioMin !== "" ? Number(precioMin) : null;
    const max = precioMax !== "" ? Number(precioMax) : null;

    const filtrados = productos.filter((p) => {
      if (texto) {
        const enTitulo      = (p.titulo || "").toLowerCase().includes(texto);
        const enDescripcion = (p.descripcion || "").toLowerCase().includes(texto);
        if (!enTitulo && !enDescripcion) return false;
      }

      if (condicion !== "todos" && p.condicion !== condicion) return false;

      const precio = Number(p.precio) || 0;
      if (min !== null && precio < min) return false;
      if (max !== null && precio > max) return false;

      return true;
    });

    if (orden === "populares") {
      // [...filtrados] para no mutar el array devuelto por el filter.
      return [...filtrados].sort((a, b) => contarFavoritos(b) - contarFavoritos(a));
    }

    return filtrados;
  }, [productos, busqueda, filtrosAvanzados]);

  const hayFiltrosActivos =
    busqueda.trim() !== "" ||
    categoriaActiva !== "todos" ||
    filtrosAvanzados.condicion !== "todos" ||
    filtrosAvanzados.precioMin !== "" ||
    filtrosAvanzados.precioMax !== "";

  const handleResetearFiltros = () => {
    setBusqueda("");
    setCategoriaActiva("todos");
    setFiltrosAvanzados(FILTROS_AVANZADOS_INICIALES);
  };

  const handleVerDetalle = (id) => navigate(`/producto?id=${id}`);

  // 🎨 Multicampus: el color del header sigue la sede que se está
  // EXPLORANDO (`universidadActiva`), no necesariamente la del perfil
  // del usuario — mismo criterio que ya usa el selector de campus.
  //
  // 🔵 Excepción a pedido: UNP mantiene el azul "clásico" del Design
  // System (`bg-primary` / #0639B8) en vez del azul institucional del
  // catálogo (`#0f4c81`). Para el resto de sedes sí se usa el color
  // dinámico de `universidades.js`.
  const esUnp = universidadActiva === "unp";
  const colorHeader = obtenerColorUniversidad(universidadActiva);

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="app-shell font-sans">

      {/* HEADER — azul clásico para UNP, color institucional dinámico para el resto */}
      <header
        className={`relative rounded-b-[32px] px-6 pb-10 pt-8${esUnp ? " bg-primary" : ""}`}
        style={esUnp ? undefined : { backgroundColor: colorHeader }}
      >
        <div className="flex items-center justify-center gap-3">
          <img src={MASCOTA_ICONO} alt="TuCampus" className="h-14 w-14 object-contain" />
          <div className="text-left">
            <p className="text-2xl font-extrabold leading-none text-background">TuCampus</p>
            <p className="mt-1 text-[12px] font-medium text-background/75">Conecta. Comparte. Crece.</p>
          </div>
        </div>

        {/* Selector de Sede — permite explorar productos de otros campus.
            Solo cambia lo que el Home MUESTRA (universidadActiva); nunca
            afecta a qué sede se publica un producto. */}
        <div className="relative z-20 mt-4 flex justify-center">
          <button
            onClick={() => setSelectorCampusAbierto((v) => !v)}
            className="flex items-center gap-1.5 rounded-chip bg-background/15 px-3.5 py-1.5 text-[12px] font-bold text-background backdrop-blur-sm transition-all duration-200 ease-out active:scale-95"
          >
            <MapPin size={13} strokeWidth={2.5} />
            {LISTA_UNIVERSIDADES.find((u) => u.id === universidadActiva)?.id?.toUpperCase() ?? "SEDE"}
            <ChevronDown
              size={12}
              strokeWidth={3}
              className={`transition-transform duration-200 ease-out ${selectorCampusAbierto ? "rotate-180" : ""}`}
            />
          </button>

          {selectorCampusAbierto && (
            <>
              <div onClick={() => setSelectorCampusAbierto(false)} className="fixed inset-0 z-[90]" />
              <div className="absolute top-full z-[100] mt-2 flex min-w-[220px] flex-col overflow-hidden rounded-card bg-card shadow-softLg">
                {LISTA_UNIVERSIDADES.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleCambiarCampus(u.id)}
                    className={`flex items-center justify-between px-4 py-3 text-left text-[13px] font-bold ${
                      universidadActiva === u.id ? "bg-primary/5 text-primary" : "text-ink/60"
                    }`}
                  >
                    <span>📍 {u.nombre}</span>
                    {perfil?.universidadId === u.id && (
                      <span className="ml-2 shrink-0 text-[10px] font-semibold text-primary/70">Tu sede</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 🏫 Multicampus: chip "estás explorando otra sede" — solo se
            muestra si sedeActiva difiere de perfil.universidadId. Un
            solo click descarta la exploración y vuelve al campus propio
            (mismo resetearSedeActiva que usa el botón "Inicio" del
            BottomNav — ver CampusContext.jsx). */}
        {explorandoOtraSede && (
          <div className="relative z-20 mt-2.5 flex justify-center">
            <button
              onClick={resetearSedeActiva}
              className="flex items-center gap-1.5 rounded-chip bg-background/10 px-3 py-1 text-[11px] font-semibold text-background/85 backdrop-blur-sm"
            >
              Estás explorando {LISTA_UNIVERSIDADES.find((u) => u.id === universidadActiva)?.nombre ?? "otra sede"}
              <span className="font-extrabold underline underline-offset-2">Volver a mi campus</span>
            </button>
          </div>
        )}
      </header>

      {/* Botón flotante de notificaciones — fijo en la esquina superior
          derecha, visible en todas las vistas principales sin taparse
          con el header. */}
      <BotonNotificaciones />

      {tabActiva === "inicio" && (
        <>
          {/* Buscador + Chips de categoría + Filtros avanzados — se monta
              sobre el borde inferior del header. Reemplaza al bloque de
              búsqueda simple + categorías con íconos que había antes:
              ahora todo vive en un único componente reusable. */}
          <div className="relative z-10 -mt-5">
            <FeedFiltros
              categoriaActiva={categoriaActiva}
              onCategoriaChange={setCategoriaActiva}
              filtros={filtrosAvanzados}
              onAplicarFiltros={setFiltrosAvanzados}
              onBusquedaChange={setBusqueda}
            />
          </div>

          {/* Banner discreto para activar notificaciones push (FCM).
              Se autooculta apenas el usuario responde o lo cierra —
              ver src/components/BannerNotificaciones.jsx. */}
          <BannerNotificaciones />

          {/* Carrusel de Anuncios — flyers de eventos/promos del campus.
              🏫 Multicampus: se le pasa la sede activa para traer sus
              anuncios exclusivos + los globales (ver useAnuncios.js). */}
          <CarruselAnuncios universidadId={universidadActiva} />
        </>
      )}

      {tabActiva === "inicio" && (
        <section className="px-4 pb-28 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-ink">Destacados</h2>
            {hayFiltrosActivos && (
              <span className="text-[12px] font-bold text-ink/40">
                {productosFiltrados.length} resultado{productosFiltrados.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {productosFiltrados.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {productosFiltrados.map((p) => (
                <ProductCard key={p.id} producto={p} onVerDetalle={handleVerDetalle} />
              ))}
            </div>
          ) : !cargando ? (
            hayFiltrosActivos ? (
              // ── Empty state: sin coincidencias con los filtros actuales ──
              <div className="mt-10 flex flex-col items-center gap-3 px-6 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink/5">
                  <SearchX size={28} className="text-ink/30" strokeWidth={2} />
                </span>
                <p className="text-[15px] font-extrabold text-ink">
                  No encontramos productos con esos filtros
                </p>
                <p className="text-[13px] font-semibold text-ink/50">
                  Probá con otra palabra clave o ajustá los filtros aplicados.
                </p>
                <button
                  onClick={handleResetearFiltros}
                  className="mt-1 rounded-btn bg-primary px-5 py-2.5 text-[13.5px] font-extrabold text-white shadow-soft transition-transform active:scale-95"
                >
                  Limpiar búsqueda y filtros
                </button>
              </div>
            ) : (
              // ── Empty state MULTICAMPUS: la sede todavía no tiene
              // ningún producto publicado (sin filtros de por medio) —
              // distinto del caso de arriba: acá no hay nada que limpiar,
              // hay que invitar a publicar el primer producto de la sede.
              <div className="mt-10 flex flex-col items-center gap-3 px-6 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink/5">
                  <Store size={28} className="text-ink/30" strokeWidth={2} />
                </span>
                <p className="text-[15px] font-extrabold text-ink">
                  Todavía no hay productos en{" "}
                  {LISTA_UNIVERSIDADES.find((u) => u.id === universidadActiva)?.nombre || "esta sede"}
                </p>
                <p className="text-[13px] font-semibold text-ink/50">
                  Sé el primero en vender algo a tus compañeros de campus.
                </p>
                <button
                  onClick={() => navigate("/publicar")}
                  className="mt-1 rounded-btn bg-primary px-5 py-2.5 text-[13.5px] font-extrabold text-white shadow-soft transition-transform active:scale-95"
                >
                  Publicar mi primer producto
                </button>
              </div>
            )
          ) : null}

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