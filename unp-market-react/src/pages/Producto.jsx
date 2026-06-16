// src/pages/Producto.jsx
// ============================================================
//  UNP Market — Detalle de Producto
//
//  Migra producto.html conservando layout y lógica exactos:
//    - useSearchParams para leer ?id=
//    - Fetch a Firestore (colección "productos")
//    - Botón Volver con useNavigate(-1)
//    - Imagen full-width + chip categoría superpuesto
//    - Panel blanco con border-radius (solapado sobre la imagen)
//    - Título + badge precio en la misma línea
//    - Badge "Verificado" amarillo
//    - Tarjeta vendedor (sin onClick — Perfil aún no migrado)
//    - Descripción con white-space: pre-wrap
//    - Botón Compartir (navigator.share + fallback clipboard)
//    - Bottom bar fija: corazón (favoritos localStorage) + WhatsApp
//    - Estado Agotado: overlay + botón WA deshabilitado
//    - Toast local auto-dismiss
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams }      from "react-router-dom";
import {
  doc, getDoc, setDoc,
  addDoc, collection, serverTimestamp,
} from "firebase/firestore";
import { db, auth }       from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";

// ──────────────────────────────────────────────────────────────
//  CONSTANTES
// ──────────────────────────────────────────────────────────────
const ICONOS_CAT = {
  dulces: "🍰", bebidas: "🥤", salados: "🍔",
  servicios: "🔧", materiales: "📚",
};

// ──────────────────────────────────────────────────────────────
//  UTILIDAD: leer / escribir favoritos en localStorage
// ──────────────────────────────────────────────────────────────
const getFavs  = ()       => JSON.parse(localStorage.getItem("listaFavoritos") || "[]");
const saveFavs = (favs)   => localStorage.setItem("listaFavoritos", JSON.stringify(favs));
const isFav    = (id)     => getFavs().includes(id);

// ──────────────────────────────────────────────────────────────
//  UTILIDAD: enviar notificación a Firestore (idéntica al original)
// ──────────────────────────────────────────────────────────────
const enviarNotificacion = async ({ paraUid, tipo, productoId, productoTitulo }) => {
  if (!paraUid) return;
  const perfil = JSON.parse(localStorage.getItem("unp_user_profile") || "{}");
  if (perfil.uid === paraUid) return;
  try {
    await addDoc(collection(db, "notificaciones"), {
      paraUid,
      deUid:          perfil.uid    || "anon",
      deNombre:       perfil.nombre || "Un usuario",
      tipo,
      productoId,
      productoTitulo: productoTitulo || "un producto",
      leido:          false,
      timestamp:      serverTimestamp(),
    });
  } catch (err) {
    console.warn("Notificación no enviada:", err);
  }
};

// ──────────────────────────────────────────────────────────────
//  SUB-COMPONENTE: Toast
// ──────────────────────────────────────────────────────────────
const Toast = ({ mensaje }) => (
  <div style={{
    background: "#1e293b", color: "white",
    padding: "14px 18px", borderRadius: "16px",
    fontSize: "13.5px", fontWeight: 700,
    boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
    textAlign: "center",
    fontFamily: "'Nunito', sans-serif",
  }}>
    {mensaje}
  </div>
);

