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
import { doc, getDoc }                               from "firebase/firestore";
import { db }                                        from "../services/firebase";
import { useAuth }                                   from "../context/AuthContext";
import {
  suscribirMisChats,
  suscribirMensajes,
  enviarMensaje,
  marcarComoLeido,
}                                       from "../services/chatService";
import { crearNotificacion }           from "../services/notificationService";
import { ToastContainer, useToast }    from "../components/Toast";
import Spinner                         from "../components/Spinner";

// ── Helpers ───────────────────────────────────────────────────
const formatearHora = (fecha) => {
  if (!fecha?.toDate) return "";
  const d   = fecha.toDate();
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) {
    return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
};

const inicial = (nombre) => (nombre || "?").trim()[0]?.toUpperCase() || "?";

// ── Sub-componente: Avatar ───────────────────────────────────
const Avatar = ({ nombre, avatar, size = 46 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    background: "linear-gradient(135deg,#c8a97a,#a07850)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.42, fontWeight: 700, color: "white",
    overflow: "hidden", flexShrink: 0,
  }}>
    {avatar?.trim()
      ? <img src={avatar} alt={nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : inicial(nombre)}
  </div>
);

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

// ── Sub-vista: lista de conversaciones ───────────────────────
const ListaChats = ({ chats, cargando, miUid, onAbrir }) => {
  if (cargando) return <Spinner mensaje="Cargando tus chats..." fullScreen={false} />;

  if (chats.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "80px 24px", gap: "12px", textAlign: "center",
      }}>
        <span style={{ fontSize: "2.6rem" }}>💬</span>
        <p style={{ fontWeight: 700, color: "var(--azul-oscuro)", margin: 0 }}>
          Todavía no tenés conversaciones
        </p>
        <p style={{ fontSize: "0.85rem", color: "#5c5c7a", fontWeight: 600, margin: 0 }}>
          Escribile a un vendedor desde la página de un producto para empezar a chatear.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {chats.map((chat) => {
        const otroUid     = chat.participantes?.find((u) => u !== miUid);
        const otroInfo    = chat.participantesInfo?.[otroUid] || {};
        const noLeidos    = chat.noLeidoPor?.[miUid] || 0;
        const soyYoUltimo = chat.ultimoMensajeDeUid === miUid;

        return (
          <button
            key={chat.id}
            onClick={() => onAbrir(chat.id)}
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 20px", background: "white", border: "none",
              borderBottom: "1px solid #f1f3f5", cursor: "pointer",
              textAlign: "left", width: "100%", fontFamily: "'Nunito', sans-serif",
            }}
          >
            <Avatar nombre={otroInfo.nombre} avatar={otroInfo.avatar} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <h3 style={{
                  margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--azul-oscuro)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {otroInfo.nombre || "Estudiante UNP"}
                </h3>
                <span style={{ fontSize: "0.72rem", color: "#a0a5b9", fontWeight: 600, flexShrink: 0 }}>
                  {formatearHora(chat.ultimoMensajeFecha)}
                </span>
              </div>

              {chat.productoTitulo && (
                <p style={{
                  margin: "1px 0 2px", fontSize: "0.72rem", color: "var(--verde-marca)", fontWeight: 700,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  Sobre: {chat.productoTitulo}
                </p>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <p style={{
                  margin: 0, fontSize: "0.83rem",
                  color: noLeidos > 0 ? "var(--azul-oscuro)" : "#5c5c7a",
                  fontWeight: noLeidos > 0 ? 700 : 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                }}>
                  {chat.ultimoMensaje
                    ? `${soyYoUltimo ? "Tú: " : ""}${chat.ultimoMensaje}`
                    : "Empieza la conversación"}
                </p>
                {noLeidos > 0 && (
                  <span style={{
                    background: "var(--naranja-marca)", color: "white",
                    fontSize: "0.7rem", fontWeight: 800, borderRadius: "10px",
                    minWidth: "18px", height: "18px", padding: "0 5px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {noLeidos > 9 ? "9+" : noLeidos}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ── Sub-vista: burbuja de mensaje ────────────────────────────
const Burbuja = ({ mensaje, esMio }) => (
  <div style={{ display: "flex", justifyContent: esMio ? "flex-end" : "flex-start", padding: "3px 16px" }}>
    <div style={{
      maxWidth: "75%",
      background: esMio ? "var(--verde-marca)" : "white",
      color: esMio ? "white" : "var(--azul-oscuro)",
      padding: "10px 14px",
      borderRadius: esMio ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
      boxShadow: esMio ? "none" : "0 2px 8px rgba(0,0,0,0.06)",
      fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.4,
      wordBreak: "break-word", whiteSpace: "pre-wrap",
    }}>
      {mensaje.texto}
      <div style={{ fontSize: "0.65rem", fontWeight: 700, marginTop: "4px", opacity: esMio ? 0.75 : 0.5, textAlign: "right" }}>
        {formatearHora(mensaje.fecha)}
      </div>
    </div>
  </div>
);

// ── Componente principal ─────────────────────────────────────
const Chat = () => {
  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const chatId          = searchParams.get("id");
  const { user, perfil, cargando: cargandoAuth } = useAuth();

  const [toasts, setToasts] = useState([]);
  const mostrarToast        = useToast(setToasts);

  // ── Modo lista ──────────────────────────────────────────
  const [chats, setChats]                 = useState([]);
  const [cargandoChats, setCargandoChats] = useState(true);

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

  const finRef              = useRef(null);
  const esPrimeraCarga       = useRef(true);

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

  // Marcar como leído al entrar y cada vez que llega un mensaje nuevo mientras está abierto
  useEffect(() => {
    if (!chatId || !user?.uid || mensajes.length === 0) return;
    marcarComoLeido(chatId, user.uid);
  }, [chatId, user?.uid, mensajes.length]);

  // Auto-scroll al último mensaje (instantáneo en la primera carga, suave después)
  useEffect(() => {
    if (mensajes.length === 0) return;
    finRef.current?.scrollIntoView({ behavior: esPrimeraCarga.current ? "auto" : "smooth" });
    esPrimeraCarga.current = false;
  }, [mensajes]);

  // ── Enviar mensaje ────────────────────────────────────────
  const handleEnviar = useCallback(async (e) => {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio || !chatId || !user?.uid || enviando) return;

    setTexto("");
    setEnviando(true);
    try {
      const resultado = await enviarMensaje(chatId, user.uid, limpio);

      // Fire-and-forget — mismo patrón que notificationService en el resto de la app
      if (resultado?.otroUid) {
        crearNotificacion({
          paraUid:        resultado.otroUid,
          deUid:          user.uid,
          deNombre:       perfil?.nombre || user.displayName || "Un usuario",
          tipo:           "mensaje",
          productoId:     chatMeta?.productoId || null,
          productoTitulo: chatMeta?.productoTitulo || "un chat",
        });
      }
    } catch (err) {
      mostrarToast(err.message || "No se pudo enviar el mensaje", "error");
      setTexto(limpio); // no perder lo que el usuario escribió
    } finally {
      setEnviando(false);
    }
  }, [texto, chatId, user, enviando, perfil, chatMeta, mostrarToast]);

  // ── Navegación ────────────────────────────────────────────
  const volverALista = () => navigate("/chat", { replace: true });
  const irAlProducto  = () => { if (chatMeta?.productoId) navigate(`/producto?id=${chatMeta.productoId}`); };
  const abrirChat     = (id) => navigate(`/chat?id=${id}`);

  const otroUid            = chatMeta?.participantes?.find((u) => u !== user?.uid);
  const otroInfo           = chatMeta?.participantesInfo?.[otroUid] || {};
  const chatValidoParaMi   = !!chatMeta && chatMeta.participantes?.includes(user?.uid);

  // ── Auth aún resolviendo ────────────────────────────────
  if (cargandoAuth) return <Spinner mensaje="Cargando..." />;

  // ── Render ────────────────────────────────────────────────
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
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 0,
      }}
    >

      {/* ── HEADER (fijo: flexShrink 0, fuera del área con scroll) ── */}
      <div style={{
        flexShrink: 0,
        background: "white", borderBottom: "1px solid #f1f3f5",
        display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px",
      }}>
        <button
          onClick={() => (chatId ? volverALista() : navigate(-1))}
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

        {!chatId ? (
          <h1 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--azul-oscuro)" }}>
            Mensajes
          </h1>
        ) : cargandoMeta ? (
          <span style={{ fontWeight: 600, color: "#5c5c7a", fontSize: "0.9rem" }}>Cargando...</span>
        ) : !chatValidoParaMi ? (
          <span style={{ fontWeight: 600, color: "#5c5c7a", fontSize: "0.9rem" }}>Chat no encontrado</span>
        ) : (
          <div
            onClick={irAlProducto}
            style={{
              display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0,
              cursor: chatMeta.productoId ? "pointer" : "default",
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
              {chatMeta.productoTitulo && (
                <p style={{
                  margin: 0, fontSize: "0.72rem", color: "var(--verde-marca)", fontWeight: 700,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  Sobre: {chatMeta.productoTitulo} ›
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── CONTENIDO (única zona con scroll: flex:1 + overflowY:auto) ── */}
      {!chatId ? (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <ListaChats chats={chats} cargando={cargandoChats} miUid={user?.uid} onAbrir={abrirChat} />
        </div>
      ) : cargandoMeta ? (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <Spinner mensaje="Cargando conversación..." fullScreen={false} />
        </div>
      ) : !chatValidoParaMi ? (
        <div style={{
          flex: 1, overflowY: "auto",
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
          {/* Lista de mensajes: ÚNICO elemento con scroll interno */}
          <div style={{
            flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
            display: "flex", flexDirection: "column", padding: "14px 0",
          }}>
            {mensajes.length === 0 ? (
              <div style={{ textAlign: "center", color: "#a0a5b9", fontWeight: 600, fontSize: "0.85rem", marginTop: "40px" }}>
                Todavía no hay mensajes. ¡Escribí el primero! 👋
              </div>
            ) : (
              mensajes.map((m) => <Burbuja key={m.id} mensaje={m} esMio={m.deUid === user?.uid} />)
            )}
            <div ref={finRef} />
          </div>

          {/* ── BARRA DE ENVÍO (fija: flexShrink 0, ya no position:fixed) ── */}
          <form
            onSubmit={handleEnviar}
            style={{
              flexShrink: 0,
              background: "white", padding: "12px 16px",
              paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              borderTop: "1px solid #f1f3f5", display: "flex", gap: "10px", alignItems: "flex-end",
              boxSizing: "border-box",
            }}
          >
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleEnviar();
                }
              }}
              placeholder="Escribe un mensaje..."
              rows={1}
              style={{
                flex: 1, resize: "none", maxHeight: "100px",
                border: "1.5px solid #e8e8f0", borderRadius: "16px",
                padding: "12px 16px", fontSize: "0.9rem",
                fontFamily: "'Nunito', sans-serif", fontWeight: 600,
                color: "var(--azul-oscuro)", outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={!texto.trim() || enviando}
              aria-label="Enviar mensaje"
              style={{
                width: "48px", height: "48px", flexShrink: 0,
                background: texto.trim() ? "var(--verde-marca)" : "#e8e8f0",
                color: "white", border: "none", borderRadius: "14px",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: texto.trim() ? "pointer" : "not-allowed",
                transition: "background 0.2s",
              }}
            >
              <IconoEnviar />
            </button>
          </form>
        </>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
};

export default Chat;