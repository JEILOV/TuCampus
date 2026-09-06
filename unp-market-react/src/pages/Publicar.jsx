// src/pages/Publicar.jsx
import { useState, useEffect, useRef }          from "react";
import { useNavigate }                          from "react-router-dom";
import { doc, getDoc, collection, writeBatch, serverTimestamp } from "firebase/firestore";
import { ChevronLeft, Camera, Lightbulb, Send, X, Plus } from "lucide-react";
import { db }                                   from "../services/firebase";
import { useAuth }                              from "../context/AuthContext";
import { comprimirImagen, subirBlobsComprimidos } from "../utils/imageUtils";
import { obtenerContactoPrivado }               from "../services/userService";
import { crearProducto }                        from "../services/productService";
import Toast, { useToast }                      from "../components/Toast"; // ✅ Nuevo import

// 🖼️ Múltiples fotos por producto — ver EditarProducto.jsx (misma
// constante, mismo comportamiento) y productService.js (mismo tope
// del lado del servidor).
const MAX_FOTOS = 4;

// 🏷️ Condición del producto — mismo set (values) que
// CONDICIONES_VALIDAS en productService.js y que la whitelist de
// esProductoValido() en firestore.rules. Ver también EditarProducto.jsx.
const CONDICIONES = [
  { value: "nuevo",      label: "Nuevo" },
  { value: "como_nuevo", label: "Como nuevo" },
  { value: "usado",      label: "Usado" },
];

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
  // 🏷️ Default "usado": es el caso más común en un marketplace estudiantil.
  const [condicion,   setCondicion]   = useState("usado");
  const [descripcion, setDescripcion] = useState("");
  // 🖼️ Hasta MAX_FOTOS fotos. `previews` guarda { id, blob, url } por
  // foto: `blob` es el resultado YA COMPRIMIDO de comprimirImagen()
  // (NO el `File` crudo del selector — ver handleFileChange para el
  // motivo), y `url` es un object URL de ESE blob para la vista previa
  // (se debe revocar al quitar la foto o desmontar, para no filtrar
  // memoria).
  const [previews,    setPreviews]    = useState([]);
  const [btnTexto,    setBtnTexto]    = useState("Publicar Producto");
  const [enviando,    setEnviando]    = useState(false);
  const [progreso,    setProgreso]    = useState(0); // 🔧 feedback real de subida (0–100)
  // 🔧 true mientras se comprimen las fotos recién elegidas (ver
  // handleFileChange). Sirve para deshabilitar el selector mientras
  // tanto y no encolar compresiones superpuestas.
  const [procesandoImagenes, setProcesandoImagenes] = useState(false);
  
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

  // Limpiar TODOS los object URL al desmontar (no solo al cambiar,
  // sino también los que ya existían al momento de desmontar).
  useEffect(() => {
    return () => { previews.forEach((p) => URL.revokeObjectURL(p.url)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const MAX_IMAGEN_MB = 5;

  const handleFileChange = async (e) => {
    const filesSeleccionados = Array.from(e.target.files || []);
    e.target.value = ""; // permite volver a elegir el mismo archivo más adelante

    if (filesSeleccionados.length === 0) return;

    const espacioDisponible = MAX_FOTOS - previews.length;
    if (espacioDisponible <= 0) {
      mostrarToast(`Ya elegiste el máximo de ${MAX_FOTOS} fotos.`, "error");
      return;
    }

    const candidatos = [];
    const descartadosPorLimite = filesSeleccionados.length > espacioDisponible;

    for (const file of filesSeleccionados.slice(0, espacioDisponible)) {
      // 🔧 Validar ANTES de aceptar el archivo: sin esto, un archivo
      // gigante o de tipo inválido puede colgar la compresión con
      // Canvas más adelante y terminar en un "Error al publicar"
      // genérico que no le dice nada al usuario sobre la causa real.
      if (!file.type.startsWith("image/")) {
        mostrarToast("Cada archivo debe ser una imagen (JPG o PNG).", "error");
        continue;
      }
      if (file.size > MAX_IMAGEN_MB * 1024 * 1024) {
        mostrarToast(`"${file.name}" supera ${MAX_IMAGEN_MB}MB. Elige una más liviana.`, "error");
        continue;
      }
      candidatos.push(file);
    }

    if (candidatos.length === 0) return;

    // 🔧 CRÍTICO (bug de Android): se comprime AHORA, en el mismo
    // gesto en que el usuario elige la foto — NO se espera al submit.
    //
    // Por qué: el `File` que entrega el selector de Android apunta a
    // un descriptor de lectura temporal (algo tipo
    // /data/.../cache/...). Ese descriptor puede ser revocado por el
    // sistema apenas se cierra el picker de fotos. Si el `File` crudo
    // se guarda en el estado y recién se lee/comprime al hacer clic en
    // "Publicar" —minutos después, mientras el usuario llenaba título,
    // precio, etc.— la lectura (`file.arrayBuffer()`, que usa
    // comprimirImagen() por dentro) revienta con:
    //   NotReadableError: The requested file could not be read...
    //
    // La solución: leer y comprimir el archivo ACÁ, apenas se
    // selecciona, y guardar en el estado el `Blob` YA comprimido (que
    // vive en memoria, sin depender de ningún descriptor de archivo
    // del sistema operativo). El submit, más abajo, solo sube esos
    // Blobs con subirBlobsComprimidos() — nunca vuelve a tocar el
    // `File` original.
    setProcesandoImagenes(true);
    const nuevos = [];
    try {
      for (const file of candidatos) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const blob = await comprimirImagen(file);
          nuevos.push({
            id:   `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
            blob,
            url:  URL.createObjectURL(blob), // preview del BLOB comprimido, no del file original
          });
        } catch (err) {
          // Si comprimirImagen() falla acá (archivo corrupto, etc.) se
          // descarta esa foto puntual y se avisa — no se guarda ningún
          // File crudo "por las dudas" que después vuelva a fallar en
          // el submit.
          console.error("[Publicar] Error al procesar imagen:", err);
          mostrarToast(`No se pudo procesar "${file.name}". Probá con otra foto.`, "error");
        }
      }
    } finally {
      setProcesandoImagenes(false);
    }

    if (nuevos.length > 0) {
      setPreviews((prev) => [...prev, ...nuevos]);
    }
    if (descartadosPorLimite) {
      mostrarToast(`Solo se agregaron ${espacioDisponible} foto(s): el máximo es ${MAX_FOTOS}.`, "error");
    }
  };

  const quitarFoto = (id) => {
    setPreviews((prev) => {
      const objetivo = prev.find((p) => p.id === id);
      if (objetivo) URL.revokeObjectURL(objetivo.url);
      return prev.filter((p) => p.id !== id);
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
      setBtnTexto(previews.length > 1 ? "Subiendo fotos..." : "Subiendo imagen...");
      // 🔧 Los Blobs en `previews` ya están comprimidos desde el
      // momento en que se seleccionaron (ver handleFileChange) — acá
      // solo se suben, sin tocar `File`s ni descriptores del sistema
      // operativo que ya pudieron caducar.
      // Si subirBlobsComprimidos() rechaza, el `await` de abajo corta
      // la ejecución acá mismo — crearProducto() (y por lo tanto la
      // escritura en Firestore) NUNCA se llega a invocar. No hace
      // falta un flag ni un early-return extra: un solo try secuencial
      // ya garantiza que no se cree un producto sin sus fotos.
      const imagenesFinal = await subirBlobsComprimidos(
        previews.map((p) => p.blob),
        (pct) => setProgreso(pct),
      );

      setBtnTexto("Publicando...");
      const nuevoId = await crearProducto({
        titulo, precio: precioNum, categoria, condicion, descripcion,
        imagenes: imagenesFinal, user, perfil,
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
      // 🔧 err.code viene de subirImagenImgBB() (imageUtils.js) cuando
      // el fallo es de la subida de imagen — nos deja distinguir un
      // 413/504/timeout de mobile de un error genérico de Firestore,
      // en vez de mostrar siempre el mismo "Error al publicar" sin
      // pista de qué pasó.
      const MENSAJES_ERROR = {
        PAYLOAD_TOO_LARGE: "La foto es demasiado pesada para subir. Probá con otra foto o mejorá tu conexión.",
        UPLOAD_TIMEOUT:     "La subida tardó demasiado — tu conexión puede estar lenta. Intenta de nuevo.",
        NETWORK_ERROR:      "Se perdió la conexión al subir la imagen. Verifica tu señal e intenta de nuevo.",
        IMGBB_TIMEOUT:      "El servidor de imágenes tardó demasiado en responder. Intenta de nuevo.",
        IMGBB_REJECTED:     "El servidor de imágenes rechazó la foto. Probá con otra.",
      };
      // 🔧 Fallback: err.message (NO un string genérico hardcodeado).
      // Cualquier error que NO sea de subida de imagen — típicamente
      // de productService.crearProducto — ya llega con un mensaje
      // específico armado por traducirError() (ver errorHandler.js),
      // ej. "No tienes permiso para realizar esta acción." en vez de
      // un genérico "Error al publicar" que no dice nada del motivo
      // real. Antes se descartaba ese mensaje sin usarlo.
      mostrarToast(MENSAJES_ERROR[err?.code] || err?.message || "Error al publicar. Intenta de nuevo.", "error");
      setBtnTexto("Publicar Producto");
      setEnviando(false);
      enviandoRef.current = false;
    }
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

          {/* FOTOS (hasta 4) */}
          <div className="mb-5">
            <div className="flex items-baseline justify-between">
              <label className={labelClass}>Fotos del producto</label>
              <span className="text-[11px] font-semibold text-ink/40">
                {procesandoImagenes ? "Procesando..." : `${previews.length}/${MAX_FOTOS}`}
              </span>
            </div>

            {previews.length === 0 ? (
              <div
                onClick={() => !procesandoImagenes && fileInputRef.current?.click()}
                aria-disabled={procesandoImagenes}
                className={`mt-2 rounded-2xl border-2 border-dashed border-ink/15 bg-background p-5 text-center transition-colors ${
                  procesandoImagenes ? "cursor-wait opacity-60" : "cursor-pointer"
                }`}
              >
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera size={26} />
                </span>
                <p className="mt-2 text-[14.5px] font-extrabold text-ink">
                  {procesandoImagenes ? "Procesando foto..." : "Toca para abrir la cámara o galería"}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-ink/40">
                  Hasta {MAX_FOTOS} fotos · JPG, PNG · Máx. 5MB c/u
                </p>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {previews.map((p, idx) => (
                  <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-background">
                    <img src={p.url} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute bottom-1 left-1 rounded-chip bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        Portada
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => quitarFoto(p.id)}
                      aria-label={`Quitar foto ${idx + 1}`}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>
                  </div>
                ))}

                {previews.length < MAX_FOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={procesandoImagenes}
                    aria-label="Agregar foto"
                    className="flex aspect-square items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 bg-background text-ink/30 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60"
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
              disabled={procesandoImagenes}
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
            disabled={enviando || procesandoImagenes}
            className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary py-4 text-[15px] font-extrabold text-white shadow-soft transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
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