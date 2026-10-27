// src/components/CabeceraEscritorio.jsx
// ============================================================
//  TuCampus — Cabecera principal para tablet (md:) y escritorio (lg:)
//
//  Se monta una sola vez en App.jsx (dentro de <BrowserRouter>).
//  Por debajo de 768px o en la ruta "/login" devuelve null ANTES de
//  ejecutar los hooks de Firestore (useChatsNoLeidos, useNotifications),
//  de modo que en móvil no se abre ningún listener adicional.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  MapPin,
  ChevronDown,
  Search,
  X,
  Heart,
  MessageCircle,
  Bell,
  Plus,
  User,
  FileText,
  LogOut,
  LogIn,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCampus } from "../context/CampusContext";
import { useEsAncho } from "../hooks/useMediaQuery";
import { useChatsNoLeidos } from "../hooks/useChatsNoLeidos";
import { useNotifications } from "../hooks/useNotifications";
import { CATEGORIAS } from "./FeedFiltros";
import {
  LISTA_UNIVERSIDADES,
  obtenerColorUniversidad,
} from "../config/universidades";
import { leerFiltrosDeUrl, construirUrlFiltros } from "../utils/filtrosUrl";

const MASCOTA_ICONO = "/assets/mascota-icono-placeholder.png";

const BadgeContador = ({ cantidad }) => {
  if (!cantidad || cantidad <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-card bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white">
      {cantidad > 9 ? "9+" : cantidad}
    </span>
  );
};

