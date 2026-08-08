// src/pages/Vendedor.jsx
import { useState, useEffect }         from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth }                     from "../context/AuthContext";
import { crearNotificacion }           from "../services/notificationService";
import {
  obtenerPerfilVendedor,
  obtenerProductosPorVendedor,
  seguirVendedor,
  dejarDeSeguirVendedor,
} from "../services/userService";
import {
  obtenerMiResena,
  obtenerResenasDeVendedor,
} from "../services/reviewService";
import Spinner    from "../components/Spinner";
import BottomNav   from "../components/BottomNav";
import ModalResena from "../components/ModalResena";
import { ToastContainer, useToast } from "../components/Toast";

const ICONOS_CAT = {
  dulces: "🍫", bebidas: "☕", salados: "🍔",
  servicios: "🔧", materiales: "📚",
};

const formatearFecha = (fecha) => {
  if (!fecha?.toDate) return "";
  return fecha.toDate().toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

// ── Sub-componente: estrellas (solo lectura) ──────────────────
const Estrellas = ({ valor, size = 13 }) => (
  <div style={{ display: "inline-flex", gap: "1px" }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <svg key={n} viewBox="0 0 24 24" width={size} height={size}
        fill={n <= Math.round(valor || 0) ? "#f5a623" : "#e0e0e6"}>
        <polygon points="12 2 15.09 8.63 22 9.24 16.5 13.97 18.18 21 12 17.27 5.82 21 7.5 13.97 2 9.24 8.91 8.63 12 2" />
      </svg>
    ))}
  </div>
);

// ── Sub-componente: tarjeta de una reseña recibida ─────────────
const TarjetaResena = ({ resena }) => (
  <div style={{
    background: "white", borderRadius: "14px", padding: "14px 16px",
    border: "1.5px solid #e8e8f0", display: "flex", flexDirection: "column", gap: "6px",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{
        width: "32px", height: "32px", borderRadius: "50%",
        background: "linear-gradient(135deg,#c8a97a,#a07850)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.85rem", fontWeight: 700, color: "white",
        overflow: "hidden", flexShrink: 0,
      }}>
        {resena.autorAvatar?.trim()
          ? <img src={resena.autorAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : (resena.autorNombre || "?")[0].toUpperCase()
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.85rem", color: "var(--azul-oscuro)" }}>
          {resena.autorNombre || "Estudiante UNP"}
        </p>
        <Estrellas valor={resena.estrellas} />
      </div>
      <span style={{ fontSize: "0.7rem", color: "#a0a5b9", fontWeight: 600, flexShrink: 0 }}>
        {formatearFecha(resena.fechaEdicion || resena.fecha)}
        {resena.fechaEdicion ? " · editada" : ""}
      </span>
    </div>
    {resena.comentario?.trim() && (
      <p style={{ margin: 0, fontSize: "0.85rem", color: "#5c5c7a", fontWeight: 600, lineHeight: 1.5 }}>
        {resena.comentario}
      </p>
    )}
  </div>
);

// ── Sub-componente: tarjeta de producto (solo lectura) ───────
const TarjetaVendedor = ({ producto, onVerDetalle }) => {
  const { id, titulo, precio, imagen, categoria, vendedorNombre, vendedor, avatarVendedor, estado } = producto;
  const agotado    = (estado || "").toLowerCase() === "agotado";
  const emoji      = ICONOS_CAT[(categoria || "").toLowerCase()] || "📦";
  const nombreVend = vendedorNombre || vendedor || "Vendedor UNP";

  return (
    <article
      onClick={() => onVerDetalle(id)}
      style={{
        background: "white", borderRadius: "18px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
        overflow: "hidden", cursor: "pointer",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{
        position: "relative", height: "160px",
        background: "linear-gradient(135deg,#c8a97a,#a07850)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {imagen?.trim() ? (
          <img src={imagen} alt={titulo}
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: agotado ? "grayscale(50%) brightness(0.9)" : "none" }}
          />
        ) : (
          <span style={{ fontSize: "2.5rem" }}>{emoji}</span>
        )}
        <span style={{
          position: "absolute", bottom: "10px", right: "10px",
          background: agotado ? "#555" : "rgba(0,0,0,0.70)",
          color: "white", fontWeight: 700, fontSize: "0.82rem",
          padding: "4px 10px", borderRadius: "20px", backdropFilter: "blur(4px)",
        }}>
          S/ {(precio || 0).toFixed(2)}
        </span>
        {agotado && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%) rotate(-10deg)",
            background: "#ff4d6d", color: "white", fontWeight: 700,
            fontSize: "0.95rem", padding: "4px 10px", borderRadius: "6px",
            border: "2px solid white", zIndex: 5,
          }}>
            AGOTADO
          </div>
        )}
      </div>
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <p style={{
          margin: 0, fontWeight: 600, fontSize: "0.92rem", lineHeight: 1.3,
          color: agotado ? "#999" : "var(--azul-oscuro)",
          textDecoration: agotado ? "line-through" : "none",
        }}>
          {titulo || "Sin título"}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{
            width: "22px", height: "22px", borderRadius: "50%",
            background: "linear-gradient(135deg,#c8a97a,#a07850)",
            overflow: "hidden", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px", color: "white", fontWeight: 600,
          }}>
            {avatarVendedor?.trim()
              ? <img src={avatarVendedor} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (nombreVend || "?")[0].toUpperCase()
            }
          </div>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#5c5c7a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nombreVend}
          </span>
        </div>
      </div>
    </article>
  );
};

