// src/pages/Perfil.jsx
// ============================================================
//  UNP Market — Perfil: Dashboard del usuario autenticado
//
//  Migra perfil.html + secciones 8-10, 12 de app.js:
//    - onAuthStateChanged → guard sesión + fetch usuario
//    - Banner + avatar circular con edición
//    - Dropdown ⚙️ → Editar perfil | Cerrar sesión
//    - Info: ubicación, teléfono, acerca de mí
//    - Mis Publicaciones Activas (query donde userUid == uid)
//    - Tarjetas con botones Editar / Agotar / Borrar
//    - Modal edición de perfil (campos + imgBB + canvas)
//    - Bottom nav con "Perfil" activo
//    - [NUEVO] Verificación de celular por SMS (Firebase Phone Auth)
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation }                 from "react-router-dom";
import {
  doc, getDoc, setDoc, getDocs,
  collection, query, where,
  updateDoc, deleteDoc, serverTimestamp,
  onSnapshot, orderBy,
} from "firebase/firestore";
// PASO 1: Se añaden RecaptchaVerifier, PhoneAuthProvider y linkWithCredential
import {
  onAuthStateChanged, signOut,
  RecaptchaVerifier, PhoneAuthProvider, linkWithCredential,
} from "firebase/auth";
import { db, auth }                    from "../services/firebase";

// ──────────────────────────────────────────────────────────────
//  CONSTANTES
// ──────────────────────────────────────────────────────────────
const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const MAX_DIM       = 1080;
const CALIDAD       = 0.70;

// ──────────────────────────────────────────────────────────────
//  UTILIDADES: compresión canvas + subida ImgBB
// ──────────────────────────────────────────────────────────────
const comprimirImagen = (file) =>
  new Promise((resolve, reject) => {
    const reader   = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload  = (e) => {
      const img   = new Image();
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.onload  = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) { height = Math.round(height * MAX_DIM / width);  width  = MAX_DIM; }
          else                { width  = Math.round(width  * MAX_DIM / height); height = MAX_DIM; }
        }
        const canvas  = document.createElement("canvas");
        canvas.width  = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", CALIDAD);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

const subirImgBB = async (file) => {
  if (!file) return "";
  const fd = new FormData();
  fd.append("image", file);
  const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd });
  const data = await res.json();
  if (!data.success) throw new Error("ImgBB rechazó la imagen");
  return data.data.url;
};

// ──────────────────────────────────────────────────────────────
//  SUB-COMPONENTE: Toast
// ──────────────────────────────────────────────────────────────
const Toast = ({ mensaje, tipo }) => (
  <div style={{
    background: tipo === "error" ? "#fecaca" : "#1e293b",
    color:      tipo === "error" ? "#991b1b"  : "white",
    padding: "14px 18px", borderRadius: "16px", fontSize: "13.5px",
    fontWeight: 700, boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
    fontFamily: "'Nunito', sans-serif",
  }}>
    {mensaje}
  </div>
);

