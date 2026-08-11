// src/pages/EditarProducto.jsx
import { useState, useEffect, useRef }  from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc }                  from "firebase/firestore";
import { db }                           from "../services/firebase";
import { useAuth }                      from "../context/AuthContext";
import { comprimirImagen, subirImagenImgBB } from "../utils/imageUtils";
import { actualizarProducto }           from "../services/productService";
import Spinner                          from "../components/Spinner"; // ✅ Nuevo import
import Toast, { useToast }              from "../components/Toast";   // ✅ Nuevo import
import BottomNav                        from "../components/BottomNav";
import BotonNotificaciones              from "../components/BotonNotificaciones";

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
const EditarProducto = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const productoId     = searchParams.get("id");

  const { user } = useAuth();

  const [titulo,         setTitulo]         = useState("");
  const [precio,         setPrecio]         = useState("");
  const [categoria,      setCategoria]      = useState("dulces");
  const [descripcion,    setDescripcion]    = useState("");
  const [archivo,        setArchivo]        = useState(null);
  const [previewUrl,     setPreviewUrl]     = useState(null);
  const [imagenOriginal, setImagenOriginal] = useState("");
  const [btnTexto,       setBtnTexto]       = useState("Guardar Cambios");
  const [enviando,       setEnviando]       = useState(false);
  const [cargando,       setCargando]       = useState(true);
  
  // ✅ Nuevo manejo de Toasts centralizado
  const [toast, setToast] = useState(null);
  const mostrarToast = useToast(setToast, { single: true });

  const fileInputRef = useRef(null);
  const enviandoRef = useRef(false); // 🔧 guard contra doble-submit, ver Publicar.jsx

  // Carga del producto
  useEffect(() => {
    if (!productoId) {
      navigate("/", { replace: true });
      return;
    }
    if (!user) return;

    const cargar = async () => {
      try {
        const snap = await getDoc(doc(db, "productos", productoId));

        if (!snap.exists()) {
          navigate("/", { replace: true });
          return;
        }

        const data = snap.data();

        if (data.userUid !== user.uid) {
          navigate("/", { replace: true });
          return;
        }

        setTitulo(data.titulo       || "");
        setPrecio(data.precio !== undefined ? String(data.precio) : "");
        setCategoria(data.categoria || "dulces");
        setDescripcion(data.descripcion || "");
        setImagenOriginal(data.imagen   || "");
        setPreviewUrl(data.imagen       || null);
      } catch (err) {
        console.error("Error al cargar el producto:", err);
        mostrarToast("No se pudo cargar el producto.", "error");
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, [productoId, user, navigate]);

  // Limpiar object URL al desmontar
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const MAX_IMAGEN_MB = 5;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      mostrarToast("El archivo debe ser una imagen (JPG o PNG).", "error");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGEN_MB * 1024 * 1024) {
      mostrarToast(`La imagen supera ${MAX_IMAGEN_MB}MB. Elige una más liviana.`, "error");
      e.target.value = "";
      return;
    }

    setArchivo(file);
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (enviandoRef.current) return; // ya hay un envío en curso, ignorar
    enviandoRef.current = true;

    if (titulo.trim() === "" || descripcion.trim() === "") {
      mostrarToast("El título y la descripción deben contener texto real.", "error");
      enviandoRef.current = false;
      return;
    }
    if (!user) {
      mostrarToast("Debes iniciar sesión para editar.", "error");
      enviandoRef.current = false;
      return;
    }

    // 🔧 Misma validación que Publicar.jsx: las reglas de Firestore
    // exigen precio > 0 y <= 10000 también en `update`.
    const precioNum = parseFloat(precio);
    if (!Number.isFinite(precioNum) || precioNum <= 0 || precioNum > 10000) {
      mostrarToast("El precio debe ser mayor a S/0 y no superar S/10,000.", "error");
      enviandoRef.current = false;
      return;
    }

    setEnviando(true);
    try {
      let imagenFinal = imagenOriginal;

      if (archivo) {
        setBtnTexto("Comprimiendo imagen...");
        const fileComprimido = await comprimirImagen(archivo);
        setBtnTexto("Subiendo imagen...");
        imagenFinal = await subirImagenImgBB(fileComprimido);
      }

      setBtnTexto("Guardando...");
      await actualizarProducto(productoId, {
        titulo, precio: precioNum, categoria, descripcion,
        imagen: imagenFinal,
        imagenOriginal,
      });

      navigate("/perfil", { state: { toastEditar: true } });
    } catch (err) {
      console.error("[EditarProducto] Error:", err);
      mostrarToast("Error al guardar. Intenta de nuevo.", "error");
      setBtnTexto("Guardar Cambios");
      setEnviando(false);
      enviandoRef.current = false;
    }
  };

  const imagenAreaTexto = () => {
    if (!archivo) {
      return imagenOriginal
        ? "Imagen actual ✓  Toca para cambiarla"
        : "Toca para abrir la cámara o galería";
    }
    const nombre   = archivo.name.length > 30 ? archivo.name.substring(0, 27) + "..." : archivo.name;
    const tamanoMB = (archivo.size / 1024 / 1024).toFixed(1);
    return `Imagen seleccionada ✓  ${nombre} · ${tamanoMB}MB → se comprimirá al subir`;
  };

  // ✅ Pantalla de carga limpia utilizando el nuevo Spinner
  if (cargando) return <Spinner mensaje="Cargando producto..." />;

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
              <input type="number" required placeholder="0.00" min="0.01" max="10000" step="0.01"
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
            {enviando ? btnTexto : "Guardar Cambios"}
          </button>
        </form>
      </main>

      {/* BOTTOM NAV */}
      <BotonNotificaciones />
      <BottomNav />

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

export default EditarProducto;