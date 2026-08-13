// src/pages/Producto.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams }     from "react-router-dom";
import { ChevronLeft, Heart, MessageCircle, Star, Share2, XCircle } from "lucide-react";
import { useAuth }                          from "../context/AuthContext";
import { obtenerProductoPorId }             from "../services/productService";
import { obtenerOCrearChat }                from "../services/chatService";
import { obtenerPerfilVendedor }            from "../services/userService";
import { vendedorPorDefecto }               from "../config/universidades";
import { useFavorites }                     from "../hooks/useFavorites";
import Spinner                              from "../components/Spinner";
import { ToastContainer, useToast }         from "../components/Toast";
import GeneradorStoryModal                  from "../components/GeneradorStoryModal";

// ── Constantes ───────────────────────────────────────────────
// 🔧 Mismo set que Home.jsx / Publicar.jsx / productService.js.
const ICONOS_CAT = {
  comida: "🍔", tecnologia: "🎧", ropa: "👕",
  materiales: "📚", servicios: "🛠️", otros: "📦",
};

// ── Componente principal ─────────────────────────────────────
const Producto = () => {
  const navigate               = useNavigate();
  const [searchParams]         = useSearchParams();
  const productoId             = searchParams.get("id");

  const [producto, setProducto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [noExiste, setNoExiste] = useState(false);
  const [toasts,   setToasts]   = useState([]);
  const mostrarToast            = useToast(setToasts);
  const [reputacionVendedor, setReputacionVendedor] = useState(null); // Fase 3

  const { user: currentUser, perfil } = useAuth();

  // ── Redirigir si no hay id en URL ──
  useEffect(() => {
    if (!productoId) navigate("/", { replace: true });
  }, [productoId, navigate]);

  // ── Fetch del producto ──
  useEffect(() => {
    if (!productoId) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      try {
        const data = await obtenerProductoPorId(productoId);
        if (cancelado) return;
        data ? setProducto(data) : setNoExiste(true);
      } catch {
        if (!cancelado) setNoExiste(true);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => { cancelado = true; };
  }, [productoId]);

  // ── Fase 3: reputación del vendedor (⭐ promedio + total de reseñas).
  // El contador ahora se mantiene consistente vía runTransaction en
  // reviewService.js, así que este valor ya no se desincroniza con
  // las reseñas reales (ver fix en Vendedor.jsx).
  useEffect(() => {
    if (!producto?.userUid) { setReputacionVendedor(null); return; }
    let cancelado = false;
    obtenerPerfilVendedor(producto.userUid)
      .then((v) => { if (!cancelado) setReputacionVendedor(v); })
      .catch(() => { if (!cancelado) setReputacionVendedor(null); });
    return () => { cancelado = true; };
  }, [producto?.userUid]);

  // ── Hook: Favoritos ──────────────────────────────────────
  const { esFavorito, toggleFavorito } = useFavorites({
    productoId,
    vendedorUid:    producto?.userUid,
    vendedorNombre: producto?.vendedorNombre,
    productoTitulo: producto?.titulo,
    onToast:        mostrarToast,
  });

  // ── Chat interno ──
  // 🔧 Único canal de contacto: el botón de WhatsApp se retiró por
  // completo (junto con la lectura del contacto privado que solo
  // existía para armar ese enlace) — toda comunicación pasa por el
  // chat interno de la app.
  const [iniciandoChat, setIniciandoChat] = useState(false);

  const handleChatInterno = async () => {
    if (!currentUser) {
      mostrarToast("Iniciá sesión para chatear con el vendedor", "error");
      navigate("/login");
      return;
    }
    if (!producto?.userUid || producto.userUid === currentUser.uid || iniciandoChat) return;

    setIniciandoChat(true);
    try {
      const chat = await obtenerOCrearChat(currentUser.uid, producto.userUid, {
        productoId,
        productoTitulo:  producto.titulo,
        productoImagen:  producto.imagen,
        compradorNombre: perfil?.nombre || currentUser.displayName,
        compradorAvatar: perfil?.avatar || currentUser.photoURL,
        vendedorNombre:  producto.vendedor,
        vendedorAvatar:  producto.avatarVendedor,
      });
      navigate(`/chat?id=${chat.id}`);
    } catch (err) {
      mostrarToast(err.message || "No se pudo abrir el chat", "error");
    } finally {
      setIniciandoChat(false);
    }
  };

  // ── Compartir ──
  // 🔧 Antes esto llamaba directo a navigator.share con solo texto/link.
  // Ahora abre el modal de Story visual (GeneradorStoryModal), que es
  // quien arma el PNG 9:16 y decide cómo compartirlo (Web Share API con
  // archivo, o descarga + portapapeles como fallback).
  const [mostrandoStory, setMostrandoStory] = useState(false);
  const handleCompartir = () => setMostrandoStory(true);

  // ── Estado: Cargando ────────────────────────────────────
  if (cargando) return <Spinner mensaje="Cargando producto..." />;

  // ── Estado: No existe ───────────────────────────────────
  if (noExiste || !producto) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background font-sans">
        <span className="text-5xl">🚫</span>
        <p className="text-[17px] font-bold text-ink">Este producto ya no está disponible</p>
        <button
          onClick={() => navigate("/")}
          className="rounded-btn bg-primary px-6 py-3 text-[15px] font-extrabold text-white"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  // ── Derivados ───────────────────────────────────────────
  const {
    titulo, precio, imagen, categoria, descripcion,
    vendedor: nombreVendedorCrudo,
    avatarVendedor, estado, universidadId,
  } = producto;

  // 🏫 Multicampus: `producto.universidadId` es un campo obligatorio
  // (ver esProductoValido en firestore.rules), así que siempre hay
  // sede disponible para el fallback — ya no asumimos "Vendedor UNP".
  const nombreVendedor = nombreVendedorCrudo || vendedorPorDefecto(universidadId);

  const estaAgotado  = (estado || "").toLowerCase() === "agotado";
  const emoji        = ICONOS_CAT[(categoria || "").toLowerCase()] || "📦";
  const esMiProducto = currentUser?.uid && producto.userUid === currentUser.uid;

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="app-shell bg-background pb-28 font-sans">

      {/* ════════════════════════════════════════════════════
             IMAGEN PRINCIPAL — mismo lenguaje visual que
             el header de Vendedor.jsx (rounded-b-[32px])
        ════════════════════════════════════════════════════ */}
      <div className="relative h-[320px] w-full overflow-hidden rounded-b-[32px] bg-ink/5">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="absolute left-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft"
        >
          <ChevronLeft size={20} />
        </button>

        {imagen?.trim() ? (
          <img
            src={imagen}
            alt={titulo}
            className={`h-full w-full object-cover ${estaAgotado ? "grayscale-[60%] brightness-90" : ""}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#c8a97a] to-[#a07850] text-8xl">
            {emoji}
          </div>
        )}

        {estaAgotado && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center bg-white/45 backdrop-blur-sm">
            <span className="-rotate-6 rounded-chip bg-ink px-6 py-2.5 text-lg font-extrabold tracking-wide text-white shadow-softLg">
              AGOTADO
            </span>
          </div>
        )}

        <span className="absolute bottom-6 left-5 z-[6] rounded-chip bg-black/60 px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-wide text-white backdrop-blur">
          {categoria || "Sin categoría"}
        </span>
      </div>

      {/* ════════════════════════════════════════════════════
             PANEL BLANCO SUPERPUESTO
        ════════════════════════════════════════════════════ */}
      <main className="relative -mt-6 px-4">
        <div className="rounded-t-[32px] bg-card p-5 shadow-soft">

          {/* Título + Precio */}
          <div className="flex items-start justify-between gap-2.5">
            <h1 className="text-[22px] font-extrabold leading-tight text-ink">{titulo}</h1>
            <div className="whitespace-nowrap rounded-chip bg-[#e6faf0] px-3 py-1.5 text-[17px] font-extrabold text-[#16a34a]">
              S/ {(precio || 0).toFixed(2)}
            </div>
          </div>

          {/* Badge Verificado */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-chip bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Verificado
          </div>

          <hr className="my-5 border-ink/10" />

          {/* Tarjeta Vendedor */}
          <button
            type="button"
            onClick={() => { if (producto.userUid) navigate(`/vendedor?uid=${producto.userUid}`); }}
            className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-ink/10 bg-background px-4 py-3 text-left transition-colors hover:bg-ink/5"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#c8a97a] to-[#a07850] text-lg font-bold text-white">
              {avatarVendedor?.trim()
                ? <img src={avatarVendedor} alt={nombreVendedor} className="h-full w-full object-cover" />
                : (nombreVendedor || "?")[0].toUpperCase()
              }
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[15px] font-bold text-ink">{nombreVendedor}</h3>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink/60">
                {reputacionVendedor?.totalResenas > 0 ? (
                  <>
                    <Star size={13} fill="#f5a623" stroke="none" />
                    <span className="font-extrabold text-ink">
                      {(reputacionVendedor.calificacionPromedio || 0).toFixed(1)}
                    </span>
                    ({reputacionVendedor.totalResenas})
                  </>
                ) : (
                  vendedorPorDefecto(universidadId, true)
                )}
              </p>
            </div>
            <ChevronLeft size={18} className="ml-auto shrink-0 rotate-180 text-ink/30" />
          </button>

          <hr className="my-5 border-ink/10" />

          {/* Descripción */}
          <h2 className="mb-2.5 text-[17px] font-extrabold text-ink">Descripción</h2>
          <p className="whitespace-pre-wrap break-words text-[14px] font-semibold leading-relaxed text-ink/70">
            {descripcion}
          </p>

          {/* Botón Compartir */}
          <div className="mt-5 border-t border-ink/10 pt-4">
            <button
              onClick={handleCompartir}
              className="flex w-full items-center justify-center gap-2 rounded-btn border-[1.5px] border-ink/10 bg-background py-3 text-[14px] font-bold text-ink/60"
            >
              <Share2 size={17} />
              Compartir este producto
            </button>
          </div>

        </div>
      </main>

      {/* ════════════════════════════════════════════════════
             BARRA DE ACCIÓN FIJA — solo Favorito + Chat interno.
             El botón de WhatsApp se eliminó: toda la comunicación
             pasa por el chat interno de la app.
        ════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-1/2 z-[100] w-full max-w-[480px] -translate-x-1/2 border-t border-ink/10 bg-card px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex gap-3">

          {/* Favorito */}
          <button
            onClick={toggleFavorito}
            aria-label={esFavorito ? "Quitar de favoritos" : "Añadir a favoritos"}
            className={`flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-btn border-[1.5px] bg-card transition-colors ${
              esFavorito ? "border-red-500" : "border-ink/10"
            }`}
          >
            <Heart size={22} fill={esFavorito ? "#ef4444" : "none"} stroke={esFavorito ? "#ef4444" : "#5c5c7a"} strokeWidth={2.2} />
          </button>

          {esMiProducto ? (
            <button
              onClick={() => navigate(`/editar?id=${productoId}`)}
              className="h-[54px] flex-1 rounded-btn border-[1.5px] border-ink/10 bg-background text-[15px] font-extrabold text-ink"
            >
              Este es tu producto · Editar
            </button>
          ) : estaAgotado ? (
            <button
              disabled
              className="flex h-[54px] flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-btn bg-ink/10 text-[15px] font-bold text-ink/40"
            >
              <XCircle size={19} />
              Agotado
            </button>
          ) : (
            <button
              onClick={handleChatInterno}
              disabled={iniciandoChat}
              className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-btn bg-primary text-[16px] font-extrabold text-white shadow-soft transition-opacity disabled:opacity-75"
            >
              <MessageCircle size={20} />
              {iniciandoChat ? "Abriendo chat..." : "Chat interno"}
            </button>
          )}
        </div>
      </div>

      {/* ── TOASTS ── */}
      <ToastContainer toasts={toasts} />

      {/* ── Modal de Story para compartir ── */}
      {mostrandoStory && (
        <GeneradorStoryModal
          producto={producto}
          emoji={emoji}
          nombreVendedor={nombreVendedor}
          avatarVendedor={avatarVendedor}
          calificacion={reputacionVendedor?.calificacionPromedio || 0}
          totalResenas={reputacionVendedor?.totalResenas || 0}
          productoUrl={window.location.href}
          onClose={() => setMostrandoStory(false)}
          onToast={mostrarToast}
        />
      )}

    </div>
  );
};

export default Producto;