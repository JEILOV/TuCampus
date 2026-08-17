// src/pages/EditarProducto.jsx
import { useState, useEffect, useRef }  from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc }                  from "firebase/firestore";
import { ChevronLeft, Camera, Send, X, Plus } from "lucide-react";
import { db }                           from "../services/firebase";
import { useAuth }                      from "../context/AuthContext";
import { subirImagenes }                from "../utils/imageUtils";
import { actualizarProducto, normalizarCategoria, normalizarCondicion } from "../services/productService";
import Spinner                          from "../components/Spinner";
import Toast, { useToast }              from "../components/Toast";

// 🖼️ Mismo tope que Publicar.jsx / productService.js.
const MAX_FOTOS = 4;

// 🏷️ Mismo set (values) que en Publicar.jsx / productService.js /
// firestore.rules.
const CONDICIONES = [
  { value: "nuevo",      label: "Nuevo" },
  { value: "como_nuevo", label: "Como nuevo" },
  { value: "usado",      label: "Usado" },
];

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
  const [condicion,      setCondicion]      = useState("usado");
  const [descripcion,    setDescripcion]    = useState("");
  // 🖼️ Hasta MAX_FOTOS "slots", en el orden en que se muestran/envían.
  // kind: "existing" (ya en Firestore, `url` es la URL pública real,
  // no hay que volver a subirla) | "new" (recién elegida en este
  // dispositivo, `url` es un object URL de preview y `file` es lo que
  // hay que comprimir + subir al guardar).
  const [fotos,          setFotos]          = useState([]);
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
        // 🔧 Retrocompatibilidad: productos publicados antes de este
        // campo no traen `condicion` — normalizarCondicion() cae al
        // valor por defecto ("usado") en vez de dejar el selector vacío.
        setCondicion(normalizarCondicion(data.condicion));
        setDescripcion(data.descripcion || "");

        // 🔧 Retrocompatibilidad: productos publicados antes de este
        // cambio no tienen `imagenes` (array) — solo `imagen` (string).
        // Mismo fallback que Producto.jsx.
        const imagenesExistentes = Array.isArray(data.imagenes) && data.imagenes.length > 0
          ? data.imagenes
          : [data.imagen].filter(Boolean);

        setFotos(
          imagenesExistentes.slice(0, MAX_FOTOS).map((url, idx) => ({
            id:   `existing-${idx}-${url}`,
            kind: "existing",
            url,
          })),
        );
      } catch (err) {
        console.error("Error al cargar el producto:", err);
        mostrarToast("No se pudo cargar el producto.", "error");
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, [productoId, user, navigate]);

  // Limpiar los object URL de fotos NUEVAS al desmontar (las
  // "existing" son URLs remotas reales, no hay nada que revocar ahí).
  useEffect(() => {
    return () => {
      fotos.forEach((f) => { if (f.kind === "new") URL.revokeObjectURL(f.url); });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const MAX_IMAGEN_MB = 5;

  const handleFileChange = (e) => {
    const filesSeleccionados = Array.from(e.target.files || []);
    e.target.value = "";

    if (filesSeleccionados.length === 0) return;

    const espacioDisponible = MAX_FOTOS - fotos.length;
    if (espacioDisponible <= 0) {
      mostrarToast(`Ya tienes el máximo de ${MAX_FOTOS} fotos.`, "error");
      return;
    }

    const nuevas = [];
    const descartadosPorLimite = filesSeleccionados.length > espacioDisponible;

    for (const file of filesSeleccionados.slice(0, espacioDisponible)) {
      if (!file.type.startsWith("image/")) {
        mostrarToast("Cada archivo debe ser una imagen (JPG o PNG).", "error");
        continue;
      }
      if (file.size > MAX_IMAGEN_MB * 1024 * 1024) {
        mostrarToast(`"${file.name}" supera ${MAX_IMAGEN_MB}MB. Elige una más liviana.`, "error");
        continue;
      }
      nuevas.push({
        id:   `new-${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "new",
        file,
        url:  URL.createObjectURL(file),
      });
    }

    if (nuevas.length > 0) setFotos((prev) => [...prev, ...nuevas]);
    if (descartadosPorLimite) {
      mostrarToast(`Solo se agregaron ${espacioDisponible} foto(s): el máximo es ${MAX_FOTOS}.`, "error");
    }
  };

  const quitarFoto = (id) => {
    setFotos((prev) => {
      const objetivo = prev.find((f) => f.id === id);
      if (objetivo?.kind === "new") URL.revokeObjectURL(objetivo.url);
      return prev.filter((f) => f.id !== id);
    });
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
      const fotosNuevas = fotos.filter((f) => f.kind === "new");

      let urlsNuevas = [];
      if (fotosNuevas.length > 0) {
        setBtnTexto(fotosNuevas.length > 1 ? "Subiendo fotos..." : "Subiendo imagen...");
        urlsNuevas = await subirImagenes(fotosNuevas.map((f) => f.file));
      }

      // 🔧 Reconstruye el array final RESPETANDO el orden visual actual
      // (drag no soportado, pero sí quitar/agregar en cualquier orden):
      // cada slot "existing" aporta su URL tal cual, cada "new" toma la
      // siguiente URL recién subida, en el mismo orden en que se subieron.
      let cursor = 0;
      const imagenesFinal = fotos.map((f) =>
        f.kind === "existing" ? f.url : urlsNuevas[cursor++],
      );

      setBtnTexto("Guardando...");
      await actualizarProducto(productoId, {
        titulo, precio: precioNum, categoria, condicion, descripcion,
        imagenes: imagenesFinal,
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

          {/* FOTOS (hasta 4) */}
          <div className="mb-5">
            <div className="flex items-baseline justify-between">
              <label className={labelClass}>Fotos del producto</label>
              <span className="text-[11px] font-semibold text-ink/40">{fotos.length}/{MAX_FOTOS}</span>
            </div>

            {fotos.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 cursor-pointer rounded-2xl border-2 border-dashed border-ink/15 bg-background p-5 text-center transition-colors"
              >
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera size={26} />
                </span>
                <p className="mt-2 text-[14.5px] font-extrabold text-ink">Toca para abrir la cámara o galería</p>
                <p className="mt-1 text-[12px] font-semibold text-ink/40">
                  Hasta {MAX_FOTOS} fotos · JPG, PNG · Máx. 5MB c/u
                </p>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {fotos.map((f, idx) => (
                  <div key={f.id} className="relative aspect-square overflow-hidden rounded-2xl bg-background">
                    <img src={f.url} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 rounded-chip bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        Portada
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => quitarFoto(f.id)}
                      aria-label={`Quitar foto ${idx + 1}`}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>
                  </div>
                ))}

                {fotos.length < MAX_FOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Agregar foto"
                    className="flex aspect-square items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 bg-background text-ink/30 transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Plus size={22} />
                  </button>
                )}
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
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

          {/* CONDICIÓN */}
          <div className="mb-4">
            <label className={labelClass}>Condición</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {CONDICIONES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCondicion(c.value)}
                  aria-pressed={condicion === c.value}
                  className={`rounded-btn border-[1.5px] py-2.5 text-[12.5px] font-extrabold transition-colors ${
                    condicion === c.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-ink/10 bg-background text-ink/60"
                  }`}
                >
                  {c.label}
                </button>
              ))}
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
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary py-4 text-[15px] font-extrabold text-white shadow-soft transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
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