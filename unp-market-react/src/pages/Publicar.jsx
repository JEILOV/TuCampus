// src/pages/Publicar.jsx
import { useState, useEffect, useRef }          from "react";
import { useNavigate }                          from "react-router-dom";
import { doc, getDoc, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { db }                                   from "../services/firebase";
import { useAuth }                              from "../context/AuthContext";
import { comprimirImagen, subirImagenImgBB }    from "../utils/imageUtils";
import { obtenerContactoPrivado }               from "../services/userService";
import { crearProducto }                        from "../services/productService";
import Toast, { useToast }                      from "../components/Toast"; // ✅ Nuevo import
import BottomNav                                from "../components/BottomNav";

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
  const [progreso,    setProgreso]    = useState(0); // 🔧 feedback real de subida (0–100)
  
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

    // 🔒 `perfil.telefono` ya no existe en el doc público (vive en
    // /usuarios/{uid}/privado/contacto). Se valida contra ese contacto
    // real, no contra el perfil público.
    let telefonoConfigurado = "";
    try {
      const contacto = await obtenerContactoPrivado(user.uid);
      telefonoConfigurado = contacto?.telefono || "";
    } catch (err) {
      console.error("[Publicar] Error al verificar contacto privado:", err);
    }
    if (!telefonoConfigurado || telefonoConfigurado.trim().length < 7) {
      mostrarToast("⚠️ Configura tu WhatsApp en el perfil para publicar.", "error");
      setTimeout(() => navigate("/perfil", { state: { abrirModalEdicion: true } }), 2000);
      return;
    }

    setEnviando(true);
    setProgreso(0);
    try {
      setBtnTexto("Comprimiendo imagen...");
      const fileComprimido = archivo ? await comprimirImagen(archivo) : null;
      setProgreso(15);

      setBtnTexto("Subiendo imagen...");
      const imagenFinal = await subirImagenImgBB(fileComprimido, (pct) => {
        // La compresión ya ocupó los primeros 15 puntos; el 85% restante
        // se reparte según el progreso real de bytes subidos a ImgBB.
        setProgreso(15 + Math.round(pct * 0.8));
      });
      setProgreso(95);

      setBtnTexto("Publicando...");
      const nuevoId = await crearProducto({
        titulo, precio, categoria, descripcion,
        imagen: imagenFinal, user, perfil,
      });
      setProgreso(100);

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

          {enviando && (
            <div style={{
              marginTop: "10px", height: "6px", borderRadius: "4px",
              background: "#e8e8f0", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${progreso}%`,
                background: "var(--verde-marca)", borderRadius: "4px",
                transition: "width 0.2s ease",
              }} />
            </div>
          )}
        </form>
      </main>

      {/* BOTTOM NAV */}
      <BottomNav activo="publicar" />

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