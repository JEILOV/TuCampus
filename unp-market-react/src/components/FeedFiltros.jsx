// src/components/FeedFiltros.jsx
// ============================================================
//  TuCampus — Buscador en tiempo real + Filtros avanzados (Feed)
//
//  Consolida en un solo componente reusable:
//    1. Input de búsqueda con debounce ligero (250ms) + botón "X".
//    2. Chips de categoría en barra horizontal con scroll.
//    3. Botón de "Filtros" que abre un drawer inferior con:
//       Condición, Orden y Rango de precio — con contador de
//       filtros activos en el propio botón.
//
//  IMPORTANTE — CAMPO "condición":
//  El modelo de datos actual de `productos` (ver esProductoValido()
//  en firestore.rules y productService.crearProducto) NO tiene un
//  campo `condicion` (Nuevo/Como nuevo/Usado). Este filtro queda
//  100% funcional en la UI y en la lógica de filtrado (Feed.jsx lo
//  aplica sobre `producto.condicion`), pero mientras ese campo no se
//  agregue al formulario de Publicar/Editar y a las Firestore Rules,
//  ningún producto existente lo tendrá — así que el filtro no
//  devolverá resultados salvo "Todos". No se inventa un valor por
//  defecto para no ocultar productos reales silenciosamente.
//
//  USO:
//    <FeedFiltros
//      categoriaActiva={categoriaActiva}
//      onCategoriaChange={setCategoriaActiva}
//      filtros={filtrosAvanzados}
//      onAplicarFiltros={setFiltrosAvanzados}
//      onBusquedaChange={setBusqueda}   // recibe el término YA debounced
//    />
// ============================================================

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, SlidersHorizontal } from "lucide-react";

// 🔧 Mismo set que productService.CATEGORIAS_VALIDAS / firestore.rules
// (esProductoValido) — no agregar/quitar acá sin replicarlo allá.
export const CATEGORIAS = [
  { key: "todos",      label: "Todas" },
  { key: "tecnologia", label: "Tecnología" },
  { key: "materiales", label: "Libros/Apuntes" },
  { key: "ropa",       label: "Ropa" },
  { key: "comida",     label: "Comida" },
  { key: "servicios",  label: "Servicios" },
  { key: "otros",      label: "Otros" },
];

export const CONDICIONES = [
  { id: "todos",      label: "Todos" },
  { id: "nuevo",      label: "Nuevo" },
  { id: "como_nuevo", label: "Como nuevo" },
  { id: "usado",      label: "Usado" },
];

export const OPCIONES_ORDEN = [
  { id: "recientes",   label: "Más recientes" },
  { id: "populares",   label: "Más populares" },
  { id: "precio_asc",  label: "Precio: Menor a mayor" },
  { id: "precio_desc", label: "Precio: Mayor a menor" },
];

// Estado "vacío" de filtros avanzados — exportado para que Feed/Home.jsx
// lo use como valor inicial y como referencia al calcular si hay
// filtros activos.
export const FILTROS_AVANZADOS_INICIALES = {
  condicion: "todos",
  orden: "recientes",
  precioMin: "",
  precioMax: "",
};

// Cuenta cuántos filtros avanzados están "tocados" respecto del
// estado inicial — usado para el contador en el botón "Filtros".
export const contarFiltrosActivos = (filtros) => {
  let n = 0;
  if (filtros.condicion !== "todos") n++;
  if (filtros.orden !== "recientes") n++;
  if (filtros.precioMin !== "") n++;
  if (filtros.precioMax !== "") n++;
  return n;
};