const BuscadorCabecera = ({ qInicial, catActual, onBuscar }) => {
  const [texto, setTexto] = useState(qInicial || "");

  const manejarSubmit = (e) => {
    e.preventDefault();
    onBuscar(texto.trim(), catActual);
  };

  const manejarLimpiar = () => {
    setTexto("");
    if (qInicial) {
      onBuscar("", catActual);
    }
  };

  return (
    <form
      onSubmit={manejarSubmit}
      role="search"
      className="flex min-w-0 flex-1 items-center rounded-btn bg-card px-3.5 py-2 shadow-soft focus-within:ring-2 focus-within:ring-background/80"
    >
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar postres, libros, tipeos..."
        aria-label="Buscar productos en el campus"
        maxLength={80}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink placeholder:font-medium placeholder:text-ink/40 focus:outline-none"
      />
      {texto !== "" && (
        <button
          type="button"
          onClick={manejarLimpiar}
          aria-label="Limpiar búsqueda"
          className="mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink/60 transition-colors hover:bg-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}
      <button
        type="submit"
        aria-label="Buscar"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-ink/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Search size={17} strokeWidth={2.4} />
      </button>
    </form>
  );
};

const CabeceraEscritorioInterna = ({ location }) => {
  const navigate = useNavigate();
  const { user, perfil, cerrarSesion } = useAuth();
  const {
    sedeActiva = "unp",
    setSedeActiva,
    resetearSedeActiva,
    explorandoOtraSede,
  } = useCampus() || {};

  const mensajesNoLeidos = useChatsNoLeidos(user?.uid);
  const { noLeidas: notifsNoLeidas } = useNotifications(user?.uid);

  const [menuSedeAbierto, setMenuSedeAbierto] = useState(false);
  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);

  const sedeContainerRef = useRef(null);
  const perfilContainerRef = useRef(null);

  const filtrosUrl = leerFiltrosDeUrl(location.search);
  const enHome = location.pathname === "/";

  const explorandoOtra =
    explorandoOtraSede ??
    Boolean(
      perfil?.universidadId &&
        sedeActiva &&
        sedeActiva !== perfil.universidadId
    );

  // Duplica las 2 líneas de color de sede de Home.jsx sin refactorizar Home
  const esUnp = sedeActiva === "unp";
  const colorHeader = obtenerColorUniversidad(sedeActiva);

  const ejecutarResetSede = () => {
    if (typeof resetearSedeActiva === "function") {
      resetearSedeActiva();
    } else if (perfil?.universidadId && typeof setSedeActiva === "function") {
      setSedeActiva(perfil.universidadId);
    }
  };

  // Cerrar menús con clic fuera o tecla Escape
  useEffect(() => {
    if (!menuSedeAbierto && !menuPerfilAbierto) return undefined;

    const manejarClickFuera = (e) => {
      if (
        menuSedeAbierto &&
        sedeContainerRef.current &&
        !sedeContainerRef.current.contains(e.target)
      ) {
        setMenuSedeAbierto(false);
      }
      if (
        menuPerfilAbierto &&
        perfilContainerRef.current &&
        !perfilContainerRef.current.contains(e.target)
      ) {
        setMenuPerfilAbierto(false);
      }
    };

    const manejarKeyDown = (e) => {
      if (e.key === "Escape") {
        setMenuSedeAbierto(false);
        setMenuPerfilAbierto(false);
      }
    };

    document.addEventListener("mousedown", manejarClickFuera);
    document.addEventListener("keydown", manejarKeyDown);
    return () => {
      document.removeEventListener("mousedown", manejarClickFuera);
      document.removeEventListener("keydown", manejarKeyDown);
    };
  }, [menuSedeAbierto, menuPerfilAbierto]);

  const manejarSeleccionSede = (universidadId) => {
    setSedeActiva?.(universidadId);
    setMenuSedeAbierto(false);
    if (location.pathname !== "/") {
      navigate("/");
    }
  };

  const manejarBuscar = (q, catActual) => {
    navigate(construirUrlFiltros({ q, cat: catActual }));
  };

  const manejarCerrarSesion = async () => {
    setMenuPerfilAbierto(false);
    try {
      await cerrarSesion?.();
      navigate("/login");
    } catch {
      // Manejado por AuthContext
    }
  };

  const nombreMostrar =
    perfil?.nombre || user?.displayName || "Estudiante";
  const avatarMostrar = perfil?.avatar || user?.photoURL || "";
  const inicialPerfil = (nombreMostrar.trim()[0] || "E").toUpperCase();
  const siglaSede =
    LISTA_UNIVERSIDADES.find((u) => u.id === sedeActiva)?.id?.toUpperCase() ??
    "SEDE";
  const nombreSedeActiva =
    LISTA_UNIVERSIDADES.find((u) => u.id === sedeActiva)?.nombre ??
    "otra sede";

  return (
    <header className="sticky top-0 z-50 w-full font-sans shadow-soft">
      {/* ── Fila A: Marca + Selector de Sede + Buscador + Acciones ── */}
      <div
        className={`w-full transition-colors duration-200${esUnp ? " bg-primary" : ""}`}
        style={esUnp ? undefined : { backgroundColor: colorHeader }}
      >
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-5 py-3 lg:gap-5 lg:px-6">
          {/* Izquierda: Logo + TuCampus + lema (lg) */}
          <Link
            to="/"
            onClick={() => ejecutarResetSede()}
            className="flex shrink-0 items-center gap-2.5 rounded-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
          >
            <img
              src={MASCOTA_ICONO}
              alt="TuCampus"
              className="h-11 w-11 object-contain"
            />
            <div className="text-left">
              <span className="block text-xl font-extrabold leading-none text-background">
                TuCampus
              </span>
              <span className="mt-0.5 hidden text-[11px] font-medium text-background/75 lg:block">
                Conecta. Comparte. Crece.
              </span>
            </div>
          </Link>

          {/* Selector de sede */}
          <div ref={sedeContainerRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuSedeAbierto((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuSedeAbierto}
              aria-label={`Sede activa: ${siglaSede}. Cambiar sede`}
              className="flex items-center gap-1.5 rounded-chip bg-background/15 px-3 py-2 text-[12px] font-bold text-background backdrop-blur-sm transition-colors hover:bg-background/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
            >
              <MapPin size={14} strokeWidth={2.5} />
              <span>{siglaSede}</span>
              <ChevronDown
                size={13}
                strokeWidth={2.8}
                className={`transition-transform duration-200 ${
                  menuSedeAbierto ? "rotate-180" : ""
                }`}
              />
            </button>

            {menuSedeAbierto && (
              <div
                role="menu"
                aria-label="Seleccionar sede universitaria"
                className="absolute left-0 top-full z-[100] mt-2 flex min-w-[250px] flex-col overflow-hidden rounded-card bg-card py-1 shadow-softLg ring-1 ring-ink/5"
              >
                {LISTA_UNIVERSIDADES.map((u) => {
                  const esActiva = sedeActiva === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      role="menuitem"
                      onClick={() => manejarSeleccionSede(u.id)}
                      className={`flex items-center justify-between px-4 py-3 text-left text-[13px] font-bold transition-colors hover:bg-primary/5 focus-visible:bg-primary/10 focus-visible:outline-none ${
                        esActiva ? "bg-primary/5 text-primary" : "text-ink/70"
                      }`}
                    >
                      <span>📍 {u.nombre}</span>
                      {perfil?.universidadId === u.id && (
                        <span className="ml-2 shrink-0 text-[10px] font-semibold text-primary/70">
                          Tu sede
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Buscador central (se remonta cuando cambia el parámetro q en la URL) */}
          <BuscadorCabecera
            key={filtrosUrl.q}
            qInicial={filtrosUrl.q}
            catActual={filtrosUrl.cat}
            onBuscar={manejarBuscar}
          />

          {/* Derecha: Navegación principal */}
          <nav
            aria-label="Navegación principal"
            className="flex shrink-0 items-center gap-1.5 lg:gap-2"
          >
            {/* Favoritos */}
            <button
              type="button"
              onClick={() => navigate("/?tab=favoritos")}
              aria-label="Favoritos"
              className={`flex items-center gap-1.5 rounded-btn px-2.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background ${
                enHome && filtrosUrl.tab === "favoritos"
                  ? "bg-background/20 text-background"
                  : "text-background/90 hover:bg-background/15"
              }`}
            >
              <Heart
                size={19}
                strokeWidth={2.2}
                fill={
                  enHome && filtrosUrl.tab === "favoritos"
                    ? "currentColor"
                    : "none"
                }
              />
              <span className="hidden lg:inline">Favoritos</span>
            </button>

            {/* Mensajes */}
            <button
              type="button"
              onClick={() => navigate("/chat")}
              aria-label={
                mensajesNoLeidos > 0
                  ? `Mensajes, ${mensajesNoLeidos} sin leer`
                  : "Mensajes"
              }
              className={`flex items-center gap-1.5 rounded-btn px-2.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background ${
                location.pathname.startsWith("/chat")
                  ? "bg-background/20 text-background"
                  : "text-background/90 hover:bg-background/15"
              }`}
            >
              <span className="relative flex items-center justify-center">
                <MessageCircle size={19} strokeWidth={2.2} />
                <BadgeContador cantidad={mensajesNoLeidos} />
              </span>
              <span className="hidden lg:inline">Mensajes</span>
            </button>

            {/* Notificaciones */}
            <button
              type="button"
              onClick={() => navigate("/notificaciones")}
              aria-label={
                notifsNoLeidas > 0
                  ? `Notificaciones, ${notifsNoLeidas} sin leer`
                  : "Notificaciones"
              }
              className={`flex items-center gap-1.5 rounded-btn px-2.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background ${
                location.pathname.startsWith("/notificaciones")
                  ? "bg-background/20 text-background"
                  : "text-background/90 hover:bg-background/15"
              }`}
            >
              <span className="relative flex items-center justify-center">
                <Bell size={19} strokeWidth={2.2} />
                <BadgeContador cantidad={notifsNoLeidas} />
              </span>
              <span className="hidden lg:inline">Notificaciones</span>
            </button>

            {/* Botón Publicar */}
            <button
              type="button"
              onClick={() => navigate("/publicar")}
              aria-label="Publicar"
              style={{ backgroundColor: "var(--naranja-marca)" }}
              className="flex items-center gap-1.5 rounded-btn px-3 py-2 text-[13px] font-extrabold text-white shadow-soft transition-transform hover:brightness-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background lg:px-4"
            >
              <Plus size={18} strokeWidth={2.8} />
              <span className="hidden lg:inline">Publicar</span>
            </button>

            {/* Menú de Perfil (con sesión) o Ingresar (sin sesión) */}
            {user ? (
              <div ref={perfilContainerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuPerfilAbierto((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuPerfilAbierto}
                  aria-label="Menú de perfil"
                  className="flex items-center gap-2 rounded-btn bg-background/15 px-2.5 py-1.5 text-[13px] font-bold text-background transition-colors hover:bg-background/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card text-xs font-extrabold text-primary">
                    {avatarMostrar.trim() ? (
                      <img
                        src={avatarMostrar}
                        alt={nombreMostrar}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      inicialPerfil
                    )}
                  </span>
                  <span className="hidden max-w-[110px] truncate lg:inline">
                    {nombreMostrar.split(" ")[0]}
                  </span>
                  <ChevronDown
                    size={13}
                    strokeWidth={2.6}
                    className={`transition-transform duration-200 ${
                      menuPerfilAbierto ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {menuPerfilAbierto && (
                  <div
                    role="menu"
                    aria-label="Opciones de cuenta"
                    className="absolute right-0 top-full z-[100] mt-2 flex min-w-[200px] flex-col overflow-hidden rounded-card bg-card py-1.5 shadow-softLg ring-1 ring-ink/5"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuPerfilAbierto(false);
                        navigate("/perfil");
                      }}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-bold text-ink/80 transition-colors hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/10 focus-visible:outline-none"
                    >
                      <User size={16} strokeWidth={2.2} />
                      <span>Mi perfil</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuPerfilAbierto(false);
                        navigate("/terminos");
                      }}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-bold text-ink/80 transition-colors hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/10 focus-visible:outline-none"
                    >
                      <FileText size={16} strokeWidth={2.2} />
                      <span>Términos</span>
                    </button>
                    <div className="my-1 border-t border-ink/10" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={manejarCerrarSesion}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-bold text-red-600 transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
                    >
                      <LogOut size={16} strokeWidth={2.2} />
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/login")}
                aria-label="Ingresar"
                className="flex items-center gap-1.5 rounded-btn bg-card px-3 py-2 text-[13px] font-extrabold text-primary shadow-soft transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
              >
                <LogIn size={17} strokeWidth={2.4} />
                <span className="hidden lg:inline">Ingresar</span>
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* ── Fila B: Categorías (solo en lg) ── */}
      <div className="hidden border-b border-ink/10 bg-card lg:block">
        <div className="mx-auto flex max-w-[1280px] items-center gap-2 overflow-x-auto px-6">
          {CATEGORIAS.map(({ key, label }) => {
            const activa =
              enHome &&
              filtrosUrl.tab === "inicio" &&
              filtrosUrl.cat === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => navigate(construirUrlFiltros({ cat: key }))}
                className={`relative shrink-0 border-b-2 px-3.5 py-2.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  activa
                    ? "border-[var(--color-accent,#0639B8)] text-[var(--color-accent,#0639B8)]"
                    : "border-transparent text-ink/65 hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fila C: Banner fino si se está explorando otra sede ── */}
      {explorandoOtra && (
        <div className="border-b border-ink/10 bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-[1280px] items-center justify-center gap-2 px-5 py-1.5 text-[12px] font-semibold text-ink/80 lg:px-6">
            <span>Estás explorando {nombreSedeActiva}</span>
            <button
              type="button"
              onClick={ejecutarResetSede}
              className="font-extrabold text-[var(--color-accent,#0639B8)] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Volver a mi campus
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

const CabeceraEscritorio = () => {
  const esAncho = useEsAncho();
  const location = useLocation();

  if (!esAncho || location.pathname === "/login") {
    return null;
  }

  return <CabeceraEscritorioInterna location={location} />;
};

export default CabeceraEscritorio;
