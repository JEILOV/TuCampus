// src/pages/Publicar.jsx
import { useState, useEffect, useRef }          from "react";
import { useNavigate }                          from "react-router-dom";
import { doc, getDoc, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { db }                                   from "../services/firebase";
import { useAuth }                              from "../context/AuthContext";
import { comprimirImagen, subirImagenImgBB }    from "../utils/imageUtils";
import { crearProducto }                        from "../services/productService";
import Toast, { useToast }                      from "../components/Toast"; // ✅ Nuevo import

// ── Estilos reutilizables ────────────────────────────────────
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

// ── Componente principal ─────────────────────────────────────
const Publicar = () => {
  const navigate   = useNavigate();
  const { user, perfil } = useAuth();

  const [titulo,      setTitulo]      = useState("");
  const [precio,      setPrecio]      = useState("");
  const [categoria,   setCategoria]   = useState("dulces");
  const [descripcion, setDescripcion] = useState("");
  const [archivo,     setArchivo]     = useState(null);
  const [previewUrl,  setPreviewUrl]  = useState(null);
  const [btnTexto,    setBtnTexto]    = useState("Publicar Producto");
  const [enviando,    setEnviando]    = useState(false);
  
  // ✅ Nuevo manejo de Toasts centralizado
  const [toast, setToast] = useState(null);
  const mostrarToast = useToast(setToast, { single: true });

  const fileInputRef = useRef(null);

  // Limpiar object URL al desmontar
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setArchivo(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (titulo.trim() === "" || descripcion.trim() === "") {
      mostrarToast("El título y la descripción deben contener texto real.", "error");
      return;
    }
    if (!user) {
      mostrarToast("Debes iniciar sesión para publicar.", "error");
      return;
    }
    if (!perfil?.telefono || perfil.telefono.trim().length < 7) {
      mostrarToast("⚠️ Configura tu WhatsApp en el perfil para publicar.", "error");
      setTimeout(() => navigate("/perfil", { state: { abrirModalEdicion: true } }), 2000);
      return;
    }

    setEnviando(true);
    try {
      setBtnTexto("Comprimiendo imagen...");
      const fileComprimido = archivo ? await comprimirImagen(archivo) : null;

      setBtnTexto("Subiendo imagen...");
      const imagenFinal = await subirImagenImgBB(fileComprimido);

      setBtnTexto("Publicando...");
      const nuevoId = await crearProducto({
        titulo, precio, categoria, descripcion,
        imagen: imagenFinal, user, perfil,
      });

      // Notificar a seguidores
      try {
        const vendedorSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (vendedorSnap.exists()) {
          const { seguidores, nombre: nombreVendedor } = vendedorSnap.data();
          if (Array.isArray(seguidores) && seguidores.length > 0) {
            const batch = writeBatch(db);
            seguidores.forEach((seguidorUid) => {
              const notifRef = doc(collection(db, "notificaciones"));
              batch.set(notifRef, {
                paraUid:        seguidorUid,
                deUid:          user.uid,
                deNombre:       nombreVendedor || "Un vendedor",
                tipo:           "nuevo_producto",
                productoTitulo: titulo,
                productoId:     nuevoId,
                leido:          false,
                timestamp:      serverTimestamp(),
              });
            });
            await batch.commit();
          }
        }
      } catch (notifErr) {
        console.warn("[Publicar] Error al notificar seguidores:", notifErr);
      }

      navigate("/", { state: { toastPublicar: true } });
    } catch (err) {
      console.error("[Publicar] Error:", err);
      mostrarToast("Error al publicar. Intenta de nuevo.", "error");
      setBtnTexto("Publicar Producto");
      setEnviando(false);
    }
  };

  const imagenAreaTexto = () => {
    if (!archivo) return "Toca para abrir la cámara o galería";
    const nombre   = archivo.name.length > 30 ? archivo.name.substring(0, 27) + "..." : archivo.name;
    const tamanoMB = (archivo.size / 1024 / 1024).toFixed(1);
    return `Imagen seleccionada ✓  ${nombre} · ${tamanoMB}MB → se comprimirá al subir`;
  };

  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", margin: "0 auto", padding: 0 }}>

      {/* HEADER */}
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

          {/* FOTO */}
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
              {previewUrl && (
                <img src={previewUrl} alt="Preview"
                  style={{ width: "100%", height: "150px", objectFit: "cover", borderRadius: "12px", marginTop: "10px" }} />
              )}
            </div>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
          </div>

          {/* TÍTULO */}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>¿Qué vas a vender?</label>
            <input type="text" required maxLength={200} placeholder="Ej: Galletas de avena"
              value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inputStyle} />
          </div>

          {/* PRECIO + CATEGORÍA */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Precio (S/)</label>
              <input type="number" required placeholder="0.00"
                value={precio} onChange={(e) => setPrecio(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1.5 }}>
              <label style={labelStyle}>Categoría</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="dulces">🍰 Dulces</option>
                <option value="salados">🍔 Salados</option>
                <option value="bebidas">🥤 Bebidas</option>
                <option value="servicios">🔧 Servicios</option>
                <option value="materiales">📚 Materiales</option>
              </select>
            </div>
          </div>

          {/* DESCRIPCIÓN */}
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Descripción</label>
            <textarea required rows={3} maxLength={500} placeholder="Detalles..."
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              style={{ ...inputStyle, resize: "none" }} />
          </div>

          <button type="submit" disabled={enviando} className="btn-publish-final">
            {enviando ? btnTexto : "Publicar Producto"}
          </button>
        </form>
      </main>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav">
        <button className="nav-item" onClick={() => navigate("/")} aria-label="Inicio">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span className="nav-label">Inicio</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/?tab=favoritos")} aria-label="Favoritos">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span className="nav-label">Favoritos</span>
        </button>
        <button className="nav-item active nav-add" aria-label="Publicar">
          <div className="nav-add-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
          <span className="nav-label">Publicar</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/?tab=notifs")} aria-label="Notificaciones">
          <div className="nav-icon-wrap"><svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
          <span className="nav-label">Notifs</span>
        </button>
        <button className="nav-item" onClick={() => navigate("/perfil")} aria-label="Perfil">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span className="nav-label">Perfil</span>
        </button>
      </nav>

      {/* ✅ TOAST LIMPIO */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "84px", left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, width: "calc(100% - 40px)", maxWidth: "390px", pointerEvents: "none",
        }}>
          <Toast mensaje={toast.mensaje} tipo={toast.tipo} />
        </div>
      )}
    </div>
  );
};

export default Publicar;