// ──────────────────────────────────────────────────────────────
//  SUB-COMPONENTE: Tarjeta de producto en modo perfil
// ──────────────────────────────────────────────────────────────
const TarjetaPerfil = ({ producto, onAgotar, onBorrar, onEditar }) => {
  const { titulo, precio, imagen, vendedorNombre, vendedor, avatarVendedor, estado } = producto;
  const agotado     = (estado || "").toLowerCase() === "agotado";
  const nombreVend  = vendedorNombre || vendedor || "Yo";

  return (
    <article style={{
      background: "white", borderRadius: "18px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {/* Imagen */}
      <div style={{
        position: "relative", height: "160px",
        background: "linear-gradient(135deg,#c8a97a,#a07850)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {imagen?.trim() ? (
          <img src={imagen} alt={titulo}
            style={{ width: "100%", height: "100%", objectFit: "cover",
              filter: agotado ? "grayscale(70%) opacity(0.7)" : "none" }} />
        ) : (
          <span style={{ fontSize: "2.5rem" }}>📦</span>
        )}
        <span style={{
          position: "absolute", top: "8px", right: "8px",
          background: "rgba(0,0,0,0.55)", color: "white",
          padding: "4px 10px", borderRadius: "12px",
          fontSize: "0.82rem", fontWeight: 700,
        }}>
          S/ {(precio || 0).toFixed(2)}
        </span>
        {agotado && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.35)", backdropFilter: "blur(2px)",
          }}>
            <span style={{
              background: "var(--azul-oscuro)", color: "white", fontWeight: 700,
              padding: "6px 18px", borderRadius: "16px", fontSize: "0.95rem",
              transform: "rotate(-5deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}>AGOTADO</span>
          </div>
        )}
      </div>

      {/* Cuerpo */}
      <div style={{ padding: "12px 12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem", color: "var(--azul-oscuro)", lineHeight: 1.3 }}>
          {titulo || "Sin título"}
        </p>

        {/* Vendedor */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{
            width: "24px", height: "24px", borderRadius: "50%",
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
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#5c5c7a" }}>{nombreVend}</span>
        </div>

        {/* Botones de acción */}
        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
          <button onClick={onEditar} style={btnAccionStyle("#f1f3f5", "#5c5c7a")}>Editar</button>
          <button onClick={onAgotar} style={btnAccionStyle("#f1f3f5", "#5c5c7a")}>
            {agotado ? "Disponible" : "Agotar"}
          </button>
          <button onClick={onBorrar} style={btnAccionStyle("#fef2f2", "#ef4444")}>Borrar</button>
        </div>
      </div>
    </article>
  );
};

const btnAccionStyle = (bg, color) => ({
  flex: 1, padding: "7px 0", borderRadius: "10px",
  border: "none", background: bg, color,
  fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
  fontFamily: "'Nunito', sans-serif",
});

// ──────────────────────────────────────────────────────────────
//  ESTILOS INLINE compartidos
// ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", background: "var(--bg-crema)", border: "1.5px solid #e8e8f0",
  borderRadius: "12px", padding: "12px 14px",
  fontFamily: "'Nunito', sans-serif", fontSize: "0.95rem",
  fontWeight: 700, outline: "none", boxSizing: "border-box",
  color: "var(--azul-oscuro)",
};

const labelStyle = { fontSize: "0.88rem", fontWeight: 600, color: "var(--azul-oscuro)" };

// ──────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────
const Perfil = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Datos ──
  const [currentUser,  setCurrentUser]  = useState(null);
  const [perfil,       setPerfil]       = useState(null);
  const [productos,    setProductos]    = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [notificaciones, setNotificaciones] = useState([]);

  // ── UI ──
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [guardando,    setGuardando]    = useState(false);
  const [toasts,       setToasts]       = useState([]);
  const [productoABorrar, setProductoABorrar] = useState(null);

  // ── Modal: campos controlados ──
  const [mNombre,    setMNombre]    = useState("");
  const [mBio,       setMBio]       = useState("");
  const [mAcerca,    setMAcerca]    = useState("");
  const [mUbicacion, setMUbicacion] = useState("");
  const [mTelefono,  setMTelefono]  = useState("");
  const [mAvatarFile,  setMAvatarFile]  = useState(null);
  const [mPortadaFile, setMPortadaFile] = useState(null);
  const [mAvatarPrev,  setMAvatarPrev]  = useState(null);
  const [mPortadaPrev, setMPortadaPrev] = useState(null);

  // PASO 2: Estados para verificación SMS
  const [esperandoSMS,   setEsperandoSMS]   = useState(false);
  const [codigoSMS,      setCodigoSMS]      = useState("");
  const [verificationId, setVerificationId] = useState(null);

  const avatarInputRef  = useRef(null);
  const portadaInputRef = useRef(null);
  const dropdownRef     = useRef(null);

  // ──────────────────────────────────────────────────────────────
  //  Toast helper
  // ──────────────────────────────────────────────────────────────
  const mostrarToast = useCallback((mensaje, tipo = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // ──────────────────────────────────────────────────────────────
  //  Guard sesión + fetch perfil + fetch productos
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate("/login", { replace: true }); return; }
      setCurrentUser(user);

      try {
        // Perfil de usuario + Mis publicaciones, en paralelo (sin waterfall)
        const q = query(collection(db, "productos"), where("userUid", "==", user.uid));

        const [snap, pSnap] = await Promise.all([
          getDoc(doc(db, "usuarios", user.uid)),
          getDocs(q),
        ]);

        const data = snap.exists()
          ? snap.data()
          : JSON.parse(localStorage.getItem("unp_user_profile") || "{}");
        setPerfil(data);

        setProductos(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
        setPerfil(JSON.parse(localStorage.getItem("unp_user_profile") || "{}"));
      } finally {
        setCargando(false);
      }
    });
    return () => unsub();
  }, [navigate]);

  // ──────────────────────────────────────────────────────────────
  //  Notificaciones en tiempo real (puntito/globo rojo)
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "notificaciones"),
      where("paraUid", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotificaciones(notifs);
    });
    return () => unsubscribe();
  }, [currentUser]);

