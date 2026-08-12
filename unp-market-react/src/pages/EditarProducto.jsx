// src/pages/EditarProducto.jsx
import { useState, useEffect, useRef }  from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc }                  from "firebase/firestore";
import { ChevronLeft, Camera, Send }    from "lucide-react";
import { db }                           from "../services/firebase";
import { useAuth }                      from "../context/AuthContext";
import { comprimirImagen, subirImagenImgBB } from "../utils/imageUtils";
import { actualizarProducto, normalizarCategoria } from "../services/productService";
import Spinner                          from "../components/Spinner";
import Toast, { useToast }              from "../components/Toast";

// Mismo ícono de mascota que usa Publicar.jsx / Home.jsx, para
// mantener el header idéntico entre ambas pantallas.
const MASCOTA_ICONO = "/assets/mascota-icono-placeholder.png";

// ── Estilos reutilizables (Tailwind, mismo lenguaje que Publicar.jsx) ──
const inputClass =
  "w-full box-border rounded-btn border-[1.5px] border-ink/10 bg-background px-3.5 py-3 text-[15px] font-bold text-ink outline-none focus:border-primary/40";
const labelClass = "text-[13.5px] font-bold text-ink";

// ── Componente principal ─────────────────────────────────────
const EditarProducto = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const productoId     = searchParams.get("id");

  const { user } = useAuth();

  const [titulo,         setTitulo]         = useState("");
  const [precio,         setPrecio]         = useState("");
  const [categoria,      setCategoria]      = useState("comida");
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
        // 🔧 Migración de taxonomía: si el producto se publicó con una
        // categoría obsoleta ('dulces', 'salados', 'bebidas'), la
        // mapeamos aquí a la nueva. Sin esto, el <select> mostraría un
        // <option> inexistente (quedaría en blanco/desincronizado) y,
        // más grave, si el usuario guarda sin tocar el campo, se
        // reenviaría el valor viejo y actualizarProducto lo rechazaría
        // con "Categoría inválida.".
        setCategoria(normalizarCategoria(data.categoria) || "comida");
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
    <div className="app-shell bg-background pb-8 font-sans">

      {/* ════════════════════════════════════════════════════
             HEADER AZUL (mismo patrón que Publicar.jsx)
        ════════════════════════════════════════════════════ */}
      <header className="relative rounded-b-[32px] bg-primary px-6 pb-10 pt-8">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="absolute left-5 top-8 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex items-center justify-center gap-3">
          <img src={MASCOTA_ICONO} alt="TuCampus" className="h-14 w-14 object-contain" />
          <div className="text-left">
            <p className="text-2xl font-extrabold leading-none text-background">TuCampus</p>
            <p className="mt-1 text-[12px] font-medium text-background/75">Edita tu producto</p>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════
             TARJETA BLANCA SUPERPUESTA — Formulario
        ════════════════════════════════════════════════════ */}
      <main className="relative -mt-6 px-4">
        <form onSubmit={handleSubmit} className="rounded-t-[32px] bg-card p-5 pb-6 shadow-soft">

          {/* FOTO */}
          <div className="mb-5">
            <label className={labelClass}>Foto del producto *</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`mt-2 cursor-pointer rounded-2xl border-2 border-dashed bg-background p-5 text-center transition-colors ${
                (archivo || imagenOriginal) ? "border-[#287653]" : "border-ink/15"
              }`}
            >
              {!previewUrl && (
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera size={26} />
                </span>
              )}

              <p className="mt-2 text-[13px] font-bold text-ink/70">{imagenAreaTexto()}</p>

              {previewUrl && (
                <img src={previewUrl} alt="Preview"
                  className="mt-3 h-[150px] w-full rounded-2xl object-cover" />
              )}
            </div>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          </div>

          {/* TÍTULO */}
          <div className="mb-4">
            <label className={labelClass}>¿Qué vas a vender?</label>
            <input type="text" required maxLength={200} placeholder="Ej: Galletas de avena"
              value={titulo} onChange={(e) => setTitulo(e.target.value)}
              className={`${inputClass} mt-2`} />
          </div>

          {/* PRECIO + CATEGORÍA */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Precio (S/)</label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-extrabold text-ink/40">
                  S/
                </span>
                <input type="number" required placeholder="0.00" min="0.01" max="10000" step="0.01"
                  value={precio} onChange={(e) => setPrecio(e.target.value)}
                  className={`${inputClass} pl-9`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Categoría</label>
              {/* 🔧 Mismo set que Publicar.jsx / Home.jsx — ver
                  CATEGORIAS_VALIDAS en services/productService.js. */}
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
                className={`${inputClass} mt-2 cursor-pointer`}>
                <option value="comida">🍔 Comida & Snacks</option>
                <option value="tecnologia">🎧 Tecnología</option>
                <option value="ropa">👕 Ropa & Moda</option>
                <option value="materiales">📚 Materiales & Libros</option>
                <option value="servicios">🛠️ Servicios & Tipeos</option>
                <option value="otros">📦 Otros</option>
              </select>
            </div>
          </div>

          {/* DESCRIPCIÓN */}
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Descripción</label>
              <span className="text-[11px] font-semibold text-ink/30">{descripcion.length}/500</span>
            </div>
            <textarea required rows={3} maxLength={500} placeholder="Cuéntanos más detalles de tu producto..."
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              className={`${inputClass} mt-2 resize-none`} />
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary py-4 text-[15px] font-extrabold text-white shadow-soft transition-opacity disabled:opacity-70"
          >
            <Send size={18} />
            {enviando ? btnTexto : "Guardar Cambios"}
          </button>
        </form>
      </main>

      {/* ✅ TOAST LIMPIO */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[1000] w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2">
          <Toast mensaje={toast.mensaje} tipo={toast.tipo} />
        </div>
      )}
    </div>
  );
};

export default EditarProducto;