// src/pages/Notificaciones.jsx
// ============================================================
//  TuCampus — Notificaciones (página independiente)
//
//  ANTES: vivía como un tab dentro de Home.jsx (?tab=notifs),
//  accesible solo desde el ícono de campana en BottomNav.
//
//  AHORA: página propia en /notificaciones, con su propio header
//  (back button + "Limpiar"), a la que se llega desde el botón
//  flotante <BotonNotificaciones /> montado en las vistas principales.
//  La lógica de datos (useNotifications: onSnapshot, marcarLeida,
//  limpiarTodas) no cambió — solo se migró el markup a Tailwind
//  siguiendo el Design System (Fase visual) y se agregó un filtro
//  de chips 100% client-side sobre `notificaciones`.
// ============================================================

import { useState }                 from "react";
import { useNavigate }              from "react-router-dom";
import {
  ChevronLeft, Trash2, Bell, MessageCircle, Heart, Megaphone, User, Star,
} from "lucide-react";
import { useAuth }                  from "../context/AuthContext";
import { useNotifications }         from "../hooks/useNotifications";
import { useToast, ToastContainer } from "../components/Toast";
import BottomNav                    from "../components/BottomNav";

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

// ── Filtros de la barra de chips (100% visual/cliente — no cambian
//    la consulta de Firestore, solo qué se muestra de `notificaciones`) ──
const FILTROS = [
  { id: "todas",          label: "Todas" },
  { id: "mensajes",       label: "Mensajes" },
  { id: "interacciones",  label: "Interacciones" },
  { id: "publicaciones",  label: "Publicaciones" },
];

const coincideFiltro = (tipo, filtro) => {
  if (filtro === "todas") return true;
  if (filtro === "mensajes")      return tipo === "contacto";
  if (filtro === "interacciones") {
    return tipo === "favorito" || tipo === "seguidor" || tipo === "resena" || tipo === "calificacion";
  }
  if (filtro === "publicaciones") return tipo === "nuevo_producto";
  return true;
};

// ── Config visual por tipo de notificación (ícono + colores del círculo) ──
const configPorTipo = (tipo) => {
  if (tipo === "favorito") {
    return { Icono: Heart, bg: "bg-red-100", color: "text-red-500" };
  }
  if (tipo === "seguidor") {
    return { Icono: User, bg: "bg-blue-100", color: "text-[#102C4D]" };
  }
  if (tipo === "nuevo_producto") {
    return { Icono: Megaphone, bg: "bg-purple-100", color: "text-purple-600" };
  }
  if (tipo === "resena" || tipo === "calificacion") {
    return { Icono: Star, bg: "bg-amber-100", color: "text-amber-500" };
  }
  // "contacto" (intención de compra/chat) y cualquier otro caso por defecto
  return { Icono: MessageCircle, bg: "bg-[#DCF3E3]", color: "text-[#287653]" };
};

