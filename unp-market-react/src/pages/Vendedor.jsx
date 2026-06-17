// src/pages/Vendedor.jsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  doc, getDoc, collection, query, where, getDocs,
  updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../services/firebase";

const ICONOS_CAT = {
  dulces: "🍫", bebidas: "☕", salados: "🍔",
  servicios: "🔧", materiales: "📚",
};

// ──────────────────────────────────────────────────────────────
//  Tarjeta solo lectura
// ──────────────────────────────────────────────────────────────
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
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              filter: agotado ? "grayscale(50%) brightness(0.9)" : "none",
            }}
          />
        ) : (
          <span style={{ fontSize: "2.5rem" }}>{emoji}</span>
        )}

        <span style={{
          position: "absolute", bottom: "10px", right: "10px",
          background: agotado ? "#555" : "rgba(0,0,0,0.70)",
          color: "white", fontWeight: 700,
          fontSize: "0.82rem", padding: "4px 10px",
          borderRadius: "20px", backdropFilter: "blur(4px)",
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
          margin: 0, fontWeight: 600, fontSize: "0.92rem", color: "var(--azul-oscuro)", lineHeight: 1.3,
          ...(agotado ? { color: "#999", textDecoration: "line-through" } : {}),
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
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#5c5c7a",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nombreVend}
          </span>
        </div>
      </div>
    </article>
  );
};

