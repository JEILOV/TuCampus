// src/pages/Chat.jsx
// ============================================================
//  TuCampus — Chat Nativo (Fase 2)
//
//  UNA SOLA PÁGINA, DOS MODOS, mismo patrón de query param que
//  ya usa el resto de la app (/producto?id=, /vendedor?uid=):
//
//    /chat            → modo LISTA   (todas mis conversaciones)
//    /chat?id=chatId  → modo CHARLA  (conversación individual)
//
//  Se resuelve así a propósito: en mobile solo se ve una cosa a
//  la vez (nunca hace falta un layout de dos columnas), y en la
//  Fase 4 (Responsive Desktop) alcanza con un breakpoint que
//  muestre lista + charla lado a lado sin tocar la lógica de acá.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams }              from "react-router-dom";
import { doc, getDoc, onSnapshot }                   from "firebase/firestore";
import { Search, CornerUpLeft, X, Check }            from "lucide-react";
import { db }                                        from "../services/firebase";
import { useAuth }                                   from "../context/AuthContext";
import {
  suscribirMisChats,
  suscribirMensajes,
  enviarMensaje,
  editarMensaje,
  marcarComoLeido,
  marcarMensajesComoLeidos,
  ocultarChat,
}                                       from "../services/chatService";
import {
  obtenerPerfilVendedor,
  bloquearUsuario,
  desbloquearUsuario,
}                                       from "../services/userService";
import { notificarNuevoMensaje }       from "../services/notificationService";
import { comprimirImagen, subirImagenImgBB } from "../utils/imageUtils";
import { ToastContainer, useToast }    from "../components/Toast";
import Spinner                         from "../components/Spinner";
import BottomNav                       from "../components/BottomNav";
import BotonNotificaciones             from "../components/BotonNotificaciones";
import MenuChat, { MenuMensaje }       from "../components/MenuChat";

// Placeholder — reemplazar por los archivos finales de la mascota
// (mismo ícono que usan Home.jsx/Publicar.jsx en su header azul).
const MASCOTA_ICONO   = "/assets/mascota-icono-placeholder.png";
const MASCOTA_AL_DIA  = "/assets/mascota-al-dia-placeholder.png";

// ── Helpers ───────────────────────────────────────────────────
// Hora dentro de una burbuja de mensaje (SIEMPRE hora, nunca fecha cruda:
// para eso está formatearFechaChat, que es el de la tarjeta de la lista).
// Parsea tanto un Timestamp de Firestore (con .toDate()) como un Date
// nativo o un string/number — antes solo aceptaba Timestamp y, si el
// campo llegaba como otra cosa (o pendiente de servidor), se colaba el
// valor crudo sin formatear.
const formatearHora = (fecha) => {
  if (!fecha) return ""; // ej. serverTimestamp() que aún no confirma el servidor
  const d = typeof fecha?.toDate === "function" ? fecha.toDate() : new Date(fecha);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true });
};

const inicial = (nombre) => (nombre || "?").trim()[0]?.toUpperCase() || "?";

// Formatea un precio en soles con el mismo criterio que Producto.jsx
// ("S/ 12.00"). Devuelve null si no es un número válido, para que el
// caller decida si oculta el precio en vez de mostrar "S/ NaN".
const formatearPrecio = (precio) =>
  typeof precio === "number" && !Number.isNaN(precio) ? `S/ ${precio.toFixed(2)}` : null;

// Fase 8 · Contexto dinámico: arma el producto de referencia ACTIVO de
// un chat, priorizando el campo nuevo `productoReferencia` y cayendo a
// los campos legacy (productoId/productoTitulo/productoImagen) para
// conversaciones creadas antes de esta fase — así nunca se rompe una
// charla vieja que todavía no tiene el objeto nuevo.
const obtenerProductoRef = (chat) => {
  if (!chat) return null;
  if (chat.productoReferencia) return chat.productoReferencia;
  if (!chat.productoId) return null;
  return {
    id: chat.productoId,
    titulo: chat.productoTitulo || "",
    imagenUrl: chat.productoImagen || "",
    precio: null,
  };
};

// Formato de fecha para las tarjetas de la lista de chats (distinto del
// formatearHora de arriba, que es para las burbujas dentro de una charla
// abierta y solo necesita la hora). Acepta Timestamp de Firestore
// (objeto con .toDate()), Date nativo, o string/number parseable por
// `new Date(...)`.
//   • Hoy            → hora, ej. "02:30 p. m."
//   • Ayer            → "Ayer"
//   • Días anteriores → día y mes abreviado, ej. "08 ago."
//     (si además es de otro año, agrega el año: "08 ago. 2025")
const formatearFechaChat = (fecha) => {
  if (!fecha) return "";

  const d = typeof fecha?.toDate === "function" ? fecha.toDate() : new Date(fecha);
  if (isNaN(d.getTime())) return ""; // fecha inválida/no parseable → no reventar el render

  const ahora = new Date();

  if (d.toDateString() === ahora.toDateString()) {
    return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) {
    return "Ayer";
  }

  const dia    = String(d.getDate()).padStart(2, "0");
  const mes    = d.toLocaleDateString("es-PE", { month: "short" }).replace(".", "").toLowerCase();
  const esOtroAño = d.getFullYear() !== ahora.getFullYear();
  return `${dia} ${mes}.${esOtroAño ? ` ${d.getFullYear()}` : ""}`;
};

// ── Sub-componente: Avatar ───────────────────────────────────
// Valida que `avatar` sea un string no vacío ANTES de intentar el <img>,
// y si igual falla al cargar (link roto, 404, etc.) el onError lo oculta
// y cae al fallback de iniciales — nunca se ven ambos encimados.
const Avatar = ({ nombre, avatar, size = 46 }) => {
  const avatarValido = typeof avatar === "string" && avatar.trim().length > 0;
  const [imgFallo, setImgFallo] = useState(false);

  // Si cambia la URL del avatar (ej. el otro usuario actualizó su foto
  // mientras la lista de chats está abierta con onSnapshot), reintenta
  // con la nueva URL en vez de quedarse pegado en el estado de error.
  useEffect(() => { setImgFallo(false); }, [avatar]);

  const mostrarImg = avatarValido && !imgFallo;

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "linear-gradient(135deg,#c8a97a,#a07850)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 700, color: "white",
      overflow: "hidden", flexShrink: 0,
    }}>
      {mostrarImg
        ? (
          <img
            src={avatar}
            alt={nombre}
            loading="lazy"
            decoding="async"
            onError={() => setImgFallo(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )
        : inicial(nombre)}
    </div>
  );
};