const Notificaciones = () => {
  const navigate = useNavigate();
  const { user }  = useAuth();

  const [toasts, setToasts] = useState([]);
  const mostrarToast        = useToast(setToasts);

  const [filtroActivo, setFiltroActivo] = useState("todas");

  const { notificaciones, marcarLeida, limpiarTodas } = useNotifications(user?.uid);

  const notificacionesFiltradas = notificaciones.filter((n) => coincideFiltro(n.tipo, filtroActivo));

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
      } else if (notif.tipo === "resena" || notif.tipo === "calificacion") {
        // Va al perfil propio (donde vive la calificación recibida),
        // no al perfil de quien calificó.
        navigate(`/vendedor?uid=${notif.referenciaId || notif.paraUid}`);
      } else {
        navigate(`/vendedor?uid=${notif.deUid}`);
      }
    }
  };

  return (
    <div className="app-shell bg-background pb-28 font-sans">

      {/* ════════════════════════════════════════════════════
             HEADER — back button + título + Limpiar
        ════════════════════════════════════════════════════ */}
      <div className="px-5 pt-6">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-soft"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="mt-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight text-ink">Notificaciones</h1>
            <p className="mt-1 text-[13.5px] font-semibold text-ink/40">
              Mantente al día con tu actividad
            </p>
          </div>

          {notificaciones.length > 0 && (
            <button
              onClick={handleLimpiarNotificaciones}
              className="flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-[#287653] bg-card px-4 py-2.5 text-[13px] font-bold text-[#287653]"
            >
              <Trash2 size={15} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
             FILTROS — chips con scroll horizontal
        ════════════════════════════════════════════════════ */}
      <div
        className="mt-5 flex gap-2.5 overflow-x-auto px-5 pb-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {FILTROS.map((f) => {
          const activo = filtroActivo === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFiltroActivo(f.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors ${
                activo
                  ? "bg-[#287653] text-white"
                  : "border-[1.5px] border-ink/10 bg-card text-ink/70"
              }`}
            >
              {f.id === "todas" && <Bell size={14} className={activo ? "text-white" : "text-ink/40"} />}
              {f.label}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════
             CONTENIDO — tarjetas de notificación
        ════════════════════════════════════════════════════ */}
      <section className="mt-4 px-5">
        {notificacionesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-[2.6rem]">🔔</span>
            <p className="m-0 text-[15px] font-extrabold text-ink">Todo al día</p>
            <p className="m-0 max-w-[240px] text-[13px] font-semibold text-ink/45">
              {notificaciones.length === 0
                ? "Aquí verás cuando alguien interactúe con tus productos."
                : "No hay notificaciones en esta categoría."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notificacionesFiltradas.map((notif) => {
              const esFav       = notif.tipo === "favorito";
              const esSeguidor  = notif.tipo === "seguidor";
              const esNuevoProd = notif.tipo === "nuevo_producto";
              const esResena    = notif.tipo === "resena" || notif.tipo === "calificacion";

              let textoAccion     = "quiere comprar";
              let mostrarProducto = true;
              if (esFav)            { textoAccion = "guardó"; }
              else if (esSeguidor)  { textoAccion = "empezó a seguirte"; mostrarProducto = false; }
              else if (esNuevoProd) { textoAccion = "publicó un nuevo producto:"; }

              const { Icono, bg, color } = configPorTipo(notif.tipo);

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`flex cursor-pointer items-center gap-3.5 rounded-[24px] bg-card p-4 shadow-soft transition-opacity ${
                    notif.leido ? "opacity-70" : ""
                  }`}
                >
                  {esResena ? (
                    // Avatar de quien calificó + badge flotante de estrella dorada.
                    // Si no hay deAvatar (reseñas antiguas o autor sin foto), cae
                    // al mismo círculo de ícono que el resto de notificaciones.
                    <span className="relative h-12 w-12 shrink-0">
                      {notif.deAvatar ? (
                        <img
                          src={notif.deAvatar}
                          alt={notif.deNombre}
                          loading="lazy"
                          decoding="async"
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-500">
                          <User size={20} />
                        </span>
                      )}
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-soft ring-2 ring-card">
                        <Star size={11} fill="currentColor" />
                      </span>
                    </span>
                  ) : (
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${bg} ${color}`}>
                      <Icono size={20} />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold leading-snug text-ink/80">
                      <span className="font-extrabold text-ink">{notif.deNombre}</span>{" "}
                      {esResena
                        ? (notif.mensaje || `te calificó con ${notif.estrellas ?? ""} ⭐`)
                        : (
                          <>
                            {textoAccion}{" "}
                            {mostrarProducto && (
                              <span className="font-extrabold text-ink">"{notif.productoTitulo}"</span>
                            )}
                          </>
                        )}
                    </p>
                    <span className="mt-1 block text-[12px] font-semibold text-ink/40">
                      {formatearTiempo(notif.timestamp)}
                    </span>
                  </div>

                  {!notif.leido && (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10.5px] font-extrabold text-primary">
                        NUEVA
                      </span>
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* BOTTOM NAVIGATION (sin tab activo: Notificaciones ya no es un tab) */}
      <BottomNav />

      <ToastContainer toasts={toasts} />
    </div>
  );
};

export default Notificaciones;