// ──────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────
const Vendedor = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const uid            = searchParams.get("uid");

  const [vendedor,  setVendedor]  = useState(null);
  const [productos, setProductos] = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [noExiste,  setNoExiste]  = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [esSeguidor,  setEsSeguidor]  = useState(false);

  useEffect(() => {
    if (!uid) navigate("/", { replace: true });
  }, [uid, navigate]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      try {
        const userSnap = await getDoc(doc(db, "usuarios", uid));
        if (cancelado) return;

        let datosVendedor = userSnap.exists() ? userSnap.data() : null;

        if (datosVendedor && currentUser && Array.isArray(datosVendedor.seguidores)) {
          setEsSeguidor(datosVendedor.seguidores.includes(currentUser.uid));
        }

        const q    = query(collection(db, "productos"), where("userUid", "==", uid));
        const snap = await getDocs(q);
        if (cancelado) return;

        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (!datosVendedor && lista.length > 0) {
          const primer = lista[0];
          datosVendedor = {
            nombre:    primer.vendedorNombre || primer.vendedor || "Vendedor UNP",
            avatar:    primer.avatarVendedor || "",
            bio:       "Estudiante de la UNP",
            acercaDe:  "¡Hola! Bienvenido a mi tienda.",
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
  }, [uid, currentUser]);

  const handleVerDetalle = (id) => navigate(`/producto?id=${id}`);

  const handleToggleSeguir = async () => {
    if (!currentUser) {
      alert('Debes iniciar sesión para seguir a un vendedor');
      return;
    }

    const vendedorRef = doc(db, "usuarios", uid);

    try {
      if (esSeguidor) {
        await updateDoc(vendedorRef, {
          seguidores: arrayRemove(currentUser.uid),
        });
        setEsSeguidor(false);
      } else {
        await updateDoc(vendedorRef, {
          seguidores: arrayUnion(currentUser.uid),
        });
        setEsSeguidor(true);

        await addDoc(collection(db, "notificaciones"), {
          paraUid: uid,
          deUid: currentUser.uid,
          deNombre: currentUser.displayName || "Un usuario",
          tipo: "seguidor",
          leido: false,
          timestamp: serverTimestamp(),
          productoTitulo: "tu perfil",
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (cargando) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", fontFamily: "'Nunito', sans-serif", fontWeight: 600,
      color: "#5c5c7a", background: "var(--bg-crema)" }}>
      Cargando perfil del vendedor...
    </div>
  );

  if (noExiste || !vendedor) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", gap: "16px",
      fontFamily: "'Nunito', sans-serif", background: "var(--bg-crema)" }}>
      <span style={{ fontSize: "3rem" }}>🚫</span>
      <p style={{ fontWeight: 600, color: "var(--azul-oscuro)", fontSize: "1.1rem" }}>
        Vendedor no encontrado
      </p>
      <button onClick={() => navigate("/")} style={{
        background: "var(--verde-marca)", color: "white", border: "none",
        padding: "12px 24px", borderRadius: "12px",
        fontWeight: 600, fontSize: "0.95rem", cursor: "pointer",
        fontFamily: "'Nunito', sans-serif",
      }}>
        Volver al inicio
      </button>
    </div>
  );

  const v = vendedor;

  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", paddingBottom: "90px" }}>

      {/* ════════════════════════════════════════════════════
           CABECERA — TODO ADENTRO DEL BANNER (Pixel-Perfect)
      ════════════════════════════════════════════════════ */}
      <div
        className="up-header"
        style={{
          position: "relative", width: "100%", minHeight: "280px",
          background: v.portada?.trim()
            ? `url('${v.portada}') center/cover no-repeat`
            : "linear-gradient(135deg,#c8a97a 0%,#a07850 100%)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "60px 20px 30px", boxSizing: "border-box"
        }}
      >
        {/* Capa oscura (Overlay) para que el texto blanco resalte */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%)",
          zIndex: 1
        }} />

        {/* Botón volver */}
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

        {/* CONTENEDOR CENTRAL: Avatar y textos centrados dentro del banner */}
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "100%" }}>
          
          {/* Avatar */}
          <div style={{
            width: "90px", height: "90px", borderRadius: "50%",
            border: "3px solid white", boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            background: "linear-gradient(135deg,#c8a97a,#a07850)", overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", fontWeight: 700, color: "white",
            marginBottom: "4px"
          }}>
            {v.avatar?.trim() ? <img src={v.avatar} alt={v.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (v.nombre || "V")[0].toUpperCase()}
          </div>

          {/* Textos */}
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "white", textAlign: "center", letterSpacing: "-0.5px" }}>
            {v.nombre || "Vendedor UNP"}
          </h1>
          <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
            {v.bio || "Estudiante de la UNP"}
          </p>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.4)",
            padding: "5px 14px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 600, marginTop: "4px", backdropFilter: "blur(4px)",
          }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Estudiante verificado
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
           UBICACIÓN (ESTILO BURBUJA)
      ════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", justifyContent: "center",
        background: "transparent", padding: "16px 20px",
      }}>
        <div style={{
          display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: "8px",
          padding: "10px 20px", background: "white", borderRadius: "24px",
          border: "1px solid rgba(15, 37, 64, 0.06)", boxShadow: "0 4px 12px rgba(15, 37, 64, 0.04)"
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
            stroke="var(--verde-marca)" strokeWidth="2.2" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--azul-oscuro)", margin: 0 }}>
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

      {/* BOTÓN CONTACTAR POR WHATSAPP (NUEVO) */}
      {v.telefono && (
        <div style={{ padding: "0 16px 20px" }}>
          <a
            href={`https://wa.me/51${String(v.telefono).replace(/\s+/g, '')}?text=${encodeURIComponent(`Hola ${v.nombre || 'vendedor'}, vi tu perfil en Mercado UNP y me gustaría hacerte una consulta.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              background: "var(--verde-marca)", color: "white", textDecoration: "none",
              padding: "14px", borderRadius: "14px", fontWeight: 800, fontSize: "1rem",
              boxShadow: "0 4px 12px rgba(46, 107, 78, 0.25)",
              fontFamily: "'Nunito', sans-serif",
              width: "100%", boxSizing: "border-box"
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            Contactar por WhatsApp
          </a>
        </div>
      )}

      {/* BOTÓN SEGUIR / SIGUIENDO VENDEDOR (NUEVO) */}
      <div style={{ padding: "0 16px 20px" }}>
        {esSeguidor ? (
          <button
            onClick={handleToggleSeguir}
            style={{
              background: "transparent",
              color: "#5c5c7a",
              border: "2px solid #c3c6d4",
              padding: "12px",
              borderRadius: "14px",
              fontWeight: 800,
              width: "100%",
              cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            Siguiendo
          </button>
        ) : (
          <button
            onClick={handleToggleSeguir}
            style={{
              background: "var(--azul-oscuro)",
              color: "white",
              border: "none",
              padding: "14px",
              borderRadius: "14px",
              fontWeight: 800,
              width: "100%",
              cursor: "pointer",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            Seguir Vendedor
          </button>
        )}
      </div>

      {/* PUBLICACIONES */}
      <div style={{ padding: "0 16px 20px" }}></div>

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
      <nav className="bottom-nav">
        <button className="nav-item" onClick={() => navigate("/")} aria-label="Inicio">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span className="nav-label">Inicio</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/?tab=favoritos")} aria-label="Favoritos">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span className="nav-label">Favoritos</span>
        </button>
        <button className="nav-item nav-add" onClick={() => navigate("/publicar")} aria-label="Publicar">
          <div className="nav-add-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span className="nav-label">Publicar</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/?tab=notifs")} aria-label="Notificaciones">
          <div className="nav-icon-wrap">
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <span className="nav-label">Notifs</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/perfil")} aria-label="Perfil">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span className="nav-label">Perfil</span>
        </button>
      </nav>

    </div>
  );
};

export default Vendedor;