// src/pages/EditarProducto.jsx
// ============================================================
//  UNP Market — EditarProducto: Edición de publicación existente
//
//  Basado en Publicar.jsx (estructura JSX idéntica).
//  Diferencias clave:
//    - Lee ?id=<productoId> de la URL con useSearchParams
//    - Al montar: getDoc → pre-pobla todos los campos
//    - Protección: si userUid del doc ≠ uid logueado → redirige a "/"
//    - Submit: updateDoc en lugar de addDoc
//    - Si el usuario NO elige foto nueva → conserva imagen original
// ============================================================

import { useState, useEffect, useRef }  from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  doc, getDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth }           from "../services/firebase";

// ──────────────────────────────────────────────────────────────
//  CONSTANTES (idénticas a Publicar.jsx)
// ──────────────────────────────────────────────────────────────
const IMGBB_API_KEY = "44396363d77b09fc503f8a3b50898ea7";
const MAX_DIMENSION = 1080;
const CALIDAD_JPEG  = 0.70;

// ──────────────────────────────────────────────────────────────
//  UTILIDAD: Compresión Canvas (idéntica a Publicar.jsx)
// ──────────────────────────────────────────────────────────────
const comprimirImagen = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload  = (e) => {
      const img   = new Image();
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.onload  = () => {
        let { width, height } = img;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width  = MAX_DIMENSION;
          } else {
            width  = Math.round((width  * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas  = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => resolve(blob ?? file),
          "image/jpeg",
          CALIDAD_JPEG
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

// ──────────────────────────────────────────────────────────────
//  UTILIDAD: Subida a ImgBB (idéntica a Publicar.jsx)
// ──────────────────────────────────────────────────────────────
const subirImagenImgBB = async (file) => {
  if (!file) return "";
  const formData = new FormData();
  formData.append("image", file);
  const res  = await fetch(
    `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
    { method: "POST", body: formData }
  );
  const data = await res.json();
  if (!data.success) throw new Error("ImgBB rechazó la imagen");
  return data.data.url;
};

// ──────────────────────────────────────────────────────────────
//  COMPONENTE
// ──────────────────────────────────────────────────────────────
const EditarProducto = () => {
  const navigate                    = useNavigate();
  const [searchParams]              = useSearchParams();
  const productoId                  = searchParams.get("id");

  // ── Estado del usuario autenticado ──
  const [currentUser, setCurrentUser] = useState(null);

  // ── Estado del formulario ──
  const [titulo,        setTitulo]        = useState("");
  const [precio,        setPrecio]        = useState("");
  const [categoria,     setCategoria]     = useState("dulces");
  const [descripcion,   setDescripcion]   = useState("");
  const [archivo,       setArchivo]       = useState(null);   // File nuevo (opcional)
  const [previewUrl,    setPreviewUrl]    = useState(null);   // URL.createObjectURL o URL original
  const [imagenOriginal, setImagenOriginal] = useState("");   // URL de Firestore

  // ── Estado del botón de envío ──
  const [btnTexto, setBtnTexto] = useState("Guardar Cambios");
  const [enviando, setEnviando] = useState(false);

  // ── Carga inicial ──
  const [cargando, setCargando] = useState(true);

  // ── Toast local ──
  const [toast, setToast] = useState(null); // { mensaje, tipo }

  // ── Ref del input file (oculto) ──
  const fileInputRef = useRef(null);

  // ──────────────────────────────────────────────────────────────
  //  Guard de sesión + carga del producto + protección de ruta
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!productoId) {
      navigate("/", { replace: true });
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      setCurrentUser(user);

      try {
        const snap = await getDoc(doc(db, "productos", productoId));

        if (!snap.exists()) {
          navigate("/", { replace: true });
          return;
        }

        const data = snap.data();

        // ── Protección de ruta: solo el dueño puede editar ──
        if (data.userUid !== user.uid) {
          navigate("/", { replace: true });
          return;
        }

        // ── Pre-poblar campos ──
        setTitulo(data.titulo       || "");
        setPrecio(data.precio !== undefined ? String(data.precio) : "");
        setCategoria(data.categoria || "dulces");
        setDescripcion(data.descripcion || "");
        setImagenOriginal(data.imagen   || "");
        setPreviewUrl(data.imagen       || null);
      } catch (err) {
        console.error("Error al cargar el producto:", err);
        setToast({ mensaje: "No se pudo cargar el producto.", tipo: "error" });
      } finally {
        setCargando(false);
      }
    });

    return () => unsub();
  }, [navigate, productoId]);

  // ──────────────────────────────────────────────────────────────
  //  Toast auto-dismiss
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // ──────────────────────────────────────────────────────────────
  //  Manejador de selección de imagen
  // ──────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setArchivo(file);

    // Revocar URL de objeto anterior (si era local)
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // Limpiar object URL al desmontar (solo si es blob)
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ──────────────────────────────────────────────────────────────
  //  Submit del formulario → updateDoc
  // ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      setToast({ mensaje: "Debes iniciar sesión para editar.", tipo: "error" });
      return;
    }

    setEnviando(true);

    try {
      let imagenFinal = imagenOriginal; // conservar por defecto

      if (archivo) {
        // Paso 1: Comprimir
        setBtnTexto("Comprimiendo imagen...");
        const fileComprimido = await comprimirImagen(archivo);

        // Paso 2: Subir a ImgBB
        setBtnTexto("Subiendo imagen...");
        imagenFinal = await subirImagenImgBB(fileComprimido);
      }

      // Paso 3: Actualizar en Firestore
      setBtnTexto("Guardando...");
      await updateDoc(doc(db, "productos", productoId), {
        titulo,
        precio:      parseFloat(precio),
        categoria,
        descripcion,
        imagen:      imagenFinal,
        fechaEdicion: serverTimestamp(),
      });

      navigate("/perfil", { state: { toastEditar: true } });

    } catch (err) {
      console.error(err);
      setToast({ mensaje: "Error al guardar. Intenta de nuevo.", tipo: "error" });
      setBtnTexto("Guardar Cambios");
      setEnviando(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  Textos descriptivos del área de imagen
  // ──────────────────────────────────────────────────────────────
  const imagenAreaTexto = () => {
    if (!archivo) {
      return imagenOriginal
        ? "Imagen actual ✓  Toca para cambiarla"
        : "Toca para abrir la cámara o galería";
    }
    const nombre   = archivo.name.length > 30
      ? archivo.name.substring(0, 27) + "..."
      : archivo.name;
    const tamanoMB = (archivo.size / 1024 / 1024).toFixed(1);
    return `Imagen seleccionada ✓  ${nombre} · ${tamanoMB}MB → se comprimirá al subir`;
  };

  // ──────────────────────────────────────────────────────────────
  //  ESTILOS reutilizables (inline, fieles a Publicar.jsx)
  // ──────────────────────────────────────────────────────────────
  const inputStyle = {
    background: "var(--bg-crema)", border: "1.5px solid #e8e8f0",
    borderRadius: "12px", padding: "14px 16px",
    fontFamily: "'Nunito', sans-serif", fontSize: "0.95rem",
    fontWeight: 700, outline: "none",
    boxSizing: "border-box", width: "100%",
  };

  const labelStyle = {
    fontSize: "0.9rem", fontWeight: 600, color: "var(--text-dark)",
  };

  // ──────────────────────────────────────────────────────────────
  //  Pantalla de carga mientras se fetching el producto
  // ──────────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div className="app-shell" style={{ background: "var(--bg-crema)", margin: "0 auto", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, color: "#5c5c7a" }}>
          Cargando producto...
        </p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  RENDER — estructura JSX idéntica a Publicar.jsx
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", margin: "0 auto", padding: 0 }}>

      {/* HEADER MINIMALISTA */}
      <header className="header" style={{ justifyContent: "center", background: "var(--bg-crema)", padding: "20px" }}>
        <button onClick={() => navigate(-1)} style={{ position: "absolute", left: "20px", background: "none", border: "none", cursor: "pointer" }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--azul-oscuro)" strokeWidth="2.5" strokeLinecap="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <img src="https://i.ibb.co/fzNKyX51/Dise-o-sin-t-tulo-1.png" alt="Logo" style={{ height: "44px", objectFit: "contain", mixBlendMode: "multiply" }} />
      </header>

      {/* FORMULARIO */}
      <main className="publish-container" style={{ background: "var(--bg-crema)", paddingTop: "10px" }}>
        <form onSubmit={handleSubmit} className="publish-form-card" style={{ background: "var(--blanco-puro)" }}>

          {/* ── FOTO ── */}
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Foto del producto *</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${(archivo || imagenOriginal) ? "var(--verde-marca)" : "#c3c6d4"}`,
                borderRadius: "16px", padding: "20px", marginTop: "8px",
                textAlign: "center", background: "var(--bg-crema)", cursor: "pointer",
              }}
            >
              {!previewUrl && <span style={{ fontSize: "2rem" }}>📷</span>}
              <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#5c5c7a", marginTop: "8px" }}>
                {imagenAreaTexto()}
              </p>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{ width: "100%", height: "150px", objectFit: "cover", borderRadius: "12px", marginTop: "10px" }}
                />
              )}
            </div>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
          </div>

          {/* ── TÍTULO ── */}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>¿Qué vas a vender?</label>
            <input
              type="text" required maxLength={200}
              placeholder="Ej: Galletas de avena"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* ── PRECIO + CATEGORÍA ── */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Precio (S/)</label>
              <input
                type="number" required placeholder="0.00"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1.5 }}>
              <label style={labelStyle}>Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="dulces">🍰 Dulces</option>
                <option value="salados">🍔 Salados</option>
                <option value="bebidas">🥤 Bebidas</option>
                <option value="servicios">🔧 Servicios</option>
                <option value="materiales">📚 Materiales</option>
              </select>
            </div>
          </div>

          {/* ── DESCRIPCIÓN ── */}
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Descripción</label>
            <textarea
              required rows={3} maxLength={500}
              placeholder="Detalles..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          {/* ── BOTÓN ── */}
          <button type="submit" disabled={enviando} className="btn-publish-final">
            {enviando ? btnTexto : "Guardar Cambios"}
          </button>

        </form>
      </main>

      {/* BOTTOM NAVIGATION */}
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
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
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
            <span className="nav-notif-badge">1</span>
          </div>
          <span className="nav-label">Notifs</span>
        </button>

        <button className="nav-item active" onClick={() => navigate("/perfil")} aria-label="Perfil">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span className="nav-label">Perfil</span>
        </button>
      </nav>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "84px", left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, width: "calc(100% - 40px)", maxWidth: "390px", pointerEvents: "none",
        }}>
          <div style={{
            background: toast.tipo === "success" ? "#1e293b" : "#fecaca",
            color: toast.tipo === "success" ? "#ffffff" : "#991b1b",
            padding: "14px 18px", borderRadius: "16px", fontSize: "13.5px",
            fontFamily: "'Nunito', sans-serif", fontWeight: 700,
            boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
            display: "flex", alignItems: "center", gap: "10px",
          }}>
            {toast.tipo === "success"
              ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            }
            <span style={{ flex: 1 }}>{toast.mensaje}</span>
          </div>
        </div>
      )}

      {/* Keyframe spin */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default EditarProducto;