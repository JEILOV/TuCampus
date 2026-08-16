// src/components/BottomNav.jsx
// ============================================================
//  TuCampus — Barra de navegación inferior (compartida)
//
//  REEMPLAZA 5 copias casi idénticas del mismo <nav className="bottom-nav">
//  encontradas en Home.jsx, Vendedor.jsx, Publicar.jsx, Perfil.jsx y
//  EditarProducto.jsx. Perfil.jsx además tenía su propio onSnapshot de
//  "notificaciones" corriendo EN PARALELO al de useNotifications, solo
//  para pintar el badge acá — ese listener duplicado se elimina al
//  centralizar el nav en un solo componente.
//
//  USO:
//    <BottomNav activo="inicio" />    // resalta "Inicio"
//    <BottomNav activo="perfil" />    // resalta "Perfil"
//    <BottomNav />                    // ninguna pestaña resaltada
//
//  En Home.jsx, "activo" es dinámico (depende de ?tab=), en el resto
//  de las páginas es un string fijo.
//
//  🔧 El tab "Notificaciones" se quitó de acá y ahora vive como botón
//  flotante independiente — ver src/components/BotonNotificaciones.jsx.
//  Quedan 5 accesos: Inicio, Favoritos, Publicar, Mensajes y Perfil.
//
//  DISEÑO (Fase 2 — migrado a Tailwind):
//    - Solo cambió la capa visual: ahora es una barra flotante
//      redondeada con el botón "Publicar" sobresaliendo en círculo
//      azul. La lógica de rutas, badges y "activo" es la misma.
// ============================================================

import { useNavigate }      from "react-router-dom";
import { useAuth }          from "../context/AuthContext";
import { useCampus }        from "../context/CampusContext";
import { useChatsNoLeidos } from "../hooks/useChatsNoLeidos";

// ── Badge numérico reutilizable (notifs y mensajes usan el mismo estilo) ──
const Badge = ({ cantidad }) => {
  if (!cantidad) return null;
  return (
    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-card bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white">
      {cantidad > 9 ? "9+" : cantidad}
    </span>
  );
};

// ── Item de navegación estándar (Inicio, Favoritos, Mensajes, Perfil) ──
// 🏫 Multicampus: `text-[var(--color-accent)]` en vez de `text-primary`
// para que el ícono/texto activo siga el color de la sede activa (ver
// CampusContext.jsx). Es una variable CSS global en <html>, así que no
// hace falta pasar el color por props ni consumir el contexto acá.
//
// 🛡️ Blindado: admite `to` (ruta a la que navegar) y/o `onClick`
// (efecto adicional antes de navegar, p. ej. resetearSedeActiva) de
// forma independiente. Ninguno de los dos es obligatorio, y si algo
// externo pasa un valor que no es función, lo ignoramos en vez de
// reventar el click — así un consumidor futuro de NavItem no puede
// tumbar toda la barra de navegación con un prop mal armado.
const NavItem = ({ activo, to, onClick, label, children }) => {
  const navigate = useNavigate();

  const manejarClick = () => {
    if (typeof onClick === "function") {
      onClick();
    }
    if (typeof to === "string" && to.length > 0) {
      navigate(to);
    }
  };

  return (
    <button
      onClick={manejarClick}
      aria-label={label}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1 transition-all duration-200 ease-out active:scale-90 ${
        activo ? "text-[var(--color-accent)]" : "text-ink/40"
      }`}
    >
      <span className="relative flex h-6 w-6 items-center justify-center">{children}</span>
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
};

const BottomNav = ({ activo = null }) => {
  const navigate = useNavigate();
  const { user }  = useAuth();

  // 🏫 Multicampus: "Inicio" es también la salida rápida de la
  // exploración de otra sede — ver CampusContext.jsx.
  // 🛡️ Desestructurado con fallback: si por lo que sea el contexto
  // todavía no expone la función (HMR, orden de montaje, un futuro
  // refactor del provider), `resetearSedeActiva` cae en `undefined`
  // en vez de tirar el render entero de BottomNav.
  const { resetearSedeActiva } = useCampus() || {};

  // Mismo hook que ya usa el resto de la app — cero listeners nuevos
  // más allá de los que ya existían, solo centralizado acá.
  const mensajesNoLeidos = useChatsNoLeidos(user?.uid);

  // 🏫 Multicampus: al volver a "Inicio" desde CUALQUIER página,
  // descartamos la sede que se estuviera explorando y regresamos al
  // campus propio del usuario (perfil.universidadId) — así el usuario
  // no queda "atrapado" viendo los colores/productos de otra sede
  // después de irse a Perfil, Chat, etc. y volver.
  //
  // 🛡️ Llamada defensiva: si `resetearSedeActiva` no es una función
  // (contexto ausente o versión vieja de CampusProvider), simplemente
  // la omitimos — la navegación a "/" nunca debe bloquearse por esto.
  const irAInicio = () => {
    if (typeof resetearSedeActiva === "function") {
      resetearSedeActiva();
    }
    navigate("/");
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-32px)] max-w-[420px] items-end justify-between rounded-btn bg-card px-3 pb-2 pt-2 shadow-softLg"
      aria-label="Navegación principal"
    >
      <NavItem activo={activo === "inicio"} onClick={irAInicio} label="Inicio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-full w-full">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </NavItem>

      <NavItem activo={activo === "favoritos"} onClick={() => navigate("/?tab=favoritos")} label="Favoritos">
        <svg viewBox="0 0 24 24" fill={activo === "favoritos" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" className="h-full w-full">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </NavItem>

      {/* Publicar — círculo destacado que sobresale de la barra */}
      <button
        onClick={() => navigate("/publicar")}
        aria-label="Publicar"
        className="flex flex-1 flex-col items-center gap-0.5"
      >
        {/* 🏫 Multicampus: bg-[var(--color-accent)] en vez de bg-primary.
            El scale táctil vive solo en el círculo (no en el <button>
            completo) para que no se compongan dos transforms distintos
            y el "hundido" al tocar se sienta natural, no exagerado. */}
        <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-softLg transition-transform duration-200 ease-out active:scale-90">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <span className="text-[10px] font-semibold text-ink/40">Publicar</span>
      </button>

      <NavItem activo={activo === "mensajes"} onClick={() => navigate("/chat")} label="Mensajes">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-full w-full">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <Badge cantidad={mensajesNoLeidos} />
      </NavItem>

      <NavItem activo={activo === "perfil"} onClick={() => navigate("/perfil")} label="Perfil">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-full w-full">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </NavItem>
    </nav>
  );
};

export default BottomNav;