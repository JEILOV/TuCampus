// src/pages/Publicar.jsx
import { useState, useEffect, useRef }          from "react";
import { useNavigate }                          from "react-router-dom";
import { doc, getDoc, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { ChevronLeft, Camera, Lightbulb, Send } from "lucide-react";
import { db }                                   from "../services/firebase";
import { useAuth }                              from "../context/AuthContext";
import { comprimirImagen, subirImagenImgBB }    from "../utils/imageUtils";
import { obtenerContactoPrivado }               from "../services/userService";
import { crearProducto }                        from "../services/productService";
import Toast, { useToast }                      from "../components/Toast"; // ✅ Nuevo import

// Placeholder — reemplazar por el archivo final de la mascota (mismo
// ícono que ya usa el header de Home.jsx, para mantener consistencia).
const MASCOTA_ICONO = "/assets/mascota-icono-placeholder.png";

// ── Estilos reutilizables (Tailwind, mismo lenguaje que Perfil.jsx) ──
const inputClass =
  "w-full box-border rounded-btn border-[1.5px] border-ink/10 bg-background px-3.5 py-3 text-[15px] font-bold text-ink outline-none focus:border-primary/40";
const labelClass = "text-[13.5px] font-bold text-ink";

// ── Componente principal ─────────────────────────────────────
const Publicar = () => {
  const navigate   = useNavigate();
  const { user, perfil } = useAuth();

  const [titulo,      setTitulo]      = useState("");
  const [precio,      setPrecio]      = useState("");
  const [categoria,   setCategoria]   = useState("comida");
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
  // 🔧 Ref (no state) para bloquear doble-submit al instante: `disabled`
  // depende de un re-render de React, así que un doble clic o Enter
  // repetido podría disparar handleSubmit dos veces antes de que el
  // botón se deshabilite visualmente. El ref se lee/escribe de forma
  // síncrona, sin esperar al render.
  const enviandoRef = useRef(false);

  // Limpiar object URL al desmontar
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const MAX_IMAGEN_MB = 5;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 🔧 Validar ANTES de aceptar el archivo: sin esto, un archivo
    // gigante o de tipo inválido puede colgar la compresión con
    // Canvas más adelante y terminar en un "Error al publicar"
    // genérico que no le dice nada al usuario sobre la causa real.
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
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
      mostrarToast("Debes iniciar sesión para publicar.", "error");
      enviandoRef.current = false;
      return;
    }

    // 🔧 Validación de precio ANTES de enviar. Las reglas de seguridad
    // de Firestore exigen precio > 0 y <= 10000; si no se valida aquí,
    // el usuario recibe un "Error al publicar" genérico causado por un
    // PERMISSION_DENIED silencioso en vez de un mensaje claro.
    const precioNum = parseFloat(precio);
    if (!Number.isFinite(precioNum) || precioNum <= 0 || precioNum > 10000) {
      mostrarToast("El precio debe ser mayor a S/0 y no superar S/10,000.", "error");
      enviandoRef.current = false;
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
      enviandoRef.current = false;
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
        titulo, precio: precioNum, categoria, descripcion,
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
      enviandoRef.current = false;
    }
  };

  const imagenAreaTexto = () => {
    if (!archivo) return "Toca para abrir la cámara o galería";
    const nombre   = archivo.name.length > 30 ? archivo.name.substring(0, 27) + "..." : archivo.name;
    const tamanoMB = (archivo.size / 1024 / 1024).toFixed(1);
    return `Imagen seleccionada ✓  ${nombre} · ${tamanoMB}MB → se comprimirá al subir`;
  };

  return (
    <div className="app-shell bg-background pb-8 font-sans">

      {/* ════════════════════════════════════════════════════
             HEADER AZUL (mismo patrón que Home.jsx)
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
            <p className="mt-1 text-[12px] font-medium text-background/75">Conecta. Comparte. Crece.</p>
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
                archivo ? "border-[#287653]" : "border-ink/15"
              }`}
            >
              {!previewUrl && (
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera size={26} />
                </span>
              )}

              {!archivo ? (
                <>
                  <p className="mt-2 text-[14.5px] font-extrabold text-ink">{imagenAreaTexto()}</p>
                  <p className="mt-1 text-[12px] font-semibold text-ink/40">Formatos: JPG, PNG · Máx. 5MB</p>
                </>
              ) : (
                <p className="mt-2 text-[12.5px] font-bold text-ink/60">{imagenAreaTexto()}</p>
              )}

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
                <input type="number" required placeholder="0.00"
                  min="0.01" max="10000" step="0.01"
                  value={precio} onChange={(e) => setPrecio(e.target.value)}
                  className={`${inputClass} pl-9`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Categoría</label>
              {/* 🔧 Debe coincidir EXACTAMENTE (mismos values) con
                  CATEGORIAS en Home.jsx y CATEGORIAS_VALIDAS en
                  services/productService.js. */}
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

          {/* CONSEJO */}
          <div className="mb-5 flex gap-2.5 rounded-2xl bg-primary/5 p-3.5">
            <Lightbulb size={18} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-extrabold text-ink">Consejo</p>
              <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-ink/60">
                Sé claro y específico para que más estudiantes encuentren tu producto.
              </p>
            </div>
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary py-4 text-[15px] font-extrabold text-white shadow-soft transition-opacity disabled:opacity-70"
          >
            <Send size={18} />
            {enviando ? btnTexto : "Publicar producto"}
          </button>

          {enviando && (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-[#287653] transition-[width] duration-200"
                style={{ width: `${progreso}%` }}
              />
            </div>
          )}
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

export default Publicar;