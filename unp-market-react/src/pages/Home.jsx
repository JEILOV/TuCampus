// src/pages/Home.jsx
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate, useSearchParams }       from "react-router-dom";
import { ChevronDown, MapPin, SearchX, Store }      from "lucide-react";
import { useAuth }                                  from "../context/AuthContext";
import { useCampus }                                from "../context/CampusContext";
import { useProducts }                              from "../hooks/useProducts";
import { obtenerProductosSeccion }                  from "../services/seccionesService";
import { useToast, ToastContainer }                 from "../components/Toast";
import BottomNav                                    from "../components/BottomNav";
import BotonNotificaciones                          from "../components/BotonNotificaciones";
import BannerNotificaciones                          from "../components/BannerNotificaciones";
import ProductCard                                  from "../components/ProductCard";
import SeccionCarrusel                              from "../components/SeccionCarrusel";
import CarruselAnuncios                             from "../components/CarruselAnuncios";
import PanelFiltrosLateral                          from "../components/PanelFiltrosLateral";
import FeedFiltros, {
  CATEGORIAS,
  FILTROS_AVANZADOS_INICIALES,
}                                                    from "../components/FeedFiltros";
import { LISTA_UNIVERSIDADES, obtenerColorUniversidad } from "../config/universidades";
import { leerFiltrosDeUrl, construirUrlFiltros }    from "../utils/filtrosUrl";

// ── Constantes ───────────────────────────────────────────────
// Placeholder de imagen — reemplazar por el archivo final.
const MASCOTA_ICONO = "/assets/mascota-icono-placeholder.png";

const ORDEN_CATEGORIAS_SECCIONES = [
  "comida",
  "tecnologia",
  "ropa",
  "materiales",
  "servicios",
  "otros",
];

const SECCIONES_INICIO = [
  { id: "recientes", titulo: "Recién publicados", categoria: null },
  ...ORDEN_CATEGORIAS_SECCIONES.map((catKey) => ({
    id: catKey,
    titulo: CATEGORIAS.find((c) => c.key === catKey)?.label || catKey,
    categoria: catKey,
  })),
];