// ── Íconos (mismo estilo/stroke que el resto de la app) ──────
const IconoVolver = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconoEnviar = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
    stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const IconoClip = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
  </svg>
);

const IconoMenu = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <circle cx="12" cy="5" r="1.8"/>
    <circle cx="12" cy="12" r="1.8"/>
    <circle cx="12" cy="19" r="1.8"/>
  </svg>
);

// ── Sub-vista: lista de conversaciones ───────────────────────
const ListaChats = ({ chats, cargando, miUid, onAbrir }) => {
  if (cargando) return <Spinner mensaje="Cargando tus chats..." fullScreen={false} />;

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="text-[2.6rem]">💬</span>
        <p className="m-0 font-bold text-ink">Todavía no tenés conversaciones</p>
        <p className="m-0 text-[13.5px] font-semibold text-ink/50">
          Escribile a un vendedor desde la página de un producto para empezar a chatear.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {chats.map((chat) => {
        const otroUid     = chat.participantes?.find((u) => u !== miUid);
        const otroInfo    = chat.participantesInfo?.[otroUid] || {};
        const noLeidos    = chat.noLeidoPor?.[miUid] || 0;
        const soyYoUltimo = chat.ultimoMensajeDeUid === miUid;

        return (
          <button
            key={chat.id}
            onClick={() => onAbrir(chat.id)}
            className="flex w-full items-center gap-3 border-b border-background bg-card px-5 py-3.5 text-left last:border-b-0"
          >
            <div className="relative shrink-0">
              <Avatar nombre={otroInfo.nombre} avatar={otroInfo.avatar} />
              {/* 🎨 Indicador decorativo de estado — placeholder visual hasta que
                  exista un campo real de presencia/online en el modelo de datos. */}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-ink/25" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-[15px] font-bold text-ink">
                  {otroInfo.nombre || "Estudiante UNP"}
                </h3>
                <span className="shrink-0 text-[11.5px] font-semibold text-ink/40">
                  {formatearFechaChat(chat.ultimoMensajeFecha)}
                </span>
              </div>

              {obtenerProductoRef(chat)?.titulo && (
                <p className="mb-0.5 mt-px truncate text-[11.5px] font-bold text-[#287653]">
                  Sobre: {obtenerProductoRef(chat).titulo}
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className={`min-w-0 flex-1 truncate text-[13.5px] ${
                  noLeidos > 0 ? "font-bold text-ink" : "font-semibold text-ink/50"
                }`}>
                  {chat.ultimoMensaje
                    ? `${soyYoUltimo ? "Tú: " : ""}${chat.ultimoMensaje}`
                    : "Empieza la conversación"}
                </p>
                {noLeidos > 0 && (
                  <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-extrabold text-white">
                    {noLeidos > 9 ? "9+" : noLeidos}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {/* Footer decorativo: cierre amistoso de la lista (mockup) */}
      <div className="flex flex-col items-center gap-1 px-6 py-6 text-center">
        <img src={MASCOTA_AL_DIA} alt="" className="h-14 w-14 object-contain opacity-90" />
        <p className="m-0 text-[13px] font-extrabold text-ink">¡Estás al día!</p>
        <p className="m-0 text-[11.5px] font-semibold text-ink/40">No tienes mensajes nuevos</p>
      </div>
    </div>
  );
};

// ── Sub-vista: burbuja de mensaje ────────────────────────────
// 🔧 Fase 7 — Responder mensaje (estilo WhatsApp):
//   `onResponder` es opcional a propósito (mismo patrón que el resto del
//   archivo, que nunca rompe si falta un callback) — si el padre no lo
//   pasa, el botón de citar simplemente no se muestra.
//
// 🔧 Fase 8 — Gestos táctiles + menú contextual:
//   `onMenuContextual(mensaje, {x,y})` se dispara con mantener presionado
//   (long-press táctil, ~480ms) o click derecho, y abre <MenuMensaje/>
//   desde Chat.jsx en las coordenadas exactas del gesto.
//   Deslizar la burbuja hacia la derecha ("swipe to reply") dispara
//   `onResponder` igual que el botón de citar — mismo umbral que usa
//   WhatsApp (~45-50px) para no confundirse con un scroll vertical.
//   Ambos gestos viven SOLO en el div de la burbuja (no en el botón de
//   responder ni en el resto de la fila) para no interferir con el
//   click normal de ese botón.
const UMBRAL_SWIPE_RESPONDER = 46;
const MAX_ARRASTRE_SWIPE     = 72;
const DURACION_LONG_PRESS_MS = 480;

// 🆕 Doble check estilo WhatsApp — solo se renderiza en mensajes propios
// (esMio). Un solo trazo (color heredado, `currentColor`) cuando
// `leido` es false o undefined (mensajes de antes de esta migración
// también caen acá, y es el comportamiento correcto: no se puede
// afirmar que se leyeron). Doble trazo azul cuando `leido === true`.
const ChecksLeido = ({ leido }) => (
  <svg
    width="14" height="10" viewBox="0 0 16 11" fill="none"
    style={{ flexShrink: 0 }}
    aria-label={leido ? "Leído" : "Enviado"}
  >
    <path
      d="M1 5.5L4.5 9L10.5 1.5"
      stroke={leido ? "#34B7F1" : "currentColor"}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    />
    {leido && (
      <path
        d="M5.5 5.5L9 9L15 1.5"
        stroke="#34B7F1"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    )}
  </svg>
);

const Burbuja = ({ mensaje, esMio, onResponder, onMenuContextual }) => {
  const esImagen = mensaje.tipo === "imagen" && mensaje.imagen;
  const cita     = mensaje.respondiendoA;

  const [dragX, setDragX]   = useState(0);
  const gestoRef            = useRef(null);   // { startX, startY, dragging }
  const longPressTimerRef   = useRef(null);

  const obtenerPunto = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  };

  const cancelarLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const iniciarGesto = (e) => {
    const p = obtenerPunto(e);
    gestoRef.current = { startX: p.x, startY: p.y, dragging: false };
    if (onMenuContextual) {
      longPressTimerRef.current = setTimeout(() => {
        gestoRef.current = null;
        setDragX(0);
        onMenuContextual(mensaje, p);
      }, DURACION_LONG_PRESS_MS);
    }
  };

  const moverGesto = (e) => {
    if (!gestoRef.current) return;
    const p  = obtenerPunto(e);
    const dx = p.x - gestoRef.current.startX;
    const dy = p.y - gestoRef.current.startY;

    if (!gestoRef.current.dragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      gestoRef.current.dragging = true;
      cancelarLongPress(); // moverse cancela el long-press (ya no es "mantener presionado quieto")
    }

    // Solo se arrastra visualmente si el gesto es mayormente horizontal
    // y hacia la derecha — evita "robar" el scroll vertical de la lista.
    if (gestoRef.current.dragging && onResponder && dx > 0 && Math.abs(dx) > Math.abs(dy)) {
      setDragX(Math.min(dx, MAX_ARRASTRE_SWIPE));
    }
  };

  const soltarGesto = () => {
    cancelarLongPress();
    if (dragX >= UMBRAL_SWIPE_RESPONDER && onResponder) {
      onResponder(mensaje);
      if (navigator.vibrate) navigator.vibrate(12); // feedback háptico sutil, no crítico si no existe
    }
    setDragX(0);
    gestoRef.current = null;
  };

  const handleContextMenu = (e) => {
    if (!onMenuContextual) return;
    e.preventDefault();
    cancelarLongPress();
    onMenuContextual(mensaje, obtenerPunto(e));
  };

  // Botón de "responder": siempre visible (no depende de :hover) porque
  // esta es una app mobile-first — un botón que solo aparece con hover
  // sería inalcanzable en touch. Se apaga la opacidad para que no compita
  // visualmente con el texto del mensaje.
  const botonResponder = onResponder && (
    <button
      type="button"
      onClick={() => onResponder(mensaje)}
      aria-label="Responder a este mensaje"
      style={{
        width: "28px", height: "28px", flexShrink: 0, alignSelf: "center",
        background: "rgba(0,0,0,0.06)", border: "none", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#8890a5", cursor: "pointer", opacity: 0.7,
      }}
    >
      <CornerUpLeft size={14} strokeWidth={2.4} />
    </button>
  );

  // 🔧 FIX: acá vivía el bug que invertía los lados. `flexDirection:
  // "row-reverse"` invierte también a qué lado apunta `justifyContent:
  // "flex-end"` (con row-reverse, "flex-end" pasa a significar IZQUIERDA,
  // no derecha) — por eso los mensajes míos terminaban pegados al mismo
  // lado que los del otro usuario. La solución correcta es NO tocar
  // flexDirection (se queda siempre en "row", igual que antes de este
  // botón) y en cambio usar `order` en los dos hijos para ubicar el botón
  // a un lado u otro — así justifyContent sigue significando lo mismo
  // que siempre significó en este archivo.
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", gap: "4px",
      justifyContent: esMio ? "flex-end" : "flex-start",
      padding: "3px 16px", position: "relative",
    }}>
      {/* Ícono de "responder" que se revela detrás de la burbuja mientras
          se desliza — mismo lenguaje visual que WhatsApp/Telegram. */}
      {dragX > 0 && (
        <div style={{
          position: "absolute", left: esMio ? undefined : "16px", right: esMio ? "16px" : undefined,
          top: "50%", transform: "translateY(-50%)",
          opacity: Math.min(dragX / UMBRAL_SWIPE_RESPONDER, 1),
          color: "var(--verde-marca)", pointerEvents: "none",
        }}>
          <CornerUpLeft size={18} strokeWidth={2.6} />
        </div>
      )}

      <div
        onTouchStart={iniciarGesto}
        onTouchMove={moverGesto}
        onTouchEnd={soltarGesto}
        onMouseDown={iniciarGesto}
        onMouseMove={moverGesto}
        onMouseUp={soltarGesto}
        onMouseLeave={soltarGesto}
        onContextMenu={handleContextMenu}
        style={{
          order: esMio ? 2 : 1,
          maxWidth: esImagen ? "70%" : "75%",
          background: esImagen ? "transparent" : (esMio ? "var(--verde-marca)" : "white"),
          color: esMio ? "white" : "var(--azul-oscuro)",
          padding: esImagen ? "0" : "10px 14px",
          borderRadius: esMio ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          boxShadow: esImagen ? "none" : (esMio ? "none" : "0 2px 8px rgba(0,0,0,0.06)"),
          fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.4,
          wordBreak: "break-word", whiteSpace: "pre-wrap",
          overflow: "hidden",
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 ? "transform 0.18s ease" : "none",
          touchAction: onResponder ? "pan-y" : "auto",
          userSelect: "none", WebkitUserSelect: "none",
          cursor: onMenuContextual ? "pointer" : "default",
        }}
      >
        {/* Mensaje citado (si este mensaje es una respuesta a otro) */}
        {cita && (
          <div style={{
            display: "flex", gap: "8px", alignItems: "stretch",
            background: esImagen ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.1)",
            borderRadius: "8px", padding: "6px 8px",
            marginBottom: esImagen ? "6px" : "8px",
            overflow: "hidden",
          }}>
            <div style={{
              width: "3px", flexShrink: 0, borderRadius: "3px",
              background: esMio ? "rgba(255,255,255,0.85)" : "var(--verde-marca)",
            }} />
            <div style={{ minWidth: 0 }}>
              <p style={{
                margin: 0, fontSize: "0.72rem", fontWeight: 800,
                color: esMio ? "rgba(255,255,255,0.9)" : "var(--verde-marca)",
              }}>
                {cita.autorNombre}
              </p>
              <p style={{
                margin: 0, fontSize: "0.78rem", fontWeight: 600,
                opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {cita.texto}
              </p>
            </div>
          </div>
        )}

        {esImagen ? (
          <a href={mensaje.imagen} target="_blank" rel="noopener noreferrer">
            <img
              src={mensaje.imagen}
              alt="Imagen enviada en el chat"
              loading="lazy"
              decoding="async"
              style={{
                display: "block", width: "100%", maxWidth: "260px",
                maxHeight: "320px", objectFit: "cover",
                borderRadius: esMio ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              }}
            />
          </a>
        ) : (
          mensaje.texto
        )}
        <div style={{
          fontSize: "0.65rem", fontWeight: 700, marginTop: esImagen ? "3px" : "4px",
          opacity: esImagen ? 1 : (esMio ? 0.75 : 0.5), textAlign: "right",
          color: esImagen ? "#a0a5b9" : "inherit",
          padding: esImagen ? "0 2px" : 0,
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px",
        }}>
          <span>{mensaje.editado && "Editado · "}{formatearHora(mensaje.fecha)}</span>
          {esMio && <ChecksLeido leido={mensaje.leido === true} />}
        </div>
      </div>

      <div style={{ order: esMio ? 1 : 2, flexShrink: 0 }}>
        {botonResponder}
      </div>
    </div>
  );
};

// ── Componente principal ─────────────────────────────────────
const Chat = () => {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const chatId          = searchParams.get("id");
  const { user, perfil, actualizarPerfil, cargando: cargandoAuth } = useAuth();

  const [toasts, setToasts] = useState([]);
  const mostrarToast        = useToast(setToasts);

  // ── Modo lista ──────────────────────────────────────────
  const [chats, setChats]                 = useState([]);
  const [cargandoChats, setCargandoChats] = useState(true);
  const [busquedaChats, setBusquedaChats] = useState(""); // filtro visual del buscador (mockup)

  useEffect(() => {
    if (chatId || !user?.uid) return; // solo corre en modo lista
    setCargandoChats(true);
    const unsub = suscribirMisChats(user.uid, (data) => {
      setChats(data);
      setCargandoChats(false);
    });
    return () => unsub();
  }, [user?.uid, chatId]);

  // ── Modo conversación ────────────────────────────────────
  const [chatMeta, setChatMeta]         = useState(null);
  const [cargandoMeta, setCargandoMeta] = useState(true);
  const [mensajes, setMensajes]         = useState([]);
  const [texto, setTexto]               = useState("");
  const [enviando, setEnviando]         = useState(false);
  const [perfilOtroVivo, setPerfilOtroVivo] = useState(null); // nombre/avatar EN VIVO de /usuarios/{otroUid}

  // ── Fase 6: Chat Avanzado ─────────────────────────────────
  const [menuAbierto, setMenuAbierto]       = useState(false);
  const [otroBloqueados, setOtroBloqueados] = useState([]); // bloqueados[] del OTRO usuario (¿me bloqueó?)
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [progresoImagen, setProgresoImagen] = useState(0);
  const fileInputRef = useRef(null);

  // ── Fase 7: Responder a un mensaje (estilo WhatsApp) ──────
  const [mensajeRespondiendo, setMensajeRespondiendo] = useState(null);

  // ── Fase 8: Menú contextual de mensaje + edición ──────────
  // `menuMensaje` = { mensaje, posicion: {x,y} } | null → controla
  // <MenuMensaje/>. `mensajeEditando` = mensaje en edición | null →
  // cuando no es null, el formulario de abajo pasa a modo "editar"
  // (el texto tipeado se guarda con editarMensaje en vez de crear un
  // mensaje nuevo con enviarMensaje).
  const [menuMensaje, setMenuMensaje]         = useState(null);
  const [mensajeEditando, setMensajeEditando] = useState(null);

  const messagesEndRef      = useRef(null);
  const esPrimeraCarga       = useRef(true);

  // Auto-scroll: 'auto' (instantáneo) en la carga inicial del historial,
  // 'smooth' para mensajes nuevos enviados/recibidos después de eso.
  const scrollToBottom = useCallback((behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Metadata del chat (nombre del otro, producto de origen) — una vez por chatId
  useEffect(() => {
    if (!chatId) { setChatMeta(null); return; }
    let cancelado = false;
    setCargandoMeta(true);
    esPrimeraCarga.current = true;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "chats", chatId));
        if (cancelado) return;
        setChatMeta(snap.exists() ? { id: chatId, ...snap.data() } : null);
      } catch {
        if (!cancelado) setChatMeta(null);
      } finally {
        if (!cancelado) setCargandoMeta(false);
      }
    })();

    return () => { cancelado = true; };
  }, [chatId]);

  // Mensajes en tiempo real
  useEffect(() => {
    if (!chatId) { setMensajes([]); return; }
    const unsub = suscribirMensajes(chatId, setMensajes);
    return () => unsub();
  }, [chatId]);

  // Fase 6: ¿el otro usuario me bloqueó? — se consulta su perfil PÚBLICO
  // (bloqueados vive en /usuarios/{uid}, no en una subcolección privada).
  useEffect(() => {
    const otro = chatMeta?.participantes?.find((u) => u !== user?.uid);
    if (!otro) { setOtroBloqueados([]); return; }
    let cancelado = false;
    obtenerPerfilVendedor(otro)
      .then((p) => { if (!cancelado) setOtroBloqueados(p?.bloqueados || []); })
      .catch(() => { if (!cancelado) setOtroBloqueados([]); });
    return () => { cancelado = true; };
  }, [chatMeta, user?.uid]);

  // 🔧 Header de la conversación en vivo (mismo patrón que ya usa la lista
  // en chatService.suscribirMisChats): chatMeta.participantesInfo[otroUid]
  // es una FOTO ESTÁTICA de cuando se creó/reabrió el chat — si el otro
  // usuario después cambia su nombre o foto, se quedaba desactualizado acá
  // aunque la lista ya mostrara el dato nuevo. Este listener abre
  // /usuarios/{otroUid} en vivo y sus datos siempre pisan lo guardado en
  // el chat (nunca al revés) — ver el merge en `otroInfo` más abajo.
  useEffect(() => {
    const otro = chatMeta?.participantes?.find((u) => u !== user?.uid);
    if (!otro) { setPerfilOtroVivo(null); return; }

    const unsub = onSnapshot(
      doc(db, "usuarios", otro),
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setPerfilOtroVivo({
          nombre: data.nombre || "Estudiante UNP",
          avatar: data.avatar || "",
        });
      },
      () => setPerfilOtroVivo(null) // best-effort: si falla, se cae al dato guardado en el chat
    );

    return () => unsub();
  }, [chatMeta, user?.uid]);

  // Marcar como leído al entrar y cada vez que llega un mensaje nuevo mientras está abierto
  useEffect(() => {
    if (!chatId || !user?.uid || mensajes.length === 0) return;
    marcarComoLeido(chatId, user.uid);
    // 🆕 Doble check: además del contador de la lista (arriba), marca
    // en un solo writeBatch los mensajes RECIBIDOS que sigan en
    // `leido: false`. `mensajes` no está en las deps a propósito —
    // mismo criterio que ya usaba este efecto (mensajes.length): evita
    // reencolar la función en cada referencia nueva del array del
    // listener; la función igual lee el `mensajes` más reciente por
    // closure, y es no-op (sin writes) si no hay nada pendiente.
    marcarMensajesComoLeidos(chatId, mensajes, user.uid);
  }, [chatId, user?.uid, mensajes.length]);

  // Auto-scroll al último mensaje: se dispara al cambiar la lista de mensajes
  // Y también cuando termina de cargar (cargandoMeta === false), para cubrir
  // tanto el historial inicial como cada mensaje nuevo enviado/recibido.
  useEffect(() => {
    if (cargandoMeta || mensajes.length === 0) return;
    scrollToBottom(esPrimeraCarga.current ? "auto" : "smooth");
    esPrimeraCarga.current = false;
  }, [mensajes, cargandoMeta, scrollToBottom]);

  // ── Derivados de la conversación abierta ──────────────────
  const otroUid          = chatMeta?.participantes?.find((u) => u !== user?.uid);
  // Firestore en vivo (perfilOtroVivo) SIEMPRE pisa el snapshot estático
  // guardado en el chat — mismo criterio que ya usa la lista de chats.
  const otroInfo         = { ...chatMeta?.participantesInfo?.[otroUid], ...perfilOtroVivo };
  const chatValidoParaMi = !!chatMeta && chatMeta.participantes?.includes(user?.uid);

  // Fase 6: bloqueado en cualquiera de los dos sentidos → no se puede escribir
  const yoLoBloquee          = (perfil?.bloqueados || []).includes(otroUid);
  const elMeBloqueo          = otroBloqueados.includes(user?.uid);
  const conversacionBloqueada = yoLoBloquee || elMeBloqueo;

  // Fase 8 · Contexto dinámico: producto activo de esta conversación,
  // con fallback a los campos legacy para chats creados antes de esta
  // fase (ver obtenerProductoRef arriba).
  const productoRef = obtenerProductoRef(chatMeta);

  // ── Fase 7: arma la cita a partir de `mensajeRespondiendo` ─────
  // Se recalcula en cada envío (no se guarda ya armado en el estado)
  // para que siempre use el nombre más fresco de `otroInfo` (perfil en
  // vivo) y no un dato viejo capturado al momento del click en "responder".
  const armarRespondiendoA = useCallback(() => {
    if (!mensajeRespondiendo) return null;
    return {
      id:    mensajeRespondiendo.id,
      texto: mensajeRespondiendo.texto || (mensajeRespondiendo.imagen ? "📷 Imagen" : ""),
      autorNombre: mensajeRespondiendo.deUid === user?.uid
        ? "Tú"
        : (otroInfo.nombre || "Estudiante UNP"),
    };
  }, [mensajeRespondiendo, user?.uid, otroInfo.nombre]);

  // ── Enviar mensaje de texto ────────────────────────────────
  const handleEnviar = useCallback(async (e) => {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio || !chatId || !user?.uid || enviando || conversacionBloqueada) return;

    const respondiendoA = armarRespondiendoA();
    setTexto("");
    setEnviando(true);
    try {
      // 🔧 Auditoría UI/UX: se quitó la creación de una notificación por
      // cada mensaje enviado. El contador de "no leídos" en BottomNav
      // (useChatsNoLeidos, vía chat.noLeidoPor) ya cubre ese aviso en
      // tiempo real — duplicarlo en /notificaciones solo llenaba esa
      // pestaña de spam por cada mensaje del chat.
      await enviarMensaje(chatId, user.uid, limpio, "texto", respondiendoA).then((resultado) => {
        if (resultado?.otroUid) {
          // 🔔 Push al destinatario — fire-and-forget, nunca bloquea el envío.
          notificarNuevoMensaje({
            paraUid:  resultado.otroUid,
            deNombre: perfil?.nombre || user.displayName || "Alguien",
            deAvatar: perfil?.avatar || user.photoURL || undefined,
            mensaje:  limpio,
            chatId,
          });
        }
      });
      setMensajeRespondiendo(null); // solo se limpia la cita si el envío tuvo éxito
    } catch (err) {
      mostrarToast(err.message || "No se pudo enviar el mensaje", "error");
      setTexto(limpio); // no perder lo que el usuario escribió
    } finally {
      setEnviando(false);
    }
  }, [texto, chatId, user, perfil, enviando, conversacionBloqueada, mostrarToast, armarRespondiendoA]);

  // ── Fase 8: Edición de mensajes ────────────────────────────
  // Precarga el texto del mensaje en el input y cambia el formulario a
  // modo "editar" (cancela cualquier "responder a" activo — son mutuamente
  // excluyentes en la misma barra de envío).
  const iniciarEdicion = useCallback((mensaje) => {
    setMensajeRespondiendo(null);
    setMensajeEditando(mensaje);
    setTexto(mensaje.texto || "");
  }, []);

  const cancelarEdicion = useCallback(() => {
    setMensajeEditando(null);
    setTexto("");
  }, []);

  const handleGuardarEdicion = useCallback(async (e) => {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio || !mensajeEditando || !chatId || !user?.uid || enviando) return;

    setEnviando(true);
    try {
      await editarMensaje(chatId, mensajeEditando.id, user.uid, limpio);
      setMensajeEditando(null);
      setTexto("");
    } catch (err) {
      mostrarToast(err.message || "No se pudo editar el mensaje", "error");
    } finally {
      setEnviando(false);
    }
  }, [texto, mensajeEditando, chatId, user, enviando, mostrarToast]);

  // Despacha al flujo correcto según el modo activo del formulario —
  // así el mismo <form onSubmit> y el mismo Enter del textarea sirven
  // para enviar un mensaje nuevo o para confirmar una edición.
  const handleSubmitFormulario = useCallback((e) => {
    if (mensajeEditando) return handleGuardarEdicion(e);
    return handleEnviar(e);
  }, [mensajeEditando, handleGuardarEdicion, handleEnviar]);

  const handleCopiarTexto = useCallback(async (mensaje) => {
    try {
      await navigator.clipboard.writeText(mensaje.texto || "");
      mostrarToast("Mensaje copiado");
    } catch {
      mostrarToast("No se pudo copiar el mensaje", "error");
    }
  }, [mostrarToast]);

  // ── Enviar imagen (Fase 6) ─────────────────────────────────
  const handleSeleccionarImagen = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después
    if (!archivo || !chatId || !user?.uid || subiendoImagen || conversacionBloqueada) return;

    const respondiendoA = armarRespondiendoA();
    setSubiendoImagen(true);
    setProgresoImagen(0);
    try {
      const comprimida = await comprimirImagen(archivo);
      const url = await subirImagenImgBB(comprimida, setProgresoImagen);
      await enviarMensaje(chatId, user.uid, url, "imagen", respondiendoA).then((resultado) => {
        if (resultado?.otroUid) {
          notificarNuevoMensaje({
            paraUid:  resultado.otroUid,
            deNombre: perfil?.nombre || user.displayName || "Alguien",
            deAvatar: perfil?.avatar || user.photoURL || undefined,
            mensaje:  "📷 Imagen",
            chatId,
          });
        }
      });
      setMensajeRespondiendo(null); // solo se limpia la cita si el envío tuvo éxito
    } catch (err) {
      mostrarToast(err.message || "No se pudo enviar la imagen", "error");
    } finally {
      setSubiendoImagen(false);
      setProgresoImagen(0);
    }
  };

  // ── Bloquear / desbloquear (Fase 6) ────────────────────────
  const handleBloquear = async () => {
    if (!user?.uid || !otroUid) return;
    try {
      await bloquearUsuario(user.uid, otroUid);
      actualizarPerfil({ bloqueados: [...(perfil?.bloqueados || []), otroUid] });
      mostrarToast("Usuario bloqueado. Ya no podrá escribirte.");
    } catch (err) {
      mostrarToast(err.message || "No se pudo bloquear al usuario", "error");
    }
  };

  const handleDesbloquear = async () => {
    if (!user?.uid || !otroUid) return;
    try {
      await desbloquearUsuario(user.uid, otroUid);
      actualizarPerfil({ bloqueados: (perfil?.bloqueados || []).filter((u) => u !== otroUid) });
      mostrarToast("Usuario desbloqueado.");
    } catch (err) {
      mostrarToast(err.message || "No se pudo desbloquear al usuario", "error");
    }
  };

  // ── Ocultar chat (Fase 6) ──────────────────────────────────
  const handleOcultar = async () => {
    if (!user?.uid || !chatId) return;
    try {
      await ocultarChat(chatId, user.uid);
      navigate("/chat", { replace: true });
      mostrarToast("Chat ocultado. Reaparecerá si te vuelven a escribir.");
    } catch (err) {
      mostrarToast(err.message || "No se pudo ocultar el chat", "error");
    }
  };

  // ── Navegación ────────────────────────────────────────────
  const volverALista = () => navigate("/chat", { replace: true });
  const irAlPerfilVendedor = () => { if (otroUid) navigate(`/vendedor?uid=${otroUid}`); };
  const abrirChat     = (id) => navigate(`/chat?id=${id}`);

  // ── Auth aún resolviendo ────────────────────────────────
  if (cargandoAuth) return <Spinner mensaje="Cargando..." />;

  // ════════════════════════════════════════════════════════════
  //  MODO LISTA (Misión C): header azul + tarjeta blanca
  //  superpuesta, buscador y tarjetas de chat (mockup 3).
  //  La conversación individual (modo charla) sigue el layout
  //  WhatsApp/Instagram ya ajustado más abajo — no se toca acá.
  // ════════════════════════════════════════════════════════════
  if (!chatId) {
    const chatsFiltrados = chats.filter((chat) => {
      if (!busquedaChats.trim()) return true;
      const otroUidF  = chat.participantes?.find((u) => u !== user?.uid);
      const nombreF   = chat.participantesInfo?.[otroUidF]?.nombre || "";
      const haystack  = `${nombreF} ${obtenerProductoRef(chat)?.titulo || ""} ${chat.ultimoMensaje || ""}`.toLowerCase();
      return haystack.includes(busquedaChats.trim().toLowerCase());
    });

    return (
      <div className="app-shell bg-background pb-28 font-sans">

        {/* HEADER AZUL (mismo patrón que Home.jsx / Publicar.jsx) */}
        <header className="relative rounded-b-[32px] bg-primary px-6 pb-10 pt-8">
          <button
            onClick={() => navigate(-1)}
            aria-label="Volver"
            className="absolute left-5 top-8 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          >
            <IconoVolver />
          </button>

          <div className="flex items-center justify-center gap-3">
            <img src={MASCOTA_ICONO} alt="TuCampus" className="h-14 w-14 object-contain" />
            <div className="text-left">
              <p className="text-2xl font-extrabold leading-none text-background">TuCampus</p>
              <p className="mt-1 text-[12px] font-medium text-background/75">Conecta. Comparte. Crece.</p>
            </div>
          </div>
        </header>

        <BotonNotificaciones />

        {/* TARJETA BLANCA SUPERPUESTA */}
        <main className="relative -mt-6 px-4">
          <div className="rounded-t-[32px] bg-card pb-2 pt-6 shadow-soft">
            <div className="px-5">
              <h1 className="text-[19px] font-extrabold text-ink">Mensajes</h1>
              <p className="mt-0.5 text-[12.5px] font-semibold text-ink/50">Revisa tus conversaciones</p>

              {/* Buscador — filtro visual local, no toca la suscripción real */}
              <div className="relative mt-4 mb-1">
                <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" />
                <input
                  type="text"
                  value={busquedaChats}
                  onChange={(e) => setBusquedaChats(e.target.value)}
                  placeholder="Buscar mensajes..."
                  className="w-full rounded-full border-none bg-background py-3 pl-10 pr-4 text-[13.5px] font-semibold text-ink outline-none placeholder:text-ink/30"
                />
              </div>
            </div>

            <ListaChats chats={chatsFiltrados} cargando={cargandoChats} miUid={user?.uid} onAbrir={abrirChat} />
          </div>
        </main>

        <BottomNav activo="mensajes" />
        <ToastContainer toasts={toasts} />
      </div>
    );
  }

  // ── Render (modo charla) ────────────────────────────────────
  return (
    <div
      className="app-shell"
      style={{
        background: "var(--bg-crema)",
        // 🔧 Layout fijo tipo WhatsApp/Instagram: el shell ocupa exactamente
        // el alto del viewport (100dvh = dynamic viewport height, se ajusta
        // solo cuando el teclado móvil abre/cierra, a diferencia de 100vh).
        // Header e input viven como hijos normales de este flex-column —
        // YA NO usan position:sticky/fixed, así nunca "flotan" ni se
        // desalinean. Solo el contenedor de mensajes hace scroll interno.
        height: "100dvh",
        maxHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 0,
      }}
    >

      {/* ── HEADER (fijo: flexShrink 0 + zIndex, fuera del área con scroll) ── */}
      <div style={{
        flexShrink: 0, position: "relative", zIndex: 20,
        background: "white", borderBottom: "1px solid #f1f3f5",
        display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px",
      }}>
        <button
          onClick={volverALista}
          aria-label="Volver"
          style={{
            width: "36px", height: "36px", flexShrink: 0,
            background: "var(--bg-crema)", borderRadius: "50%",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--azul-oscuro)",
          }}
        >
          <IconoVolver />
        </button>

        {cargandoMeta ? (
          <span style={{ fontWeight: 600, color: "#5c5c7a", fontSize: "0.9rem" }}>Cargando...</span>
        ) : !chatValidoParaMi ? (
          <span style={{ fontWeight: 600, color: "#5c5c7a", fontSize: "0.9rem" }}>Chat no encontrado</span>
        ) : (
          <div
            onClick={irAlPerfilVendedor}
            style={{
              display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0,
              cursor: otroUid ? "pointer" : "default",
            }}
          >
            <Avatar nombre={otroInfo.nombre} avatar={otroInfo.avatar} size={38} />
            <div style={{ minWidth: 0 }}>
              <h2 style={{
                margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--azul-oscuro)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {otroInfo.nombre || "Estudiante UNP"}
              </h2>
            </div>
          </div>
        )}

        {/* ── FASE 6: menú de opciones (⋮) — solo en una conversación válida ── */}
        {chatId && chatValidoParaMi && (
          <>
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label="Opciones de la conversación"
              style={{
                width: "36px", height: "36px", flexShrink: 0,
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--azul-oscuro)", borderRadius: "50%",
              }}
            >
              <IconoMenu />
            </button>
            <MenuChat
              abierto={menuAbierto}
              onCerrar={() => setMenuAbierto(false)}
              bloqueado={yoLoBloquee}
              onBloquear={handleBloquear}
              onDesbloquear={handleDesbloquear}
              onOcultar={handleOcultar}
            />
          </>
        )}
      </div>

      {/* ── Fase 8: banner del producto ACTIVO de la conversación ── */}
      {chatValidoParaMi && productoRef && (
        <button
          onClick={() => navigate(`/producto?id=${productoRef.id}`)}
          style={{
            flexShrink: 0, zIndex: 15, position: "relative",
            display: "flex", alignItems: "center", gap: "10px",
            width: "100%", background: "white", border: "none",
            borderBottom: "1px solid #f1f3f5", padding: "8px 20px",
            cursor: "pointer", textAlign: "left", boxSizing: "border-box",
          }}
        >
          <div style={{
            width: "40px", height: "40px", flexShrink: 0, borderRadius: "10px",
            overflow: "hidden", background: "var(--bg-crema)",
          }}>
            {productoRef.imagenUrl && (
              <img
                src={productoRef.imagenUrl}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{
              margin: 0, fontSize: "0.62rem", fontWeight: 800,
              color: "var(--verde-marca)", textTransform: "uppercase", letterSpacing: "0.03em",
            }}>
              Conversando sobre
            </p>
            <p style={{
              margin: 0, fontSize: "0.82rem", fontWeight: 700, color: "var(--azul-oscuro)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {productoRef.titulo || "Producto"}
            </p>
          </div>
          {formatearPrecio(productoRef.precio) && (
            <span style={{ flexShrink: 0, fontSize: "0.85rem", fontWeight: 800, color: "var(--verde-marca)" }}>
              {formatearPrecio(productoRef.precio)}
            </span>
          )}
        </button>
      )}

      {/* ── CONTENIDO (única zona con scroll: flex:1 + overflowY:auto) ── */}
      {cargandoMeta ? (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <Spinner mensaje="Cargando conversación..." fullScreen={false} />
        </div>
      ) : !chatValidoParaMi ? (
        <div style={{
          flex: 1, overflowY: "auto", minHeight: 0,
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "80px 24px", gap: "12px", textAlign: "center",
        }}>
          <span style={{ fontSize: "2.6rem" }}>🚫</span>
          <p style={{ fontWeight: 700, color: "var(--azul-oscuro)", margin: 0 }}>
            No podés ver esta conversación
          </p>
          <button
            onClick={volverALista}
            style={{
              background: "var(--verde-marca)", color: "white", border: "none",
              padding: "10px 20px", borderRadius: "12px", fontWeight: 600,
              cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            }}
          >
            Ver mis chats
          </button>
        </div>
      ) : (
        <>
          {/* Lista de mensajes: ÚNICO elemento con scroll interno (flex:1 + min-height:0) */}
          <div style={{
            flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch",
            display: "flex", flexDirection: "column", padding: "14px 0",
          }}>
            {mensajes.length === 0 ? (
              <div style={{ textAlign: "center", color: "#a0a5b9", fontWeight: 600, fontSize: "0.85rem", marginTop: "40px" }}>
                Todavía no hay mensajes. ¡Escribí el primero! 👋
              </div>
            ) : (
              mensajes.map((m) => (
                <Burbuja
                  key={m.id}
                  mensaje={m}
                  esMio={m.deUid === user?.uid}
                  onResponder={conversacionBloqueada ? null : setMensajeRespondiendo}
                  onMenuContextual={
                    conversacionBloqueada ? null : (mensaje, posicion) => setMenuMensaje({ mensaje, posicion })
                  }
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Fase 8: menú contextual de mensaje (long-press / click derecho) ── */}
          {menuMensaje && (
            <MenuMensaje
              mensaje={menuMensaje.mensaje}
              posicion={menuMensaje.posicion}
              onCerrar={() => setMenuMensaje(null)}
              onResponder={conversacionBloqueada ? null : (m) => setMensajeRespondiendo(m)}
              onEditar={
                !conversacionBloqueada
                && menuMensaje.mensaje.deUid === user?.uid
                && menuMensaje.mensaje.tipo !== "imagen"
                  ? iniciarEdicion
                  : null
              }
              onCopiar={menuMensaje.mensaje.tipo !== "imagen" ? handleCopiarTexto : null}
            />
          )}

          {/* ── BARRA DE ENVÍO (fija: flexShrink 0, ya no position:fixed) ── */}
          {conversacionBloqueada ? (
            // Fase 6: bloqueado en cualquiera de los dos sentidos → sin input
            <div style={{
              flexShrink: 0, zIndex: 20, background: "white", borderTop: "1px solid #f1f3f5",
              padding: "16px 20px",
              paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
              textAlign: "center",
            }}>
              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#a0a5b9" }}>
                🚫 No puedes responder a esta conversación
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmitFormulario}
              style={{
                flexShrink: 0, zIndex: 20,
                background: "white", padding: "12px 16px",
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
                borderTop: "1px solid #f1f3f5", boxSizing: "border-box",
              }}
            >
              {/* ── Fase 8: banner de "editando mensaje" — arriba del textarea ── */}
              {mensajeEditando && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  background: "var(--bg-crema)", borderRadius: "10px",
                  padding: "8px 10px", marginBottom: "8px",
                }}>
                  <div style={{
                    width: "3px", alignSelf: "stretch", borderRadius: "3px",
                    background: "#e0a800", flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 800, color: "#b8860b" }}>
                      Editando mensaje
                    </p>
                    <p style={{
                      margin: 0, fontSize: "0.82rem", fontWeight: 600,
                      color: "var(--azul-oscuro)", opacity: 0.75,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {mensajeEditando.texto}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelarEdicion}
                    aria-label="Cancelar edición"
                    style={{
                      width: "26px", height: "26px", flexShrink: 0,
                      background: "none", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#a0a5b9",
                    }}
                  >
                    <X size={16} strokeWidth={2.4} />
                  </button>
                </div>
              )}

              {/* ── Fase 7: banner de "respondiendo a" — arriba del textarea ── */}
              {!mensajeEditando && mensajeRespondiendo && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  background: "var(--bg-crema)", borderRadius: "10px",
                  padding: "8px 10px", marginBottom: "8px",
                }}>
                  <div style={{
                    width: "3px", alignSelf: "stretch", borderRadius: "3px",
                    background: "var(--verde-marca)", flexShrink: 0,
                  }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{
                      margin: 0, fontSize: "0.78rem", fontWeight: 800,
                      color: "var(--verde-marca)",
                    }}>
                      {mensajeRespondiendo.deUid === user?.uid
                        ? "Tú"
                        : (otroInfo.nombre || "Estudiante UNP")}
                    </p>
                    <p style={{
                      margin: 0, fontSize: "0.82rem", fontWeight: 600,
                      color: "var(--azul-oscuro)", opacity: 0.75,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {mensajeRespondiendo.texto || (mensajeRespondiendo.imagen ? "📷 Imagen" : "")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMensajeRespondiendo(null)}
                    aria-label="Cancelar respuesta"
                    style={{
                      width: "26px", height: "26px", flexShrink: 0,
                      background: "none", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#a0a5b9",
                    }}
                  >
                    <X size={16} strokeWidth={2.4} />
                  </button>
                </div>
              )}

              {subiendoImagen && (
                <div style={{
                  height: "4px", borderRadius: "3px", background: "#e8e8f0",
                  overflow: "hidden", marginBottom: "8px",
                }}>
                  <div style={{
                    height: "100%", width: `${progresoImagen}%`,
                    background: "var(--verde-marca)", transition: "width 0.2s ease",
                  }} />
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleSeleccionarImagen}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={subiendoImagen || !!mensajeEditando}
                  aria-label="Adjuntar imagen"
                  style={{
                    width: "44px", height: "44px", flexShrink: 0,
                    background: "var(--bg-crema)", border: "none", borderRadius: "14px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--azul-oscuro)",
                    cursor: (subiendoImagen || mensajeEditando) ? "not-allowed" : "pointer",
                    opacity: (subiendoImagen || mensajeEditando) ? 0.6 : 1,
                  }}
                >
                  <IconoClip />
                </button>

                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitFormulario();
                    } else if (e.key === "Escape" && mensajeEditando) {
                      cancelarEdicion();
                    }
                  }}
                  placeholder={subiendoImagen ? "Enviando imagen..." : "Escribe un mensaje..."}
                  rows={1}
                  disabled={subiendoImagen}
                  style={{
                    flex: 1, resize: "none", maxHeight: "100px",
                    border: mensajeEditando ? "1.5px solid #e0a800" : "1.5px solid #e8e8f0",
                    borderRadius: "16px",
                    padding: "12px 16px", fontSize: "0.9rem",
                    fontFamily: "'Nunito', sans-serif", fontWeight: 600,
                    color: "var(--azul-oscuro)", outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={!texto.trim() || enviando || subiendoImagen}
                  aria-label={mensajeEditando ? "Confirmar edición" : "Enviar mensaje"}
                  style={{
                    width: "48px", height: "48px", flexShrink: 0,
                    background: texto.trim()
                      ? (mensajeEditando ? "#e0a800" : "var(--verde-marca)")
                      : "#e8e8f0",
                    color: "white", border: "none", borderRadius: "14px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: texto.trim() ? "pointer" : "not-allowed",
                    transition: "background 0.2s",
                  }}
                >
                  {mensajeEditando ? <Check size={20} strokeWidth={2.5} /> : <IconoEnviar />}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
};

export default Chat;