// ──────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────
const Producto = () => {
  const navigate                  = useNavigate();
  const [searchParams]            = useSearchParams();
  const productoId                = searchParams.get("id");

  const [producto,   setProducto]   = useState(null);
  const [cargando,   setCargando]   = useState(true);
  const [noExiste,   setNoExiste]   = useState(false);
  const [esFavorito, setEsFavorito] = useState(false);
  const [toasts,     setToasts]     = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  // ── Guard sesión (para sincronizar favoritos a Firestore) ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, []);

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
        const snap = await getDoc(doc(db, "productos", productoId));
        if (cancelado) return;
        if (snap.exists()) {
          setProducto({ id: snap.id, ...snap.data() });
          setEsFavorito(isFav(snap.id));
        } else {
          setNoExiste(true);
        }
      } catch (err) {
        console.error(err);
        setNoExiste(true);
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => { cancelado = true; };
  }, [productoId]);

  // ── Toast helper ──
  const mostrarToast = useCallback((mensaje) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, mensaje }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // ── Toggle Favorito ──
  const handleFavorito = async () => {
    const favs    = getFavs();
    const eraFav  = favs.includes(productoId);
    const nuevos  = eraFav
      ? favs.filter((f) => f !== productoId)
      : [...favs, productoId];

    saveFavs(nuevos);
    setEsFavorito(!eraFav);
    mostrarToast(eraFav ? "Eliminado de favoritos" : "¡Guardado en favoritos! ❤️");

    // Sincronizar con Firestore si hay sesión activa
    const perfil = JSON.parse(localStorage.getItem("unp_user_profile") || "{}");
    if (perfil.uid) {
      try {
        await setDoc(doc(db, "usuarios", perfil.uid), { favoritos: nuevos }, { merge: true });
      } catch (err) {
        console.warn("Error al sincronizar favoritos:", err);
      }
    }

    if (!eraFav && producto?.userUid) {
      await enviarNotificacion({
        paraUid: producto.userUid, tipo: "favorito",
        productoId, productoTitulo: producto.titulo,
      });
    }
  };

  // ── WhatsApp ──
  const handleWhatsApp = async () => {
    if (!producto?.telefono) return;
    const num    = producto.telefono.replace(/\D/g, "");
    const final  = num.startsWith("51") ? num : "51" + num;
    const msg    = `¡Hola ${producto.vendedor || ""}! Vi tu publicación de "${producto.titulo}" en UNP Market y me gustaría comprarlo.`;
    window.open(`https://wa.me/${final}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");

    await enviarNotificacion({
      paraUid: producto.userUid, tipo: "contacto",
      productoId, productoTitulo: producto.titulo,
    });
  };

  // ── Compartir ──
  const handleCompartir = async () => {
    const url   = window.location.href;
    const datos = {
      title: `${producto?.titulo} — UNP Market`,
      text:  `Mira este producto en UNP Market: ${producto?.titulo} a S/ ${(producto?.precio || 0).toFixed(2)}`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(datos); }
      catch (err) { if (err.name !== "AbortError") console.warn(err); }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        mostrarToast("¡Link copiado al portapapeles! 🔗");
      } catch {
        mostrarToast("Copia este link: " + url);
      }
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  ESTADO: Cargando
  // ──────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        height: "100vh", color: "#5c5c7a", fontWeight: 800,
        fontFamily: "'Nunito', sans-serif", background: "#f7f8fc",
      }}>
        Cargando producto...
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  ESTADO: No existe
  // ──────────────────────────────────────────────────────────────
  if (noExiste || !producto) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: "center", height: "100vh", gap: "16px",
        fontFamily: "'Nunito', sans-serif", background: "#f7f8fc",
      }}>
        <span style={{ fontSize: "3rem" }}>🚫</span>
        <p style={{ fontWeight: 800, color: "#1a1a2e", fontSize: "1.1rem" }}>
          Este producto ya no está disponible
        </p>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "#3a7d44", color: "white", border: "none",
            padding: "12px 24px", borderRadius: "12px",
            fontWeight: 800, fontSize: "0.95rem", cursor: "pointer",
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Derivados
  // ──────────────────────────────────────────────────────────────
  const {
    titulo, precio, imagen, categoria, descripcion,
    vendedor: nombreVendedor = "Vendedor UNP",
    avatarVendedor, telefono, estado,
  } = producto;

  const estaAgotado    = (estado || "").toLowerCase() === "agotado";
  const tieneWA        = telefono && telefono.trim().length >= 7;
  const emoji          = ICONOS_CAT[(categoria || "").toLowerCase()] || "📦";

  // ──────────────────────────────────────────────────────────────
  //  RENDER PRINCIPAL
  // ──────────────────────────────────────────────────────────────
  return (
    <div
      className="app-shell"
      style={{ background: "#f7f8fc", paddingBottom: "90px", position: "relative" }}
    >

      {/* ── IMAGEN PRINCIPAL ── */}
      <div
        id="image-container"
        style={{
          position: "relative", width: "100%", height: "320px",
          background: imagen?.trim()
            ? "#e8e8f0"
            : "linear-gradient(135deg,#c8a97a 0%,#a07850 100%)",
          overflow: "hidden",
        }}
      >
        {/* Botón Volver — flotante */}
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{
            position: "absolute", top: "20px", left: "20px", zIndex: 10,
            width: "40px", height: "40px",
            background: "rgba(255,255,255,0.9)", borderRadius: "50%",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#1a1a2e", boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {/* Imagen o placeholder emoji */}
        {imagen?.trim() ? (
          <img
            src={imagen}
            alt={titulo}
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              filter: estaAgotado ? "grayscale(60%) brightness(0.85)" : "none",
            }}
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "5rem",
          }}>
            {emoji}
          </div>
        )}

        {/* Overlay AGOTADO */}
        {estaAgotado && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(255,255,255,0.45)",
            backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 5,
          }}>
            <span style={{
              background: "#1a1a2e", color: "white", fontWeight: 900,
              padding: "10px 24px", borderRadius: "20px",
              fontSize: "1.1rem", letterSpacing: "1px",
              transform: "rotate(-5deg)",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            }}>
              AGOTADO
            </span>
          </div>
        )}

        {/* Chip Categoría — esquina inferior izquierda */}
        <span style={{
          position: "absolute", bottom: "35px", left: "20px",
          background: "rgba(0,0,0,0.6)", color: "white",
          padding: "6px 14px", borderRadius: "20px",
          fontSize: "0.8rem", fontWeight: 800,
          textTransform: "uppercase", backdropFilter: "blur(4px)",
          zIndex: 6,
        }}>
          {categoria || "Sin categoría"}
        </span>
      </div>

      {/* ── PANEL BLANCO (solapado sobre imagen) ── */}
      <div style={{
        background: "white",
        borderRadius: "30px 30px 0 0",
        marginTop: "-30px",
        position: "relative", zIndex: 10,
        padding: "25px 20px",
      }}>

        {/* Título + Precio */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
          <h1 style={{
            fontSize: "1.35rem", fontWeight: 900, color: "#1a1a2e",
            margin: 0, lineHeight: 1.3,
          }}>
            {titulo}
          </h1>
          <div style={{
            background: "#e6faf0", color: "#16a34a",
            padding: "6px 12px", borderRadius: "12px",
            fontWeight: 900, fontSize: "1.1rem", whiteSpace: "nowrap",
          }}>
            S/ {(precio || 0).toFixed(2)}
          </div>
        </div>

        {/* Badge Verificado */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          background: "#fffbeb", color: "#d97706",
          padding: "5px 12px", borderRadius: "12px",
          fontSize: "0.75rem", fontWeight: 800, marginTop: "12px",
        }}>
          <span style={{
            width: "6px", height: "6px",
            background: "#f59e0b", borderRadius: "50%",
          }}/>
          Verificado
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #f1f3f5", margin: "20px 0" }} />

        {/* Tarjeta Vendedor — clic navega a su perfil público */}
        <div
          onClick={() => { if (producto.userUid) navigate(`/vendedor?uid=${producto.userUid}`); }}
          style={{
            background: "#f7f8fc", border: "1.5px solid #e8e8f0",
            borderRadius: "16px", padding: "12px 15px",
            display: "flex", alignItems: "center", gap: "12px",
            cursor: producto.userUid ? "pointer" : "default",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (producto.userUid) e.currentTarget.style.background = "#eef0f5"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#f7f8fc"; }}
        >
          {/* Avatar */}
          <div style={{
            width: "44px", height: "44px", borderRadius: "50%",
            background: "linear-gradient(135deg,#c8a97a,#a07850)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.2rem", fontWeight: 900, color: "white",
            overflow: "hidden", flexShrink: 0,
          }}>
            {avatarVendedor?.trim() ? (
              <img
                src={avatarVendedor}
                alt={nombreVendedor}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              (nombreVendedor || "?")[0].toUpperCase()
            )}
          </div>

          {/* Info vendedor */}
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: 0, fontSize: "0.95rem",
              fontWeight: 800, color: "#1a1a2e",
            }}>
              {nombreVendedor}
            </h3>
            <p style={{
              margin: 0, fontSize: "0.8rem",
              color: "#5c5c7a", fontWeight: 600,
            }}>
              Vendedor de la UNP
            </p>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #f1f3f5", margin: "20px 0" }} />

        {/* Descripción */}
        <h2 style={{
          fontSize: "1.1rem", fontWeight: 900,
          color: "#1a1a2e", marginBottom: "10px",
        }}>
          Descripción
        </h2>
        <p style={{
          fontSize: "0.95rem", color: "#5c5c7a",
          lineHeight: 1.6, fontWeight: 600,
          whiteSpace: "pre-wrap", margin: 0,
        }}>
          {descripcion}
        </p>

        {/* Botón Compartir */}
        <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #f1f3f5" }}>
          <button
            onClick={handleCompartir}
            style={{
              width: "100%", background: "#f7f8fc", color: "#5c5c7a",
              border: "1.5px solid #e8e8f0", borderRadius: "14px",
              padding: "12px", fontSize: "0.9rem", fontWeight: 800,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "8px",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Compartir este producto
          </button>
        </div>

      </div>{/* /panel blanco */}

      {/* ── BARRA DE ACCIÓN FIJA ── */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%",
        transform: "translateX(-50%)",
        width: "100%", maxWidth: "480px",
        background: "white", padding: "15px 20px",
        borderTop: "1px solid #f1f3f5",
        display: "flex", gap: "12px",
        zIndex: 100, boxSizing: "border-box",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.03)",
      }}>

        {/* Botón Favorito */}
        <button
          onClick={handleFavorito}
          aria-label={esFavorito ? "Quitar de favoritos" : "Añadir a favoritos"}
          style={{
            width: "54px", height: "54px",
            background: "white",
            border: `1.5px solid ${esFavorito ? "#ef4444" : "#e8e8f0"}`,
            borderRadius: "14px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            transition: "border-color 0.2s",
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24"
            fill={esFavorito ? "#ef4444" : "none"}
            stroke={esFavorito ? "#ef4444" : "#5c5c7a"}
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>

        {/* Botón WhatsApp / Agotado / Sin WA */}
        {estaAgotado ? (
          <button disabled style={{
            flex: 1, height: "54px",
            background: "#e8e8f0", color: "#a0a5b9",
            border: "none", borderRadius: "14px",
            fontSize: "1rem", fontWeight: 800, cursor: "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            fontFamily: "'Nunito', sans-serif",
          }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            Agotado
          </button>
        ) : !tieneWA ? (
          <button disabled style={{
            flex: 1, height: "54px",
            background: "#e8e8f0", color: "#a0a5b9",
            border: "none", borderRadius: "14px",
            fontSize: "0.95rem", fontWeight: 800, cursor: "not-allowed",
            fontFamily: "'Nunito', sans-serif",
          }}>
            Vendedor sin WhatsApp
          </button>
        ) : (
          <button
            onClick={handleWhatsApp}
            style={{
              flex: 1, height: "54px",
              background: "#3a7d44", color: "white",
              border: "none", borderRadius: "14px",
              fontSize: "1.05rem", fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              boxShadow: "0 4px 15px rgba(58,125,68,0.3)",
              transition: "background 0.2s",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            Contactar por WhatsApp
          </button>
        )}

      </div>{/* /bottom bar */}

      {/* ── TOASTS ── */}
      <div style={{
        position: "fixed", bottom: "90px", left: "50%",
        transform: "translateX(-50%)", zIndex: 1000,
        display: "flex", flexDirection: "column", gap: "8px",
        width: "calc(100% - 40px)", maxWidth: "390px",
        pointerEvents: "none",
      }}>
        {toasts.map((t) => <Toast key={t.id} mensaje={t.mensaje} />)}
      </div>

    </div>
  );
};

export default Producto;