// ── Componente principal ─────────────────────────────────────
const Vendedor = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const uid            = searchParams.get("uid");

  // ✅ FASE 2: useAuth reemplaza el onAuthStateChanged local
  const { user } = useAuth();

  const [vendedor,   setVendedor]   = useState(null);
  const [productos,  setProductos]  = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [noExiste,   setNoExiste]   = useState(false);
  const [esSeguidor, setEsSeguidor] = useState(false);

  // ── Fase 3 (Opción B): reseña única/editable por vendedor ──
  const [toasts, setToasts] = useState([]);
  const mostrarToast        = useToast(setToasts);

  const [resenas, setResenas]           = useState([]);
  const [miResena, setMiResena]         = useState(null);
  const [cargandoResenas, setCargandoResenas] = useState(true);
  const [modalResenaAbierto, setModalResenaAbierto] = useState(false);

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
          deNombre: user.displayName,
          tipo:     "seguidor",
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (cargando) return <Spinner mensaje="Cargando perfil del vendedor..." />;

  if (noExiste || !vendedor) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", gap: "16px",
      fontFamily: "'Nunito', sans-serif", background: "var(--bg-crema)" }}>
      <span style={{ fontSize: "3rem" }}>🚫</span>
      <p style={{ fontWeight: 600, color: "var(--azul-oscuro)", fontSize: "1.1rem" }}>Vendedor no encontrado</p>
      <button onClick={() => navigate("/")} style={{
        background: "var(--verde-marca)", color: "white", border: "none",
        padding: "12px 24px", borderRadius: "12px", fontWeight: 600,
        fontSize: "0.95rem", cursor: "pointer", fontFamily: "'Nunito', sans-serif",
      }}>
        Volver al inicio
      </button>
    </div>
  );

  const v = vendedor;

  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", paddingBottom: "90px" }}>

      {/* CABECERA — Banner con imagen de portada */}
      <div className="up-header" style={{
        position: "relative", width: "100%", minHeight: "280px",
        background: v.portada?.trim()
          ? `url('${v.portada}') center/cover no-repeat`
          : "linear-gradient(135deg,#c8a97a 0%,#a07850 100%)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "60px 20px 30px", boxSizing: "border-box",
      }}>
        <div style={{ position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%)", zIndex: 1 }} />

        <button onClick={() => navigate(-1)} aria-label="Volver" style={{
          position: "absolute", top: "16px", left: "16px", zIndex: 10,
          width: "38px", height: "38px", borderRadius: "50%",
          background: "rgba(0,0,0,0.35)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", color: "white",
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "100%" }}>
          <div style={{
            width: "90px", height: "90px", borderRadius: "50%",
            border: "3px solid white", boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            background: "linear-gradient(135deg,#c8a97a,#a07850)", overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2.5rem", fontWeight: 700, color: "white", marginBottom: "4px",
          }}>
            {v.avatar?.trim()
              ? <img src={v.avatar} alt={v.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (v.nombre || "V")[0].toUpperCase()
            }
          </div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "white", textAlign: "center" }}>
            {v.nombre || "Vendedor UNP"}
          </h1>
          <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
            {v.bio || "Estudiante de la UNP"}
          </p>
          {/* Fase 3 — Reputación: promedio de estrellas + total de reseñas */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            background: "rgba(255,255,255,0.15)", color: "white",
            padding: "4px 12px", borderRadius: "20px",
            fontSize: "0.82rem", fontWeight: 800, marginTop: "2px",
          }}>
            {v.totalResenas > 0 ? (
              <>
                <span style={{ color: "#f5a623" }}>⭐</span>
                {(v.calificacionPromedio || 0).toFixed(1)}
                <span style={{ opacity: 0.8, fontWeight: 700 }}>({v.totalResenas})</span>
              </>
            ) : (
              <span style={{ opacity: 0.85, fontWeight: 700 }}>Sin reseñas todavía</span>
            )}
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "rgba(255,255,255,0.2)", color: "white",
            border: "1px solid rgba(255,255,255,0.4)",
            padding: "5px 14px", borderRadius: "20px",
            fontSize: "0.8rem", fontWeight: 600, marginTop: "4px", backdropFilter: "blur(4px)",
          }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Estudiante verificado
          </div>
        </div>
      </div>

      {/* UBICACIÓN */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 20px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 20px", background: "white", borderRadius: "24px",
          border: "1px solid rgba(15, 37, 64, 0.06)", boxShadow: "0 4px 12px rgba(15, 37, 64, 0.04)",
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--verde-marca)" strokeWidth="2.2" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--azul-oscuro)" }}>
            {v.ubicacion || "Piura"}
          </span>
        </div>
      </div>

      {/* ACERCA DE */}
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ background: "white", borderRadius: "16px", border: "1.5px solid #e8e8f0", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--verde-marca)" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--azul-oscuro)" }}>Acerca de mí</span>
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "#5c5c7a", fontWeight: 600, lineHeight: 1.5 }}>
            {v.acercaDe || "¡Hola! Bienvenido a mi tienda."}
          </p>
        </div>
      </div>

      {/* CONTACTAR POR WHATSAPP */}
      {v.telefono && (
        <div style={{ padding: "0 16px 20px" }}>
          <a
            href={`https://wa.me/51${String(v.telefono).replace(/\s+/g, "")}?text=${encodeURIComponent(`Hola ${v.nombre || "vendedor"}, vi tu perfil en Mercado UNP y me gustaría hacerte una consulta.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              background: "var(--verde-marca)", color: "white", textDecoration: "none",
              padding: "14px", borderRadius: "14px", fontWeight: 800, fontSize: "1rem",
              boxShadow: "0 4px 12px rgba(46, 107, 78, 0.25)", fontFamily: "'Nunito', sans-serif",
              width: "100%", boxSizing: "border-box",
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            Contactar por WhatsApp
          </a>
        </div>
      )}

      {/* SEGUIR / DEJAR DE SEGUIR */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: "10px" }}>
        {esSeguidor ? (
          <button onClick={handleToggleSeguir} style={{
            flex: 1, background: "transparent", color: "#5c5c7a", border: "2px solid #c3c6d4",
            padding: "12px", borderRadius: "14px", fontWeight: 800,
            cursor: "pointer", fontFamily: "'Nunito', sans-serif",
          }}>
            Siguiendo
          </button>
        ) : (
          <button onClick={handleToggleSeguir} style={{
            flex: 1, background: "var(--azul-oscuro)", color: "white", border: "none",
            padding: "14px", borderRadius: "14px", fontWeight: 800,
            cursor: "pointer", fontFamily: "'Nunito', sans-serif",
          }}>
            Seguir Vendedor
          </button>
        )}

        {/* Calificar / editar reseña — oculto si estás viendo tu propio perfil */}
        {user?.uid !== uid && (
          <button onClick={handleAbrirModalResena} style={{
            flex: 1, background: miResena ? "white" : "var(--verde-marca)",
            color: miResena ? "var(--verde-marca)" : "white",
            border: miResena ? "2px solid var(--verde-marca)" : "none",
            padding: "12px", borderRadius: "14px", fontWeight: 800,
            cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}>
            ⭐ {miResena ? "Editar mi reseña" : "Calificar vendedor"}
          </button>
        )}
      </div>

      {/* OPINIONES */}
      <div style={{ padding: "0 16px 20px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          marginBottom: "12px", paddingBottom: "10px", borderBottom: "2px solid var(--verde-marca)",
        }}>
          <span style={{ fontSize: "16px" }}>⭐</span>
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--verde-marca)" }}>
            Opiniones {resenas.length > 0 ? `(${resenas.length})` : ""}
          </span>
        </div>
        {cargandoResenas ? (
          <Spinner mensaje="Cargando opiniones..." fullScreen={false} />
        ) : resenas.length === 0 ? (
          <p style={{ textAlign: "center", color: "#5c5c7a", fontWeight: 700, padding: "16px 0" }}>
            Todavía no tiene reseñas. ¡Sé el primero en calificarlo!
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {resenas.map((r) => <TarjetaResena key={r.id} resena={r} />)}
          </div>
        )}
      </div>

      {/* PUBLICACIONES */}
      <div style={{ padding: "0 16px 20px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          marginBottom: "12px", paddingBottom: "10px", borderBottom: "2px solid var(--verde-marca)",
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--verde-marca)" strokeWidth="2.2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--verde-marca)" }}>Publicaciones Activas</span>
        </div>
        {productos.length === 0 ? (
          <p style={{ textAlign: "center", color: "#5c5c7a", fontWeight: 700, padding: "20px 0" }}>
            Este vendedor aún no tiene publicaciones.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {productos.map((prod) => (
              <TarjetaVendedor key={prod.id} producto={prod} onVerDetalle={handleVerDetalle} />
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <BottomNav />

      <ToastContainer toasts={toasts} />

      {/* MODAL DE RESEÑA */}
      <ModalResena
        abierto={modalResenaAbierto}
        onCerrar={() => setModalResenaAbierto(false)}
        vendedorUid={uid}
        vendedorNombre={v.nombre}
        miUid={user?.uid}
        miNombre={user?.displayName}
        miAvatar={user?.photoURL}
        resenaExistente={miResena}
        onToast={mostrarToast}
        onGuardado={handleResenaGuardada}
      />
    </div>
  );
};

export default Vendedor;