const FeedFiltros = ({
  categoriaActiva,
  onCategoriaChange,
  filtros,
  onAplicarFiltros,
  onBusquedaChange,
  placeholder = "Buscar postres, libros, tipeos...",
}) => {
  // ── Búsqueda con debounce ligero (250ms) ──────────────────
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const primerRender = useRef(true);

  useEffect(() => {
    // Evita disparar un onBusquedaChange("") extra en el montaje inicial.
    if (primerRender.current) { primerRender.current = false; return; }
    const timer = setTimeout(() => {
      onBusquedaChange?.(textoBusqueda.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [textoBusqueda, onBusquedaChange]);

  const limpiarBusqueda = () => setTextoBusqueda("");

  // ── Drawer de filtros avanzados ────────────────────────────
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [draft, setDraft] = useState(filtros);

  // Sincroniza el borrador cada vez que se ABRE el drawer, para que
  // siempre arranque desde los filtros realmente aplicados (y no desde
  // un borrador viejo si el usuario abrió y cerró sin aplicar antes).
  const abrirDrawer = () => {
    setDraft(filtros);
    setDrawerAbierto(true);
  };
  const cerrarDrawer = () => setDrawerAbierto(false);

  const handleAplicar = () => {
    // 🔧 Normaliza precioMin/precioMax: si el usuario cruzó los valores
    // (ej. mín 100, máx 20), los intercambiamos en vez de devolver un
    // rango vacío sin avisar — mejor esfuerzo, no un error bloqueante.
    let { precioMin, precioMax } = draft;
    if (precioMin !== "" && precioMax !== "" && Number(precioMin) > Number(precioMax)) {
      [precioMin, precioMax] = [precioMax, precioMin];
    }
    onAplicarFiltros({ ...draft, precioMin, precioMax });
    setDrawerAbierto(false);
  };

  const handleLimpiarDrawer = () => setDraft(FILTROS_AVANZADOS_INICIALES);

  const filtrosActivos = contarFiltrosActivos(filtros);

  return (
    <div>
      {/* ── Barra de búsqueda ── */}
      <div className="relative z-10 px-4">
        <div className="flex items-center gap-2.5 rounded-btn bg-card px-4 py-3.5 shadow-softLg">
          <Search size={18} className="shrink-0 text-ink/40" />
          <input
            type="text"
            placeholder={placeholder}
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-ink placeholder:font-medium placeholder:text-ink/40 focus:outline-none"
          />
          {textoBusqueda !== "" && (
            <button
              type="button"
              onClick={limpiarBusqueda}
              aria-label="Limpiar búsqueda"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink/50 transition-colors active:bg-ink/20"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* ── Chips de categoría + botón de filtros avanzados ── */}
      <div className="mt-3.5 flex items-center gap-2.5 px-4">
        <nav
          aria-label="Categorías"
          className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CATEGORIAS.map(({ key, label }) => {
            const activa = categoriaActiva === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onCategoriaChange(key)}
                className={`shrink-0 whitespace-nowrap rounded-chip px-4 py-2 text-[12.5px] font-bold transition-all duration-200 ease-out active:scale-95 ${
                  activa
                    ? "bg-[var(--color-accent,#0639B8)] text-background shadow-soft"
                    : "bg-card text-ink/60 shadow-soft"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Botón de filtros avanzados — contador de filtros activos */}
        <button
          type="button"
          onClick={abrirDrawer}
          aria-label="Filtros avanzados"
          className={`relative flex shrink-0 items-center gap-1.5 rounded-chip px-4 py-2.5 text-[12.5px] font-bold shadow-soft transition-all duration-200 ease-out active:scale-95 ${
            filtrosActivos > 0
              ? "bg-[var(--color-accent,#0639B8)] text-background"
              : "bg-card text-ink/70"
          }`}
        >
          <SlidersHorizontal size={15} strokeWidth={2.4} />
          Filtros
          {filtrosActivos > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-background px-1 text-[10.5px] font-extrabold text-[var(--color-accent,#0639B8)]">
              {filtrosActivos}
            </span>
          )}
        </button>
      </div>

      {/* ── Drawer inferior: Filtros avanzados ──
          🔧 Portal a document.body: FeedFiltros vive dentro del árbol de
          Home (dentro de <main>), mientras que BottomNav se monta en la
          raíz de App — ambos comparten el DOM, pero cada subárbol de
          React puede terminar en un stacking context distinto según los
          ancestros (transform/filter/etc.), donde un z-index alto ya no
          alcanza para "escapar" del contexto padre. createPortal saca
          este nodo del árbol DOM de Home por completo y lo monta como
          hijo directo de <body>, al mismo nivel que BottomNav, así que
          un z-index simple (sin trucos) alcanza para quedar por encima
          de CUALQUIER otro elemento global (BottomNav, toasts, etc.).
          El contenedor del portal usa z-[100]; overlay y panel quedan
          en capas relativas dentro de esa misma capa. */}
      {drawerAbierto && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          {/* Overlay/backdrop — clic afuera cierra el drawer */}
          <div
            onClick={cerrarDrawer}
            aria-hidden="true"
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
          />

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[480px] rounded-t-[32px] bg-card px-5 pt-3 shadow-softLg"
            style={{ paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
          >
            {/* Handle visual */}
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink/15" />

            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-extrabold text-ink">Filtros avanzados</h2>
              <button
                type="button"
                onClick={cerrarDrawer}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5 text-ink/50"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* Condición */}
            <div className="mt-5">
              <h3 className="mb-2.5 text-[13px] font-extrabold text-ink/70">Condición</h3>
              <div className="flex flex-wrap gap-2">
                {CONDICIONES.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, condicion: id }))}
                    className={`rounded-chip px-4 py-2 text-[12.5px] font-bold transition-colors ${
                      draft.condicion === id
                        ? "bg-primary text-white"
                        : "bg-background text-ink/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Orden */}
            <div className="mt-5">
              <h3 className="mb-2.5 text-[13px] font-extrabold text-ink/70">Ordenar por</h3>
              <div className="flex flex-col gap-2">
                {OPCIONES_ORDEN.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, orden: id }))}
                    className={`flex items-center justify-between rounded-2xl border-[1.5px] px-4 py-3 text-left text-[13.5px] font-bold transition-colors ${
                      draft.orden === id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-ink/10 text-ink/60"
                    }`}
                  >
                    {label}
                    {draft.orden === id && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Rango de precio */}
            <div className="mt-5">
              <h3 className="mb-2.5 text-[13px] font-extrabold text-ink/70">Rango de precio (S/)</h3>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder="Precio mín."
                  value={draft.precioMin}
                  onChange={(e) => setDraft((d) => ({ ...d, precioMin: e.target.value }))}
                  className="w-full rounded-2xl border-[1.5px] border-ink/10 bg-background px-4 py-3 text-[13.5px] font-bold text-ink placeholder:font-semibold placeholder:text-ink/35 focus:border-primary focus:outline-none"
                />
                <span className="shrink-0 text-ink/30">—</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder="Precio máx."
                  value={draft.precioMax}
                  onChange={(e) => setDraft((d) => ({ ...d, precioMax: e.target.value }))}
                  className="w-full rounded-2xl border-[1.5px] border-ink/10 bg-background px-4 py-3 text-[13.5px] font-bold text-ink placeholder:font-semibold placeholder:text-ink/35 focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Acciones */}
            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={handleLimpiarDrawer}
                className="h-[52px] flex-1 rounded-btn border-[1.5px] border-ink/10 bg-background text-[14.5px] font-extrabold text-ink/70"
              >
                Limpiar filtros
              </button>
              <button
                type="button"
                onClick={handleAplicar}
                className="h-[52px] flex-[1.4] rounded-btn bg-primary text-[15px] font-extrabold text-white shadow-soft"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default FeedFiltros;