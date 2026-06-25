// src/pages/Publicar.jsx
// ============================================================
//  UNP Market — Publicar: Formulario de nueva publicación
//
//  Migra publicar.html + secciones 11 y 11B de app.js:
//    - Captura de campos con useState (título, precio, categoría,
//      descripción, archivo de imagen)
//    - Preview local instantáneo (URL.createObjectURL)
//    - Compresión Canvas: MAX 1080px, JPEG 70% (idéntico al original)
//    - Subida a ImgBB
//    - Escritura en Firestore ("productos")
//    - Guard de sesión con onAuthStateChanged
//    - Validación de WhatsApp en perfil del usuario
//    - Contadores de caracteres (título 200, descripción 500)
//    - Estados del botón: Comprimiendo → Subiendo → Publicando
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useNavigate }                 from "react-router-dom";
import {
  collection, addDoc, getDoc,
  doc, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth }           from "../services/firebase";

// ──────────────────────────────────────────────────────────────
//  CONSTANTES (idénticas a app.js original)
// ──────────────────────────────────────────────────────────────
const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const MAX_DIMENSION  = 1080;
const CALIDAD_JPEG   = 0.70;
// ──────────────────────────────────────────────────────────────
//  UTILIDAD: Generador de Prefijos para el buscador
// ──────────────────────────────────────────────────────────────
const generarPrefijos = (texto) => {
  const palabras = (texto || "").toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const prefijos = new Set();
  palabras.forEach(palabra => {
    let prefijo = "";
    for (let i = 0; i < palabra.length; i++) {
      prefijo += palabra[i];
      prefijos.add(prefijo);
    }
  });
  return Array.from(prefijos);
};
// ──────────────────────────────────────────────────────────────
//  UTILIDAD: Compresión Canvas
//  Misma lógica que comprimirImagen() en app.js §11B.
//  Retorna Promise<Blob>.
// ──────────────────────────────────────────────────────────────
const comprimirImagen = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload  = (e) => {
      const img    = new Image();
      img.onerror  = () => reject(new Error("No se pudo cargar la imagen"));
      img.onload   = () => {
        let { width, height } = img;

        // Redimensionar manteniendo el ratio solo si supera el límite
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
          (blob) => resolve(blob ?? file), // fallback al original si canvas falla
          "image/jpeg",
          CALIDAD_JPEG
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

// ──────────────────────────────────────────────────────────────
//  UTILIDAD: Subida a ImgBB
//  Idéntica a subirImagenImgBB() en app.js §3.
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
const Publicar = () => {
  const navigate = useNavigate();

  // ── Estado del usuario autenticado ──
  const [currentUser, setCurrentUser] = useState(null);

  // ── Estado del formulario ──
  const [titulo,      setTitulo]      = useState("");
  const [precio,      setPrecio]      = useState("");
  const [categoria,   setCategoria]   = useState("dulces");
  const [descripcion, setDescripcion] = useState("");
  const [archivo,     setArchivo]     = useState(null);   // File object
  const [previewUrl,  setPreviewUrl]  = useState(null);   // URL.createObjectURL

  // ── Estado del botón de envío ──
  const [btnTexto,    setBtnTexto]    = useState("Publicar Producto");
  const [enviando,    setEnviando]    = useState(false);

  // ── Toast local ──
  const [toast, setToast] = useState(null); // { mensaje, tipo }

  // ── Ref del input file (oculto) ──
  const fileInputRef = useRef(null);

  // ──────────────────────────────────────────────────────────────
  //  Guard de sesión
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
      //  navigate("/login", { replace: true });
      } else {
        setCurrentUser(user);
      }
    });
    return () => unsub();
  }, [navigate]);

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

    // Revocar URL anterior para liberar memoria
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // Limpiar object URL al desmontar
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ──────────────────────────────────────────────────────────────
  //  Submit del formulario
  // ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    // ── NUEVA VALIDACIÓN DE ESPACIOS EN BLANCO ──
    if (titulo.trim() === "" || descripcion.trim() === "") {
      setToast({ mensaje: "El título y la descripción deben contener texto real.", tipo: "error" });
      return;
    }
    // ────────────────────────────────────────────
    if (!currentUser) {
      setToast({ mensaje: "Debes iniciar sesión para publicar.", tipo: "error" });
      return;
    }

    // Validar WhatsApp en perfil (igual que app.js §11)
    const perfilSnap = await getDoc(doc(db, "usuarios", currentUser.uid));
    const perfil     = perfilSnap.exists() ? perfilSnap.data() : {};

    if (!perfil.telefono || perfil.telefono.trim().length < 7) {
      setToast({ mensaje: "⚠️ Configura tu WhatsApp en el perfil para publicar.", tipo: "error" });
      setTimeout(() => navigate("/perfil", { state: { abrirModalEdicion: true } }), 2000);
      return;
    }

    setEnviando(true);

    try {
      // Paso 1: Comprimir
      setBtnTexto("Comprimiendo imagen...");
      const fileComprimido = archivo ? await comprimirImagen(archivo) : null;

      // Paso 2: Subir a ImgBB
      setBtnTexto("Subiendo imagen...");
      const imagenFinal = await subirImagenImgBB(fileComprimido);

      // Paso 3: Guardar en Firestore
      setBtnTexto("Publicando...");
      const nuevoProdRef = await addDoc(collection(db, "productos"), {
        titulo,
        precio:         parseFloat(precio),
        categoria,
        descripcion,
        imagen:         imagenFinal,
        vendedor:       perfil.nombre        || currentUser.displayName || "Vendedor UNP",
        vendedorNombre: perfil.nombre        || currentUser.displayName || "Vendedor UNP",
        avatarVendedor: perfil.avatar        || currentUser.photoURL    || "",
        telefono:       perfil.telefono      || "",
        userUid:        currentUser.uid,
        estado:         "disponible",
        fecha:          serverTimestamp(),
        keywords:       generarPrefijos(titulo),
      });

      // Paso 4: Notificar a los seguidores (Megáfono)
      try {
        const vendedorSnap = await getDoc(doc(db, "usuarios", currentUser.uid));

        if (vendedorSnap.exists()) {
          const datosVendedor = vendedorSnap.data();
          const seguidores    = datosVendedor.seguidores;
          const nombreVendedor = datosVendedor.nombre;

          if (Array.isArray(seguidores) && seguidores.length > 0) {
            const batch = writeBatch(db);

            seguidores.forEach((seguidorUid) => {
              const notifRef = doc(collection(db, "notificaciones"));
              batch.set(notifRef, {
                paraUid:        seguidorUid,
                deUid:          currentUser.uid,
                deNombre:       nombreVendedor || "Un vendedor",
                tipo:           "nuevo_producto",
                productoTitulo: titulo,
                productoId:     nuevoProdRef.id,
                leido:          false,
                timestamp:      serverTimestamp(),
              });
            });

            await batch.commit();
          }
        }
      } catch (notifErr) {
        console.error("Error al notificar a los seguidores:", notifErr);
      }

      // Navegar al home con señal de éxito
      navigate("/", { state: { toastPublicar: true } });

    } catch (err) {
      console.error(err);
      setToast({ mensaje: "Error al publicar. Intenta de nuevo.", tipo: "error" });
      setBtnTexto("Publicar Producto");
      setEnviando(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  Textos descriptivos del área de imagen
  // ──────────────────────────────────────────────────────────────
  const imagenAreaTexto = () => {
    if (!archivo) return "Toca para abrir la cámara o galería";
    const nombre    = archivo.name.length > 30
      ? archivo.name.substring(0, 27) + "..."
      : archivo.name;
    const tamanoMB  = (archivo.size / 1024 / 1024).toFixed(1);
    return `Imagen seleccionada ✓  ${nombre} · ${tamanoMB}MB → se comprimirá al subir`;
  };

  const mostrarInfoCompresion = archivo && archivo.size > 500 * 1024;

  // ──────────────────────────────────────────────────────────────
  //  ESTILOS reutilizables (inline, fieles al original)
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

  const contadorColor = (len, max, umbral) =>
    len > umbral ? "#dc2626" : "#a0a5b9";

  // ──────────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", margin: "0 auto", padding: 0 }}>
 {/* HEADER MINIMALISTA */}
      <header className="header" style={{ justifyContent: 'center', background: 'var(--bg-crema)', padding: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--azul-oscuro)" strokeWidth="2.5" strokeLinecap="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <img src="https://i.ibb.co/fzNKyX51/Dise-o-sin-t-tulo-1.png" alt="Logo" style={{ height: '44px', objectFit: 'contain', mixBlendMode: 'multiply' }} />
      </header>

      {/* FORMULARIO */}
      <main className="publish-container" style={{ background: 'var(--bg-crema)', paddingTop: '10px' }}>
        <form onSubmit={handleSubmit} className="publish-form-card" style={{ background: 'var(--blanco-puro)' }}>
          {/* Ya no ponemos el título aquí porque el logo lo reemplaza */}
          
          {/* ... resto de tus campos (Foto, Título, Precio, Categoría, Descripción) ... */}

          {/* ── FOTO ── */}
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Foto del producto *</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${archivo ? "var(--verde-marca)" : "#c3c6d4"}`,
                borderRadius: "16px", padding: "20px", marginTop: "8px",
                textAlign: "center", background: "var(--bg-crema)", cursor: "pointer",
              }}
            >
              {!previewUrl && <span style={{ fontSize: "2rem" }}>📷</span>}
              <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "#5c5c7a", marginTop: "8px" }}>
                {imagenAreaTexto()}
              </p>
              {previewUrl && <img src={previewUrl} alt="Preview" style={{ width: "100%", height: "150px", objectFit: "cover", borderRadius: "12px", marginTop: "10px" }} />}
            </div>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
          </div>

          {/* ── TÍTULO ── */}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>¿Qué vas a vender?</label>
            <input type="text" required maxLength={200} placeholder="Ej: Galletas de avena" 
                   value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inputStyle} />
          </div>

          {/* ── PRECIO + CATEGORÍA ── */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Precio (S/)</label>
              <input type="number" required placeholder="0.00" value={precio} 
                     onChange={(e) => setPrecio(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1.5 }}>
              <label style={labelStyle}>Categoría</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
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
            <textarea required rows={3} maxLength={500} placeholder="Detalles..." 
                      value={descripcion} onChange={(e) => setDescripcion(e.target.value)} 
                      style={{ ...inputStyle, resize: "none" }} />
          </div>

          {/* ── BOTÓN ── */}
          <button type="submit" disabled={enviando} className="btn-publish-final">
            {enviando ? "Publicando..." : btnTexto}
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

        <button className="nav-item active nav-add" aria-label="Publicar">
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

        <button className="nav-item" onClick={() => navigate("/perfil")} aria-label="Perfil">
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

export default Publicar;