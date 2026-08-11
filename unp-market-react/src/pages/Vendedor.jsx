// src/pages/Vendedor.jsx
import { useState, useEffect }         from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft, Pencil, MapPin, CheckCircle2, Star,
  MessageCircle, LayoutGrid, MoreVertical,
} from "lucide-react";
import { useAuth }                     from "../context/AuthContext";
import { crearNotificacion }           from "../services/notificationService";
import {
  obtenerPerfilVendedor,
  obtenerProductosPorVendedor,
  obtenerContactoPrivado,
  seguirVendedor,
  dejarDeSeguirVendedor,
} from "../services/userService";
import { obtenerOCrearChat } from "../services/chatService";
import {
  obtenerMiResena,
  obtenerResenasDeVendedor,
} from "../services/reviewService";
import Spinner    from "../components/Spinner";
import BottomNav   from "../components/BottomNav";
import BotonNotificaciones from "../components/BotonNotificaciones";
import ModalResena from "../components/ModalResena";
import ProductCard from "../components/ProductCard";
import { ToastContainer, useToast } from "../components/Toast";

// Placeholders — reemplazar por los archivos finales de cada logo.
const YAPE_PLACEHOLDER = "/assets/yape-placeholder.png";
const PLIN_PLACEHOLDER = "/assets/plin-placeholder.png";

const formatearFecha = (fecha) => {
  if (!fecha?.toDate) return "";
  return fecha.toDate().toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

// ── Sub-componente: estrellas (solo lectura) ──────────────────
const Estrellas = ({ valor, size = 13 }) => (
  <div className="inline-flex gap-px">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        size={size}
        fill={n <= Math.round(valor || 0) ? "#f5a623" : "#e0e0e6"}
        stroke="none"
      />
    ))}
  </div>
);