// ──────────────────────────────────────────────────────────────
  //  OBJETIVO 1: Abrir modal automáticamente si viene de Publicar
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Solo intentamos abrir el modal SI ya terminó de cargar la base de datos
    if (!cargando && location.state?.abrirModalEdicion) {
      abrirModal();
      // Limpiar el estado de la historia para que no se reabra al recargar
      window.history.replaceState({}, document.title);
    }
  }, [location, cargando]);

  // ── Cerrar dropdown al hacer clic fuera ──
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ──────────────────────────────────────────────────────────────
  //  Cerrar sesión
  // ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    ["unp_user_profile", "listaFavoritos",
     "mostrarToastPublicar", "productoSeleccionado"
    ].forEach((k) => localStorage.removeItem(k));
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  // ──────────────────────────────────────────────────────────────
  //  Abrir modal (pre-rellenar con datos actuales)
  // ──────────────────────────────────────────────────────────────
  const abrirModal = () => {
    const p = perfil || {};
    setMNombre(p.nombre    || "");
    setMBio(p.bio          || "");
    setMAcerca(p.acercaDe  || "");
    setMUbicacion(p.ubicacion || "");
    setMTelefono(p.telefono   || "");
    setMAvatarFile(null);
    setMPortadaFile(null);
    setMAvatarPrev(p.avatar  || null);
    setMPortadaPrev(p.portada || null);
    setDropdownOpen(false);
    // Resetear estado SMS al abrir
    setEsperandoSMS(false);
    setCodigoSMS("");
    setVerificationId(null);
    setModalOpen(true);
  };

  // ──────────────────────────────────────────────────────────────
  //  Selección de imagen en modal
  // ──────────────────────────────────────────────────────────────
  const handleFileSelect = (tipo, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (tipo === "avatar")  { setMAvatarFile(file);  setMAvatarPrev(url); }
    if (tipo === "portada") { setMPortadaFile(file); setMPortadaPrev(url); }
  };

  // ──────────────────────────────────────────────────────────────
  //  Lógica de guardado real (extraída para reutilizarse)
  // ──────────────────────────────────────────────────────────────
  const ejecutarGuardadoReal = async () => {
    const perfilPrev = perfil || {};

    // Subir imágenes solo si hay archivo nuevo
    let avatarFinal  = perfilPrev.avatar  || "";
    let portadaFinal = perfilPrev.portada || "";

    if (mAvatarFile) {
      const blob = await comprimirImagen(mAvatarFile);
      avatarFinal = await subirImgBB(blob);
    }
    if (mPortadaFile) {
      const blob = await comprimirImagen(mPortadaFile);
      portadaFinal = await subirImgBB(blob);
    }

    const nuevoPerfil = {
      ...perfilPrev,
      uid:       currentUser.uid,
      nombre:    mNombre    || perfilPrev.nombre    || "",
      bio:       mBio       || perfilPrev.bio       || "",
      acercaDe:  mAcerca    || perfilPrev.acercaDe  || "",
      ubicacion: mUbicacion || perfilPrev.ubicacion || "",
      telefono:  mTelefono.trim() || perfilPrev.telefono || "",
      avatar:    avatarFinal,
      portada:   portadaFinal,
    };

    await setDoc(doc(db, "usuarios", currentUser.uid), nuevoPerfil, { merge: true });
    localStorage.setItem("unp_user_profile", JSON.stringify(nuevoPerfil));
    setPerfil(nuevoPerfil);
    setModalOpen(false);
    setEsperandoSMS(false);
    mostrarToast("¡Perfil guardado correctamente!");

    // PARCHE 3 — Propagar avatar, vendedorNombre y telefono a todos los productos del usuario.
    // Se ejecuta siempre (no solo cuando cambia el avatar) para mantener los datos de vendedor
    // sincronizados en el feed cuando el usuario edita su nombre o WhatsApp.
    try {
      const q    = query(collection(db, "productos"), where("userUid", "==", currentUser.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await Promise.all(snap.docs.map((d) =>
          updateDoc(doc(db, "productos", d.id), {
            avatarVendedor: avatarFinal,
            vendedorNombre: nuevoPerfil.nombre   || "",
            vendedor:       nuevoPerfil.nombre   || "",   // campo legacy
            telefono:       nuevoPerfil.telefono || "",
          })
        ));
        // Reflejar los cambios en el estado local sin re-fetch
        setProductos((prev) => prev.map((p) => ({
          ...p,
          avatarVendedor: avatarFinal,
          vendedorNombre: nuevoPerfil.nombre   || "",
          vendedor:       nuevoPerfil.nombre   || "",
          telefono:       nuevoPerfil.telefono || "",
        })));
        mostrarToast(`✓ Perfil actualizado en ${snap.size} publicación${snap.size !== 1 ? "es" : ""}`);
      }
    } catch (syncErr) {
      console.warn("Error al sincronizar productos:", syncErr);
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  PASO 3: handleGuardar refactorizado
  // ──────────────────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!currentUser) return;

    const telefonoActual = (perfil?.telefono || "").trim();
    const telefonoNuevo  = mTelefono.trim();

    // Si el teléfono está vacío o no cambió → guardado normal
    if (!telefonoNuevo || telefonoNuevo === telefonoActual) {
      setGuardando(true);
      try {
        await ejecutarGuardadoReal();
      } catch (err) {
        console.error(err);
        mostrarToast("Error al guardar el perfil", "error");
      } finally {
        setGuardando(false);
      }
      return;
    }

    // El teléfono es nuevo o ha cambiado → verificar por SMS primero
    setGuardando(true);
    try {
      // Limpiar instancia anterior si existe
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }

     // Limpiar cualquier reCAPTCHA anterior atrapado en la memoria
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
      
      // Crear uno nuevo fresco
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });

      const provider = new PhoneAuthProvider(auth);
      const verId    = await provider.verifyPhoneNumber(
        "+51" + telefonoNuevo,
        window.recaptchaVerifier
      );

      setVerificationId(verId);
      setEsperandoSMS(true);
    } catch (err) {
      console.error("Error al enviar SMS:", err);
      mostrarToast("No se pudo enviar el SMS. Verifica el número.", "error");
      // Limpiar recaptcha si falla
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    } finally {
      setGuardando(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  PASO 4: Verificar código SMS y guardar
  // ──────────────────────────────────────────────────────────────
  const confirmarSMSYGuardar = async () => {
    if (!currentUser || !verificationId || !codigoSMS.trim()) {
      mostrarToast("Ingresa el código de 6 dígitos", "error");
      return;
    }
    setGuardando(true);
    try {
      // 1. Crear la credencial con el código ingresado
      const credential = PhoneAuthProvider.credential(verificationId, codigoSMS.trim());

      // 2. Vincular el teléfono a la cuenta de Google actual
      await linkWithCredential(currentUser, credential);

      // 3. Si el vínculo es exitoso, ejecutar el guardado real
      await ejecutarGuardadoReal();
      mostrarToast("📱 Teléfono verificado y perfil guardado");
    } catch (err) {
      console.error("Error al verificar SMS:", err);
      if (err.code === "auth/invalid-verification-code") {
        mostrarToast("Código incorrecto. Inténtalo de nuevo.", "error");
      } else if (err.code === "auth/provider-already-linked") {
        // El teléfono ya está vinculado → guardar igual
        try {
          await ejecutarGuardadoReal();
        } catch (saveErr) {
          console.error(saveErr);
          mostrarToast("Error al guardar el perfil", "error");
        }
      } else {
        mostrarToast("Error al verificar. Intenta enviar el SMS de nuevo.", "error");
      }
    } finally {
      setGuardando(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  Acciones sobre productos
  // ──────────────────────────────────────────────────────────────
  const handleAgotar = async (prod) => {
    const nuevoEstado = (prod.estado || "").toLowerCase() === "agotado" ? "disponible" : "agotado";
    try {
      await updateDoc(doc(db, "productos", prod.id), { estado: nuevoEstado });
      setProductos((prev) =>
        prev.map((p) => p.id === prod.id ? { ...p, estado: nuevoEstado } : p)
      );
      mostrarToast(nuevoEstado === "agotado" ? "Producto marcado como agotado" : "Producto disponible de nuevo");
    } catch (err) {
      console.error(err);
      mostrarToast("Error al actualizar el estado", "error");
    }
  };

  const handleBorrar = (prod) => {
    setProductoABorrar(prod);
  };

  const confirmarBorrado = async () => {
    if (!productoABorrar) return;
    try {
      await deleteDoc(doc(db, "productos", productoABorrar.id));
      setProductos((prev) => prev.filter((p) => p.id !== productoABorrar.id));
      mostrarToast("Producto eliminado");
    } catch (err) {
      console.error(err);
      mostrarToast("Error al eliminar", "error");
    } finally {
      setProductoABorrar(null);
    }
  };

  const handleEditar = (prod) => navigate(`/editar?id=${prod.id}`);

  // ──────────────────────────────────────────────────────────────
  //  Render: cargando
  // ──────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontFamily: "'Nunito', sans-serif",
        fontWeight: 600, color: "#5c5c7a", background: "var(--bg-crema)",
      }}>
        Cargando perfil...
      </div>
    );
  }

  const p = perfil || {};

  // ──────────────────────────────────────────────────────────────
  //  RENDER PRINCIPAL
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", paddingBottom: "90px" }}>

    {/* ════════════════════════════════════════════════════
           CABECERA — Banner + Avatar + Nombre
      ════════════════════════════════════════════════════ */}
      <div
        className="up-header"
        style={{
          position: "relative", width: "100%", minHeight: "290px",
          background: p.portada?.trim()
            ? `url('${p.portada}') center/cover no-repeat`
            : "linear-gradient(135deg,#c8a97a 0%,#a07850 100%)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "60px 20px 30px", boxSizing: "border-box"
        }}
      >
        {/* Capa oscura (Overlay) para asegurar que el texto blanco siempre se lea bien */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.85) 100%)",
          zIndex: 1
        }} />

        {/* Botón volver */}
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{
            position: "absolute", top: "16px", left: "16px", zIndex: 10,
            width: "38px", height: "38px", borderRadius: "50%",
            background: "rgba(0,0,0,0.35)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", color: "white",
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {/* Botón ⚙️ + Dropdown */}
        <div ref={dropdownRef} style={{ position: "absolute", top: "16px", right: "16px", zIndex: 10 }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            aria-label="Configuración"
            style={{
              width: "38px", height: "38px", borderRadius: "50%",
              background: "rgba(0,0,0,0.35)", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", color: "white",
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {dropdownOpen && (
            <div style={{
              position: "absolute", top: "46px", right: 0, background: "white", borderRadius: "14px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.15)", border: "1px solid #f1f3f5", minWidth: "180px", overflow: "hidden", zIndex: 200,
            }}>
              <button onClick={abrirModal} style={dropItemStyle("var(--azul-oscuro)")}>Editar perfil</button>
              <button onClick={handleSignOut} style={dropItemStyle("#ef4444")}>Cerrar sesión</button>
            </div>
          )}
        </div>

        {/* Contenedor Central Flex (Avatar + Textos) */}
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
          
          {/* Avatar circular con botón de edición */}
          <div style={{ position: "relative", marginBottom: "4px" }}>
            <div style={{
              width: "100px", height: "100px", borderRadius: "50%",
              border: "3px solid white", boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              background: "linear-gradient(135deg,#c8a97a,#a07850)", overflow: "hidden",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", fontWeight: 700, color: "white",
            }}>
              {p.avatar?.trim() ? <img src={p.avatar} alt={p.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (p.nombre || "U")[0].toUpperCase()}
            </div>
            
            {/* Lápiz naranja */}
            <button onClick={abrirModal} aria-label="Editar foto" style={{
              position: "absolute", bottom: "4px", right: "0px",
              width: "28px", height: "28px", borderRadius: "50%",
              background: "#f97316", border: "2px solid white",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>

          {/* Textos */}
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "white", textAlign: "center", textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
            {p.nombre || "Estudiante UNP"}
          </h1>
          <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "rgba(255,255,255,0.9)", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
            {p.bio || "Estudiante de la UNP"}
          </p>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.4)",
            padding: "6px 16px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 600, marginTop: "4px", backdropFilter: "blur(4px)",
          }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.8">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Estudiante verificado
          </div>
        </div>
      </div>

     {/* ════════════════════════════════════════════════════
           INFO: UBICACIÓN + TELÉFONO (ESTILO BURBUJAS)
      ════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: "12px",
        background: "transparent",
        margin: "16px 16px 20px",
      }}>
        {/* Burbuja Ubicación */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: "8px",
          padding: "10px 16px", background: "var(--blanco-puro)", borderRadius: "24px",
          border: "1px solid rgba(15, 37, 64, 0.06)", boxShadow: "0 4px 12px rgba(15, 37, 64, 0.04)"
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--verde-marca)" strokeWidth="2.2" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--azul-oscuro)", margin: 0 }}>
            {p.ubicacion || "Piura"}
          </span>
        </div>

        {/* Burbuja Teléfono */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: "8px",
          padding: "10px 16px", background: "var(--blanco-puro)", borderRadius: "24px",
          border: "1px solid rgba(15, 37, 64, 0.06)", boxShadow: "0 4px 12px rgba(15, 37, 64, 0.04)"
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--verde-marca)" strokeWidth="2.2" strokeLinecap="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.5 2 2 0 0 1 3.6 1.32h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--azul-oscuro)", margin: 0 }}>
            {p.telefono || "Sin WhatsApp"}
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
           ACERCA DE MÍ
      ════════════════════════════════════════════════════ */}
      <div style={{ padding: "0 16px", marginBottom: "8px" }}>
        <div style={{
          background: "white", borderRadius: "16px",
          border: "1.5px solid #e8e8f0", padding: "14px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
              stroke="var(--verde-marca)" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--azul-oscuro)" }}>Acerca de mí</span>
          </div>
         <p style={{ margin: 0, fontSize: "0.88rem", color: "#5c5c7a", fontWeight: 600, lineHeight: 1.5, wordBreak: "break-word" }}>
            {p.acercaDe || "¡Hola! Bienvenido a mi tienda en el campus."}
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
           MIS PUBLICACIONES ACTIVAS
      ════════════════════════════════════════════════════ */}
      <div style={{ padding: "0 16px 20px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          marginBottom: "12px", paddingBottom: "10px",
          borderBottom: "2px solid var(--verde-marca)",
        }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
            stroke="var(--verde-marca)" strokeWidth="2.2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--verde-marca)" }}>
            Mis Publicaciones Activas
          </span>
        </div>

        {productos.length === 0 ? (
          <p style={{ textAlign: "center", color: "#5c5c7a", fontWeight: 700, padding: "20px 0" }}>
            Aún no tienes publicaciones.
          </p>
        ) : (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
          }}>
            {productos.map((prod) => (
              <TarjetaPerfil
                key={prod.id}
                producto={prod}
                onAgotar={() => handleAgotar(prod)}
                onBorrar={() => handleBorrar(prod)}
                onEditar={() => handleEditar(prod)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════
           BOTTOM NAVIGATION
      ════════════════════════════════════════════════════ */}
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
          <div className="nav-icon-wrap" style={{ position: "relative", display: "inline-flex" }}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {notificaciones.some(n => !n.leido) && (
              <span className="nav-notif-badge" style={{
                position: "absolute", top: "-4px", right: "-6px", background: "#ef4444", color: "white", fontSize: "0.65rem", fontWeight: 800, minWidth: "16px", height: "16px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1e293b", padding: "0 4px", lineHeight: 1
              }}>
                {notificaciones.filter(n => !n.leido).length}
              </span>
            )}
          </div>
          <span className="nav-label">Notifs</span>
        </button>

        <button className="nav-item active" aria-label="Perfil">
          <svg className="nav-icon" viewBox="0 0 24 24"
            fill="currentColor" stroke="currentColor" strokeWidth="0.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span className="nav-label" style={{ color: "var(--verde-marca)" }}>Perfil</span>
          <span style={{
            width: "4px", height: "4px", borderRadius: "50%",
            background: "var(--verde-marca)", display: "block", margin: "2px auto 0",
          }}/>
        </button>
      </nav>

      {/* ════════════════════════════════════════════════════
           MODAL: EDITAR PERFIL
      ════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "flex-end",
            zIndex: 500,
          }}
        >
          <div style={{
            width: "100%", maxWidth: "480px", margin: "0 auto",
            background: "white", borderRadius: "28px 28px 0 0",
            padding: "24px 20px 32px",
            maxHeight: "90vh", overflowY: "auto",
            boxSizing: "border-box",
          }}>
            {/* PASO 5: div invisible para reCAPTCHA */}
            <div id="recaptcha-container"></div>

            {/* ── PASO 5: Renderizado condicional ── */}
            {!esperandoSMS ? (
              /* ══ VISTA NORMAL: formulario de perfil ══ */
              <>
                <h2 style={{ margin: "0 0 20px", fontSize: "1.2rem", fontWeight: 700, color: "var(--azul-oscuro)" }}>
                  Editar Mi Perfil
                </h2>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                  {/* Nombre */}
                  <div>
                    <label style={labelStyle}>Nombre Completo</label>
                    <input value={mNombre} onChange={(e) => setMNombre(e.target.value)}
                      style={{ ...inputStyle, marginTop: "6px" }} />
                  </div>

                  {/* Bio / Carrera */}
                  <div>
                    <label style={labelStyle}>Carrera / Título corto</label>
                    <input value={mBio} onChange={(e) => setMBio(e.target.value)}
                      placeholder="Ej: Ing. Informático"
                      style={{ ...inputStyle, marginTop: "6px" }} />
                  </div>

                  {/* Acerca de mí */}
                  <div>
                    <label style={labelStyle}>Acerca de mí</label>
                    <textarea value={mAcerca} onChange={(e) => setMAcerca(e.target.value)}
                      rows={3} style={{ ...inputStyle, marginTop: "6px", resize: "none" }} />
                  </div>

                  {/* Ubicación */}
                  <div>
                    <label style={labelStyle}>Ubicación actual</label>
                    <input value={mUbicacion} onChange={(e) => setMUbicacion(e.target.value)}
                      style={{ ...inputStyle, marginTop: "6px" }} />
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label style={labelStyle}>WhatsApp (sin +51)</label>
                    <input
                      value={mTelefono}
                      onChange={(e) => {
                        const soloNumeros = e.target.value.replace(/\D/g, '');
                        if (soloNumeros.length <= 9) setMTelefono(soloNumeros);
                      }}
                      placeholder="Ej: 987654321"
                      type="tel"
                      maxLength={9}
                      style={{ ...inputStyle, marginTop: "6px" }}
                    />
                  </div>

                  {/* Foto de perfil */}
                  <div>
                    <label style={labelStyle}>Foto de Perfil</label>
                    <input type="file" accept="image/*" ref={avatarInputRef} style={{ display: "none" }}
                      onChange={(e) => handleFileSelect("avatar", e.target.files[0])} />
                    <button onClick={() => avatarInputRef.current?.click()} style={filePickerStyle}>
                      {mAvatarPrev
                        ? <img src={mAvatarPrev} alt="Avatar" style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }} />
                        : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#a0a5b9" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      }
                      <span style={{ color: "#5c5c7a", fontWeight: 700, fontSize: "0.9rem" }}>
                        {mAvatarPrev ? "Cambiar foto de perfil" : "Subir foto de perfil"}
                      </span>
                    </button>
                  </div>

                  {/* Imagen de portada */}
                  <div>
                    <label style={labelStyle}>Imagen de Portada (Banner)</label>
                    <input type="file" accept="image/*" ref={portadaInputRef} style={{ display: "none" }}
                      onChange={(e) => handleFileSelect("portada", e.target.files[0])} />
                    {mPortadaPrev && (
                      <img src={mPortadaPrev} alt="Banner"
                        style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "12px", marginBottom: "6px" }} />
                    )}
                    <button onClick={() => portadaInputRef.current?.click()} style={filePickerStyle}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#a0a5b9" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span style={{ color: "#5c5c7a", fontWeight: 700, fontSize: "0.9rem" }}>
                        {mPortadaPrev ? "Cambiar imagen de portada" : "Subir imagen de portada"}
                      </span>
                    </button>
                  </div>

                </div>

                {/* Botones del formulario normal */}
                <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                  <button
                    onClick={() => setModalOpen(false)}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px",
                      background: "#f1f3f5", border: "none", cursor: "pointer",
                      fontWeight: 600, fontSize: "0.95rem", color: "#5c5c7a",
                      fontFamily: "'Nunito', sans-serif",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleGuardar}
                    disabled={guardando}
                    style={{
                      flex: 1.5, padding: "14px", borderRadius: "14px",
                      background: guardando ? "#6b9e74" : "var(--verde-marca)",
                      border: "none", cursor: guardando ? "not-allowed" : "pointer",
                      fontWeight: 600, fontSize: "0.95rem", color: "white",
                      fontFamily: "'Nunito', sans-serif",
                      boxShadow: "0 4px 15px rgba(58,125,68,0.3)",
                    }}
                  >
                    {guardando ? "Enviando SMS..." : "Guardar Perfil"}
                  </button>
                </div>
              </>
            ) : (
              /* ══ VISTA SMS: verificar código ══ */
              <>
                {/* Icono de teléfono */}
                <div style={{
                  width: "60px", height: "60px", borderRadius: "50%",
                  background: "var(--bg-crema)", border: "2px solid var(--verde-marca)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="var(--verde-marca)" strokeWidth="2.2" strokeLinecap="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                </div>

                <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem", fontWeight: 700, color: "var(--azul-oscuro)", textAlign: "center" }}>
                  Verifica tu número
                </h2>

                <p style={{
                  margin: "0 0 24px", fontSize: "0.88rem", fontWeight: 600,
                  color: "#5c5c7a", textAlign: "center", lineHeight: 1.5,
                }}>
                  Te enviamos un código por SMS al{" "}
                  <span style={{ color: "var(--azul-oscuro)", fontWeight: 800 }}>
                    +51 {mTelefono}
                  </span>
                </p>

                {/* Input código SMS */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Código de 6 dígitos</label>
                  <input
                    value={codigoSMS}
                    onChange={(e) => {
                      const soloNums = e.target.value.replace(/\D/g, "");
                      if (soloNums.length <= 6) setCodigoSMS(soloNums);
                    }}
                    placeholder="_ _ _ _ _ _"
                    type="tel"
                    maxLength={6}
                    style={{
                      ...inputStyle,
                      marginTop: "8px",
                      fontSize: "1.4rem",
                      letterSpacing: "0.35em",
                      textAlign: "center",
                    }}
                    autoFocus
                  />
                </div>

                {/* Botones verificación */}
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={() => {
                      setEsperandoSMS(false);
                      setCodigoSMS("");
                      setVerificationId(null);
                    }}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px",
                      background: "#f1f3f5", border: "none", cursor: "pointer",
                      fontWeight: 600, fontSize: "0.95rem", color: "#5c5c7a",
                      fontFamily: "'Nunito', sans-serif",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarSMSYGuardar}
                    disabled={guardando || codigoSMS.length < 6}
                    style={{
                      flex: 1.5, padding: "14px", borderRadius: "14px",
                      background: (guardando || codigoSMS.length < 6) ? "#6b9e74" : "var(--verde-marca)",
                      border: "none",
                      cursor: (guardando || codigoSMS.length < 6) ? "not-allowed" : "pointer",
                      fontWeight: 600, fontSize: "0.95rem", color: "white",
                      fontFamily: "'Nunito', sans-serif",
                      boxShadow: "0 4px 15px rgba(58,125,68,0.3)",
                    }}
                  >
                    {guardando ? "Verificando..." : "Verificar y Guardar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
           MODAL: CONFIRMAR BORRADO
      ════════════════════════════════════════════════════ */}
      {productoABorrar && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setProductoABorrar(null); }}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 600, padding: "20px", boxSizing: "border-box",
          }}
        >
          <div style={{
            width: "100%", maxWidth: "340px",
            background: "white", borderRadius: "20px",
            padding: "24px 22px", boxSizing: "border-box",
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
            textAlign: "center",
          }}>
            <h2 style={{ margin: "0 0 10px", fontSize: "1.1rem", fontWeight: 700, color: "var(--azul-oscuro)" }}>
              ¿Eliminar producto?
            </h2>
            <p style={{ margin: "0 0 22px", fontSize: "0.9rem", fontWeight: 600, color: "#5c5c7a", lineHeight: 1.4 }}>
              {`Vas a eliminar "${productoABorrar.titulo}". Esta acción no se puede deshacer.`}
            </p>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setProductoABorrar(null)}
                style={{
                  flex: 1, padding: "13px", borderRadius: "14px",
                  background: "#f1f3f5", border: "none", cursor: "pointer",
                  fontWeight: 600, fontSize: "0.9rem", color: "#5c5c7a",
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarBorrado}
                style={{
                  flex: 1, padding: "13px", borderRadius: "14px",
                  background: "#ef4444", border: "none", cursor: "pointer",
                  fontWeight: 600, fontSize: "0.9rem", color: "white",
                  fontFamily: "'Nunito', sans-serif",
                  boxShadow: "0 4px 15px rgba(239,68,68,0.3)",
                }}
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div style={{
        position: "fixed", bottom: "84px", left: "50%",
        transform: "translateX(-50%)", zIndex: 1000,
        display: "flex", flexDirection: "column", gap: "8px",
        width: "calc(100% - 40px)", maxWidth: "390px",
        pointerEvents: "none",
      }}>
        {toasts.map((t) => <Toast key={t.id} mensaje={t.mensaje} tipo={t.tipo} />)}
      </div>

    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Estilos auxiliares
// ──────────────────────────────────────────────────────────────
const infoColStyle = {
  flex: 1, display: "flex", flexDirection: "column",
  alignItems: "center", gap: "6px", padding: "16px 8px",
};

const dropItemStyle = (color) => ({
  width: "100%", padding: "13px 16px", border: "none",
  background: "none", cursor: "pointer", textAlign: "left",
  display: "flex", alignItems: "center", gap: "10px",
  fontSize: "0.9rem", fontWeight: 600, color,
  fontFamily: "'Nunito', sans-serif",
  borderBottom: "1px solid var(--bg-crema)",
});

const filePickerStyle = {
  width: "100%", marginTop: "6px",
  border: "1.5px dashed #e8e8f0", borderRadius: "12px",
  padding: "14px", background: "#fafbff", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
  fontFamily: "'Nunito', sans-serif", boxSizing: "border-box",
};

export default Perfil;