/**
 * Función pura (FASE 5): devuelve true únicamente cuando NO hay búsqueda,
 * categoría ni filtros avanzados activos.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const esModoSecciones = ({
  busqueda = "",
  categoriaActiva = "todos",
  filtrosAvanzados = FILTROS_AVANZADOS_INICIALES,
} = {}) => {
  if (String(busqueda || "").trim() !== "") return false;
  if ((categoriaActiva || "todos") !== "todos") return false;
  const f = filtrosAvanzados || FILTROS_AVANZADOS_INICIALES;
  if (
    (f.condicion ?? FILTROS_AVANZADOS_INICIALES.condicion) !==
    FILTROS_AVANZADOS_INICIALES.condicion
  ) {
    return false;
  }
  if (
    (f.precioMin ?? FILTROS_AVANZADOS_INICIALES.precioMin) !==
    FILTROS_AVANZADOS_INICIALES.precioMin
  ) {
    return false;
  }
  if (
    (f.precioMax ?? FILTROS_AVANZADOS_INICIALES.precioMax) !==
    FILTROS_AVANZADOS_INICIALES.precioMax
  ) {
    return false;
  }
  if (
    (f.orden ?? FILTROS_AVANZADOS_INICIALES.orden) !==
    FILTROS_AVANZADOS_INICIALES.orden
  ) {
    return false;
  }
  return true;
};

// ── Componente principal ─────────────────────────────────────
const Home = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filtrosInicialesUrl = leerFiltrosDeUrl(searchParams);

  const { user, perfil, favoritos } = useAuth();

  // ── Estado de UI ─────────────────────────────────────────
  // 🔧 `busqueda` ahora llega YA debounced (250ms) desde FeedFiltros —
  // Home.jsx ya no necesita su propio setTimeout duplicado. Se sigue
  // usando tanto para el filtro server-side (keywords, vía useProducts)
  // como para el filtro client-side fino de título+descripción de abajo.
  const [busqueda,          setBusqueda]          = useState(filtrosInicialesUrl.q);
  const [categoriaActiva,   setCategoriaActiva]   = useState(filtrosInicialesUrl.cat);
  const [filtrosAvanzados,  setFiltrosAvanzados]  = useState(FILTROS_AVANZADOS_INICIALES);
  const [toasts,            setToasts]            = useState([]);

  // Permite pasar al modo grilla sin categoría (orden por recientes) al tocar
  // "Ver todo" en la sección "Recién publicados", sin inventar UI nueva.
  const [forzarGrillaRecientes, setForzarGrillaRecientes] = useState(false);

  // Estado de secciones horizontales indexado por sede (evita mostrar estado viejo al cambiar sede)
  const [seccionesPorSede, setSeccionesPorSede] = useState({});
  // Modo degradado por sede: si falla la consulta de "Recién publicados" (p. ej. falta índice),
  // cae automáticamente a la grilla tradicional para que el Inicio nunca quede vacío.
  const [degradadoPorSede, setDegradadoPorSede] = useState({});

  // 🏫 Multicampus — sede que el Home está EXPLORANDO en este momento.
  // Ahora vive en CampusContext (compartido con toda la app) en vez de
  // estado local: así el selector de acá también recolorea BottomNav
  // y el badge de notificaciones (ver CampusContext.jsx para el porqué
  // y el detalle de cómo se sincroniza con perfil.universidadId).
  const { sedeActiva: universidadActiva, setSedeActiva, resetearSedeActiva, explorandoOtraSede } = useCampus();
  const [selectorCampusAbierto, setSelectorCampusAbierto] = useState(false);

  const sedeActivaRef = useRef(universidadActiva);
  const enVueloSeccionesRef = useRef(new Set());

  // Referencias estables para sincronizar URL ↔ estado sin cambiar la
  // identidad de handleBusquedaChange ni handleSeleccionarCategoria.
  const setSearchParamsRef = useRef(setSearchParams);
  const estadoUrlRef = useRef({
    q: filtrosInicialesUrl.q,
    cat: filtrosInicialesUrl.cat,
    tab: filtrosInicialesUrl.tab,
  });

  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  // Al cambiar universidadActiva (p. ej. desde CabeceraEscritorio),
  // salir de forzarGrillaRecientes igual que hacía handleCambiarCampus.
  useEffect(() => {
    sedeActivaRef.current = universidadActiva;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForzarGrillaRecientes(false);
  }, [universidadActiva]);

  const escribirUrl = useCallback((parcial) => {
    const actual = estadoUrlRef.current;
    const siguiente = {
      q: parcial.q !== undefined ? String(parcial.q || "").trim() : actual.q,
      cat: parcial.cat !== undefined ? parcial.cat || "todos" : actual.cat,
      tab: parcial.tab !== undefined ? parcial.tab || "inicio" : actual.tab,
    };
    actual.q = siguiente.q;
    actual.cat = siguiente.cat;
    actual.tab = siguiente.tab;

    const urlDestino = construirUrlFiltros(siguiente);
    const qsDestino = urlDestino.startsWith("/?") ? urlDestino.slice(2) : "";
    const enUrlAhora = leerFiltrosDeUrl(
      typeof window !== "undefined" ? window.location.search : ""
    );

    if (
      enUrlAhora.q !== siguiente.q ||
      enUrlAhora.cat !== siguiente.cat ||
      enUrlAhora.tab !== siguiente.tab
    ) {
      setSearchParamsRef.current?.(new URLSearchParams(qsDestino), {
        replace: true,
      });
    }
  }, []);

  const handleCambiarCampus = (universidadId) => {
    sedeActivaRef.current = universidadId;
    setForzarGrillaRecientes(false);
    setSeccionesPorSede({});
    setSedeActiva(universidadId);
    setSelectorCampusAbierto(false);
  };

  const handleSeleccionarCategoria = useCallback(
    (cat) => {
      setForzarGrillaRecientes(false);
      setCategoriaActiva(cat);
      escribirUrl({ cat, tab: "inicio" });
    },
    [escribirUrl]
  );

  const handleAplicarFiltros = useCallback((nuevosFiltros) => {
    setForzarGrillaRecientes(false);
    setFiltrosAvanzados(nuevosFiltros);
  }, []);

  const handleBusquedaChange = useCallback(
    (nuevoTexto) => {
      setForzarGrillaRecientes(false);
      setBusqueda(nuevoTexto);
      escribirUrl({ q: nuevoTexto, tab: "inicio" });
    },
    [escribirUrl]
  );

  const tabUrl = searchParams.get("tab") || "inicio";
  const [tabActiva, setTabActiva] = useState(tabUrl);
  useEffect(() => { setTabActiva(tabUrl); }, [tabUrl]);

  // Sincroniza URL → estado solo cuando los valores de la URL difieren
  // del estado actual (evita ping-pong URL ↔ estado).
  useEffect(() => {
    const { q: qUrl, cat: catUrl, tab: tabLeida } = leerFiltrosDeUrl(searchParams);
    const actual = estadoUrlRef.current;
    actual.tab = tabLeida;

    if (qUrl !== actual.q) {
      actual.q = qUrl;
      setBusqueda(qUrl);
      setForzarGrillaRecientes(false);
    }
    if (catUrl !== actual.cat) {
      actual.cat = catUrl;
      setCategoriaActiva(catUrl);
      setForzarGrillaRecientes(false);
    }
  }, [searchParams]);

  // 🔧 Compat: links viejos con ?tab=notifs (guardados/compartidos antes
  // de este refactor) redirigen a la nueva página independiente.
  useEffect(() => {
    if (tabUrl === "notifs") navigate("/notificaciones", { replace: true });
  }, [tabUrl, navigate]);

  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // ✅ Toast helper unificado (modo array)
  const mostrarToast = useToast(setToasts);

  const modoDegradado = Boolean(universidadActiva && degradadoPorSede[universidadActiva]);
  const mostrarSecciones =
    esModoSecciones({ busqueda, categoriaActiva, filtrosAvanzados }) &&
    !forzarGrillaRecientes &&
    !modoDegradado;

  // ── Carga de una sección individual (protegida contra carrera al cambiar de sede) ──
  const solicitarCargaSeccion = useCallback(async (sedeObjetivo, seccion) => {
    if (!sedeObjetivo) return;
    const claveVuelo = `${sedeObjetivo}:${seccion.id}`;
    if (enVueloSeccionesRef.current.has(claveVuelo)) return;
    enVueloSeccionesRef.current.add(claveVuelo);

    setSeccionesPorSede((prev) => ({
      ...prev,
      [sedeObjetivo]: {
        ...(prev[sedeObjetivo] || {}),
        [seccion.id]: {
          cargando: true,
          terminada: false,
          productos: prev[sedeObjetivo]?.[seccion.id]?.productos || [],
          error: null,
        },
      },
    }));

    const res = await obtenerProductosSeccion({
      universidadId: sedeObjetivo,
      categoria: seccion.categoria,
      limite: 10,
    });

    enVueloSeccionesRef.current.delete(claveVuelo);

    // Si el usuario cambió de sede mientras la consulta estaba en vuelo, se ignora la respuesta
    if (sedeActivaRef.current !== sedeObjetivo) return;

    // MODO DEGRADADO: si "Recién publicados" falla (índice u otro error), cae al modo grilla
    if (seccion.id === "recientes" && (res.error === "indice" || res.error === "otro")) {
      setDegradadoPorSede((prev) => ({ ...prev, [sedeObjetivo]: true }));
      return;
    }

    setSeccionesPorSede((prev) => ({
      ...prev,
      [sedeObjetivo]: {
        ...(prev[sedeObjetivo] || {}),
        [seccion.id]: {
          cargando: false,
          terminada: true,
          productos: res.productos,
          error: res.error,
        },
      },
    }));
  }, []);

  // ── Hook: Productos (server-side: sede, categoría, orden, keywords) ──
  // En modo secciones (pestaña inicio) se deshabilita para no duplicar lecturas.
  const { productos, cargando, todoCargado, cargarMas } = useProducts({
    orden: filtrosAvanzados.orden,
    categoriaActiva,
    busquedaFirebase: busqueda,
    universidadId: universidadActiva, // 🏫 Multicampus — sede que se está explorando (puede diferir de la del perfil)
    onError: (msg) => mostrarToast(msg, "error"),
    habilitado: !mostrarSecciones || tabActiva === "favoritos",
  });

  // ── Infinite scroll (solo aplica en modo grilla) ──────────────────────
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    if (mostrarSecciones || todoCargado || !sentinelRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) cargarMas(); },
      { root: null, rootMargin: "200px", threshold: 0.1 }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [mostrarSecciones, cargarMas, todoCargado]);

  // ── Filtrado client-side ──────────────────────────────────
  // Se aplica sobre lo que ya trajo useProducts (server-side ya filtró
  // por sede/categoría/keywords/orden). Acá se afinan:
  //   · texto libre en título O descripción (más permisivo que el
  //     array-contains exacto de keywords que hace Firestore)
  //   · condición (Nuevo/Como nuevo/Usado)
  //   · rango de precio mín/máx
  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const { condicion, precioMin, precioMax } = filtrosAvanzados;
    const min = precioMin !== "" ? Number(precioMin) : null;
    const max = precioMax !== "" ? Number(precioMax) : null;

    return productos.filter((p) => {
      if (categoriaActiva !== "todos" && p.categoria !== categoriaActiva) return false;

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
  }, [productos, busqueda, categoriaActiva, filtrosAvanzados]);

  const hayFiltrosActivos =
    busqueda.trim() !== "" ||
    categoriaActiva !== "todos" ||
    filtrosAvanzados.condicion !== "todos" ||
    filtrosAvanzados.precioMin !== "" ||
    filtrosAvanzados.precioMax !== "";

  const handleResetearFiltros = () => {
    setForzarGrillaRecientes(false);
    setBusqueda("");
    setCategoriaActiva("todos");
    setFiltrosAvanzados(FILTROS_AVANZADOS_INICIALES);
    escribirUrl({ q: "", cat: "todos", tab: "inicio" });
  };

  const handleVerDetalle = (id) => navigate(`/producto?id=${id}`);

  const seccionesActuales = (universidadActiva && seccionesPorSede[universidadActiva]) || {};
  const estadoRecientes = seccionesActuales.recientes;
  const sedeSinProductosEnSecciones = Boolean(
    estadoRecientes?.terminada &&
      !estadoRecientes?.error &&
      (estadoRecientes.productos || []).length === 0
  );

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
    <div className="w-full bg-background md:min-h-screen">
      <div className="app-shell font-sans md:max-w-[1280px] md:overflow-visible md:bg-transparent md:shadow-none">

        {/* HEADER MÓVIL (< 768px) — azul clásico para UNP, color institucional dinámico para el resto */}
        <div className="md:hidden">
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
                  onClick={() => {
                    setForzarGrillaRecientes(false);
                    resetearSedeActiva();
                  }}
                  className="flex items-center gap-1.5 rounded-chip bg-background/10 px-3 py-1 text-[11px] font-semibold text-background/85 backdrop-blur-sm"
                >
                  Estás explorando {LISTA_UNIVERSIDADES.find((u) => u.id === universidadActiva)?.nombre ?? "otra sede"}
                  <span className="font-extrabold underline underline-offset-2">Volver a mi campus</span>
                </button>
              </div>
            )}
          </header>

          {/* Botón flotante de notificaciones — fijo en la esquina superior
              derecha en móvil (devuelve null en md+). */}
          <BotonNotificaciones />
        </div>

        {tabActiva === "inicio" && (
          <>
            {/* Buscador + Chips de categoría + Filtros avanzados — en móvil
                se monta sobre el borde inferior del header; en md muestra
                chips + botón Filtros; en lg lo reemplaza CabeceraEscritorio
                + PanelFiltrosLateral. */}
            <div className="relative z-10 -mt-5 md:mt-4 lg:hidden">
              <FeedFiltros
                categoriaActiva={categoriaActiva}
                onCategoriaChange={handleSeleccionarCategoria}
                filtros={filtrosAvanzados}
                onAplicarFiltros={handleAplicarFiltros}
                onBusquedaChange={handleBusquedaChange}
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
          <section className="px-4 pb-28 pt-5 md:px-5 md:pb-12 lg:px-6">
            {mostrarSecciones ? (
              sedeSinProductosEnSecciones ? (
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
              ) : (
                <div key={universidadActiva || "sin-sede"}>
                  {SECCIONES_INICIO.map((seccion, idx) => {
                    const estadoSeccion = seccionesActuales[seccion.id];
                    const cargandoSeccion = Boolean(estadoSeccion?.cargando);
                    const pendienteCarga = !estadoSeccion?.terminada && !cargandoSeccion;

                    return (
                      <SeccionCarrusel
                        key={`${universidadActiva || "sede"}:${seccion.id}`}
                        indice={idx}
                        titulo={seccion.titulo}
                        ariaLabel={seccion.titulo}
                        productos={estadoSeccion?.productos || []}
                        cargando={cargandoSeccion}
                        pendienteCarga={pendienteCarga}
                        onVisible={() => solicitarCargaSeccion(universidadActiva, seccion)}
                        onVerDetalle={handleVerDetalle}
                        onVerTodo={() => {
                          if (seccion.categoria) {
                            handleSeleccionarCategoria(seccion.categoria);
                          } else {
                            setForzarGrillaRecientes(true);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              )
            ) : (
              <div className="lg:flex lg:items-start lg:gap-6">
                <PanelFiltrosLateral
                  categoriaActiva={categoriaActiva}
                  onCategoriaChange={handleSeleccionarCategoria}
                  filtros={filtrosAvanzados}
                  onAplicarFiltros={handleAplicarFiltros}
                  onLimpiar={handleResetearFiltros}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-extrabold text-ink">Destacados</h2>
                    {hayFiltrosActivos && (
                      <span className="text-[12px] font-bold text-ink/40">
                        {productosFiltrados.length} resultado{productosFiltrados.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  {productosFiltrados.length > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
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
                </div>
              </div>
            )}
          </section>
        )}

        {tabActiva === "favoritos" && (
          <section className="px-4 pb-28 pt-6 md:px-5 md:pb-12 lg:px-6">
            <h2 className="text-lg font-extrabold text-ink">Mis Favoritos</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {favoritos.size === 0 ? (
                <p className="col-span-full py-10 text-center text-sm font-semibold text-ink/40">
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

        {/* Pie de página simple (solo md+) */}
        <footer className="hidden border-t border-ink/10 py-6 text-center text-[12.5px] font-semibold text-ink/55 md:block">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 lg:px-6">
            <span>TuCampus · Conecta. Comparte. Crece.</span>
            <Link
              to="/terminos"
              className="font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Términos y condiciones
            </Link>
          </div>
        </footer>

        {/* Notificaciones ya no es un tab: ahora vive en /notificaciones,
            accesible desde el botón flotante de la campana (ver arriba). */}

        {/* BOTTOM NAVIGATION */}
        <BottomNav activo={tabActiva} />

        {/* ✅ TOAST CONTAINER LIMPIO */}
        <ToastContainer toasts={toasts} />
      </div>
    </div>
  );
};

export default Home;