// ── Sub-componente: tarjeta de una reseña recibida ─────────────
const TarjetaResena = ({ resena, esMia, onEditar }) => {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-card bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
          {resena.autorAvatar?.trim()
            ? <img src={resena.autorAvatar} alt="" className="h-full w-full object-cover" />
            : (resena.autorNombre || "?")[0].toUpperCase()
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">
            {resena.autorNombre || "Estudiante UNP"}
          </p>
          <Estrellas valor={resena.estrellas} />
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-ink/40">
          {formatearFecha(resena.fechaEdicion || resena.fecha)}
          {resena.fechaEdicion ? " · editada" : ""}
        </span>

        {esMia && (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label="Opciones de reseña"
              className="flex h-6 w-6 items-center justify-center rounded-full text-ink/40 hover:bg-background"
            >
              <MoreVertical size={15} />
            </button>
            {menuAbierto && (
              <div className="absolute right-0 top-7 z-20 min-w-[160px] overflow-hidden rounded-btn bg-card shadow-softLg">
                <button
                  onClick={() => { setMenuAbierto(false); onEditar?.(); }}
                  className="w-full px-4 py-2.5 text-left text-[13px] font-semibold text-ink hover:bg-background"
                >
                  Editar mi reseña
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {resena.comentario?.trim() && (
        <p className="text-[13px] font-semibold leading-relaxed text-ink/70">
          {resena.comentario}
        </p>
      )}
    </div>
  );
};

// ── Componente principal ─────────────────────────────────────
const Vendedor = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const uid            = searchParams.get("uid");

  // ✅ FASE 2: useAuth reemplaza el onAuthStateChanged local
  // 🔧 Auditoría UI/UX: se agrega `perfil` (doc de Firestore) porque
  // `user.displayName` / `user.photoURL` son los datos CRUDOS de Google,
  // que quedan desactualizados en cuanto alguien edita su nombre o foto
  // en /perfil. Todo lo que se escribe hacia afuera (chat, notificaciones,
  // reseñas) debe usar `perfil`, con `user` solo como último fallback.
  const { user, perfil } = useAuth();

  const [vendedor,   setVendedor]   = useState(null);
  const [productos,  setProductos]  = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [noExiste,   setNoExiste]   = useState(false);
  const [esSeguidor, setEsSeguidor] = useState(false);

  // 🔒 Número real de WhatsApp: viene SOLO de /usuarios/{uid}/privado/contacto,
  // nunca del documento público del vendedor. Se usa exclusivamente para
  // construir el enlace de "Contactar por WhatsApp" — jamás se pinta en pantalla.
  const [contactoPrivado, setContactoPrivado] = useState(null);
  const [iniciandoChat,   setIniciandoChat]   = useState(false);

  // ── Fase 3 (Opción B): reseña única/editable por vendedor ──
  const [toasts, setToasts] = useState([]);
  const mostrarToast        = useToast(setToasts);

  const [resenas, setResenas]           = useState([]);
  const [miResena, setMiResena]         = useState(null);
  const [cargandoResenas, setCargandoResenas] = useState(true);
  const [modalResenaAbierto, setModalResenaAbierto] = useState(false);

  const esPropio = !!user && user.uid === uid;

  const cargarResenas = async () => {
    if (!uid) return;
    setCargandoResenas(true);
    try {
      const [lista, mia] = await Promise.all([
        obtenerResenasDeVendedor(uid),
        user?.uid ? obtenerMiResena(uid, user.uid) : Promise.resolve(null),
      ]);
      setResenas(lista);
      setMiResena(mia);
    } finally {
      setCargandoResenas(false);
    }
  };

  useEffect(() => {
    cargarResenas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, user?.uid]);

  useEffect(() => {
    if (!uid) navigate("/", { replace: true });
  }, [uid, navigate]);

  useEffect(() => {
    if (!uid) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      try {
        let datosVendedor = await obtenerPerfilVendedor(uid);
        if (cancelado) return;

        if (datosVendedor && user && Array.isArray(datosVendedor.seguidores)) {
          setEsSeguidor(datosVendedor.seguidores.includes(user.uid));
        }

        const lista = await obtenerProductosPorVendedor(uid);
        if (cancelado) return;

        if (!datosVendedor && lista.length > 0) {
          const primer = lista[0];
          datosVendedor = {
            nombre:   primer.vendedorNombre || primer.vendedor || "Vendedor UNP",
            avatar:   primer.avatarVendedor || "",
            bio:      "Estudiante de la UNP",
            acercaDe: "¡Hola! Bienvenido a mi tienda.",
            ubicacion: "Piura",
          };
        }

        if (!datosVendedor) { setNoExiste(true); return; }

        setVendedor(datosVendedor);
        setProductos(lista);

        // 🔒 El contacto privado exige sesión iniciada (regla de Firestore).
        // Si falla o el usuario no está logueado, obtenerContactoPrivado
        // resuelve null y simplemente no se muestra el botón de WhatsApp.
        if (user) {
          const contacto = await obtenerContactoPrivado(uid);
          if (!cancelado) setContactoPrivado(contacto);
        } else if (!cancelado) {
          setContactoPrivado(null);
        }
      } catch (err) {
        console.error(err);
        if (!cancelado) setNoExiste(true);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => { cancelado = true; };
  }, [uid, user]);

  const handleVerDetalle = (id) => navigate(`/producto?id=${id}`);

  // Tras crear/editar una reseña: refrescar el badge de reputación
  // del header (vive en `vendedor`) y la lista de opiniones.
  const handleResenaGuardada = async () => {
    try {
      const datosActualizados = await obtenerPerfilVendedor(uid);
      if (datosActualizados) setVendedor((prev) => ({ ...prev, ...datosActualizados }));
    } catch (err) {
      console.error(err);
    }
    cargarResenas();
  };

  const handleAbrirModalResena = () => {
    if (!user) { navigate("/login"); return; }
    setModalResenaAbierto(true);
  };

  const handleChatInterno = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (!uid || uid === user.uid || iniciandoChat) return;

    setIniciandoChat(true);
    try {
      const chat = await obtenerOCrearChat(user.uid, uid, {
        compradorNombre: perfil?.nombre || user.displayName,
        compradorAvatar: perfil?.avatar || user.photoURL,
        vendedorNombre:  vendedor?.nombre,
        vendedorAvatar:  vendedor?.avatar,
      });
      navigate(`/chat?id=${chat.id}`);
    } catch (err) {
      console.error(err);
      mostrarToast(err.message || "No se pudo abrir el chat");
    } finally {
      setIniciandoChat(false);
    }
  };

  const handleToggleSeguir = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      if (esSeguidor) {
        await dejarDeSeguirVendedor(uid, user.uid);
        setEsSeguidor(false);
      } else {
        await seguirVendedor(uid, user.uid);
        setEsSeguidor(true);
        await crearNotificacion({
          paraUid:  uid,
          deUid:    user.uid,
          deNombre: perfil?.nombre || user.displayName,
          tipo:     "seguidor",
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (cargando) return <Spinner mensaje="Cargando perfil del vendedor..." />;

  if (noExiste || !vendedor) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background font-sans">
      <span className="text-5xl">🚫</span>
      <p className="text-lg font-bold text-ink">Vendedor no encontrado</p>
      <button
        onClick={() => navigate("/")}
        className="rounded-btn bg-primary px-6 py-3 text-sm font-bold text-white"
      >
        Volver al inicio
      </button>
    </div>
  );

  const v = vendedor;

  // 🔧 El banner de reputación usaba v.totalResenas / v.calificacionPromedio
  // — campos guardados aparte en el doc del vendedor — mientras que la
  // sección "Opiniones" carga las reseñas reales de /resenas. Si esos
  // campos se desincronizan (ej. dos calificaciones casi simultáneas
  // pisándose el contador), el banner podía decir "Sin reseñas todavía"
  // aunque abajo sí aparecieran reseñas. Ahora el banner se calcula
  // directamente de `resenas`, la MISMA lista que se muestra debajo,
  // así los dos siempre coinciden. Mientras carga, usamos el valor
  // guardado como estimado optimista para evitar un parpadeo a "0".
  const totalResenasReal = cargandoResenas
    ? (v.totalResenas || 0)
    : resenas.length;
  const promedioReal = cargandoResenas
    ? (v.calificacionPromedio || 0)
    : (resenas.length > 0
        ? Math.round((resenas.reduce((acc, r) => acc + (r.estrellas || 0), 0) / resenas.length) * 10) / 10
        : 0);

  return (
    <div className="app-shell font-sans pb-24">

      {/* CABECERA — Azul profundo, o imagen de portada tal cual (sin overlay) */}
      <div
        className="relative flex min-h-[300px] w-full flex-col items-center justify-center overflow-hidden rounded-b-[32px] bg-gradient-to-b from-primary to-primary-dark px-6 pb-10 pt-14"
        style={v.portada?.trim() ? { backgroundImage: `url('${v.portada}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="relative z-[5] flex w-full flex-col items-center gap-2">
          <div className="relative mb-1">
            <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-primary-dark text-3xl font-bold text-white shadow-softLg">
              {v.avatar?.trim()
                ? <img src={v.avatar} alt={v.nombre} className="h-full w-full object-cover" />
                : (v.nombre || "V")[0].toUpperCase()
              }
            </div>
            {esPropio && (
              <button
                onClick={() => navigate("/perfil", { state: { abrirModalEdicion: true } })}
                aria-label="Editar mi perfil"
                className="absolute bottom-0.5 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-orange-500 text-white shadow-soft"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>

          <h1 className="text-center text-2xl font-extrabold text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.4)]">
            {v.nombre || "Vendedor UNP"}
          </h1>
          <p className="text-[13px] font-bold uppercase tracking-wide text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
            {v.bio || "Estudiante de la UNP"}
          </p>

          {/* Reputación: promedio de estrellas + total de reseñas.
              Calculado a partir de `resenas` (la misma lista de abajo),
              no del contador guardado aparte — ver nota más arriba. */}
          <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-chip bg-white/15 px-3 py-1 text-[13px] font-extrabold text-white">
            {totalResenasReal > 0 ? (
              <>
                <Star size={14} fill="#f5a623" stroke="none" />
                {promedioReal.toFixed(1)}
                <span className="font-bold opacity-80">({totalResenasReal})</span>
              </>
            ) : (
              <span className="font-bold opacity-85">Sin reseñas todavía</span>
            )}
          </div>

          <div className="mt-1 inline-flex items-center gap-1.5 rounded-chip border border-white/40 bg-white/20 px-3.5 py-1.5 text-[12px] font-bold text-white backdrop-blur">
            <CheckCircle2 size={14} />
            Estudiante verificado
          </div>
        </div>
      </div>

      {/* UBICACIÓN + MÉTODOS DE PAGO */}
      <div className="relative z-10 -mt-5 flex gap-3 px-4">
        <div className="flex flex-1 items-center gap-2 rounded-card bg-card px-4 py-3.5 shadow-soft">
          <MapPin size={18} className="shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold leading-tight text-ink">
              {v.ubicacion || "Piura"}
            </p>
            <p className="text-[11px] font-semibold text-ink/50">UNP – Piura</p>
          </div>
        </div>

        {(v.aceptaYape || v.aceptaPlin) && (
          <div className="flex items-center justify-center gap-2.5 rounded-card bg-card px-4 py-3.5 shadow-soft">
            {v.aceptaYape && <img src={YAPE_PLACEHOLDER} alt="Yape" className="h-8 w-8 rounded-full object-cover" />}
            {v.aceptaYape && v.aceptaPlin && <span className="h-6 w-px bg-ink/10" />}
            {v.aceptaPlin && <img src={PLIN_PLACEHOLDER} alt="Plin" className="h-8 w-8 rounded-full object-cover" />}
          </div>
        )}
      </div>

      {/* ACERCA DE */}
      <div className="px-4 pb-4 pt-4">
        <div className="rounded-card bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageCircle size={16} className="text-primary" />
            <span className="text-sm font-bold text-ink">Acerca de mí</span>
          </div>
          <p className="text-[13px] font-semibold leading-relaxed text-ink/70">
            {v.acercaDe || "¡Hola! Bienvenido a mi tienda."}
          </p>
        </div>
      </div>

      {/* CONTACTO: CHAT INTERNO + WHATSAPP */}
      <div className="flex flex-col gap-2.5 px-4 pb-5">
        {user?.uid !== uid && (
          <button
            onClick={handleChatInterno}
            disabled={iniciandoChat}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-ink py-3.5 text-[15px] font-extrabold text-white disabled:opacity-70"
          >
            <MessageCircle size={20} />
            {iniciandoChat ? "Abriendo chat..." : "Chat interno"}
          </button>
        )}

        {/* El número real solo llega desde /usuarios/{uid}/privado/contacto,
            jamás se imprime como texto: únicamente arma el enlace de WhatsApp. */}
        {contactoPrivado?.telefono && (
          <a
            href={`https://wa.me/51${String(contactoPrivado.telefono).replace(/\s+/g, "")}?text=${encodeURIComponent(`Hola ${v.nombre || "vendedor"}, vi tu perfil en TuCampus y me gustaría hacerte una consulta.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-[#287653] py-3.5 text-[15px] font-extrabold text-white shadow-soft"
          >
            <MessageCircle size={20} />
            Contactar por WhatsApp
          </a>
        )}
      </div>

      {/* SEGUIR / DEJAR DE SEGUIR */}
      <div className="flex gap-2.5 px-4 pb-3">
        {esSeguidor ? (
          <button
            onClick={handleToggleSeguir}
            className="flex-1 rounded-btn border-2 border-ink/15 py-3 text-[14px] font-extrabold text-ink/60"
          >
            Siguiendo
          </button>
        ) : (
          <button
            onClick={handleToggleSeguir}
            className="flex-1 rounded-btn bg-ink py-3.5 text-[14px] font-extrabold text-white"
          >
            Seguir Vendedor
          </button>
        )}

        {/* Calificar / editar reseña — oculto si estás viendo tu propio perfil */}
        {user?.uid !== uid && (
          <button
            onClick={handleAbrirModalResena}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-btn py-3 text-[14px] font-extrabold ${
              miResena
                ? "border-2 border-[#287653] bg-white text-[#287653]"
                : "bg-[#287653] text-white"
            }`}
          >
            <Star size={15} fill="currentColor" />
            {miResena ? "Editar mi reseña" : "Calificar vendedor"}
          </button>
        )}
      </div>

      {/* OPINIONES */}
      <div className="px-4 pb-5">
        <div className="mb-3 flex items-center gap-2 border-b-2 border-[#287653]/25 pb-2.5">
          <Star size={16} className="text-[#287653]" fill="#287653" />
          <span className="text-[15px] font-extrabold text-[#287653]">
            Opiniones {resenas.length > 0 ? `(${resenas.length})` : ""}
          </span>
        </div>
        {cargandoResenas ? (
          <Spinner mensaje="Cargando opiniones..." fullScreen={false} />
        ) : resenas.length === 0 ? (
          <p className="py-4 text-center text-[13px] font-bold text-ink/50">
            Todavía no tiene reseñas. ¡Sé el primero en calificarlo!
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {resenas.map((r) => (
              <TarjetaResena
                key={r.id}
                resena={r}
                esMia={r.autorUid === user?.uid}
                onEditar={handleAbrirModalResena}
              />
            ))}
          </div>
        )}
      </div>

      {/* PUBLICACIONES */}
      <div className="px-4 pb-5">
        <div className="mb-3 flex items-center justify-between border-b-2 border-[#287653]/25 pb-2.5">
          <div className="flex items-center gap-2">
            <LayoutGrid size={16} className="text-[#287653]" />
            <span className="text-[15px] font-extrabold text-[#287653]">Publicaciones Activas</span>
          </div>
        </div>
        {productos.length === 0 ? (
          <p className="py-5 text-center text-[13px] font-bold text-ink/50">
            Este vendedor aún no tiene publicaciones.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {productos.map((prod) => (
              <ProductCard key={prod.id} producto={prod} onVerDetalle={handleVerDetalle} />
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <BotonNotificaciones />
      <BottomNav />

      <ToastContainer toasts={toasts} />

      {/* MODAL DE RESEÑA */}
      <ModalResena
        abierto={modalResenaAbierto}
        onCerrar={() => setModalResenaAbierto(false)}
        vendedorUid={uid}
        vendedorNombre={v.nombre}
        miUid={user?.uid}
        miNombre={perfil?.nombre || user?.displayName}
        miAvatar={perfil?.avatar || user?.photoURL}
        resenaExistente={miResena}
        onToast={mostrarToast}
        onGuardado={handleResenaGuardada}
      />
    </div>
  );
};

export default Vendedor;