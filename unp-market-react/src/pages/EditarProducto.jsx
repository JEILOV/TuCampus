// src/pages/EditarProducto.jsx
import { useState, useEffect, useRef, lazy, Suspense }  from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc }                  from "firebase/firestore";
import { ChevronLeft, Camera, Send, X, Plus, Crop } from "lucide-react";
import { db }                           from "../services/firebase";
import { useAuth }                      from "../context/AuthContext";
import { comprimirImagen, subirBlobsComprimidos } from "../utils/imageUtils";
import { actualizarProducto, normalizarCategoria, normalizarCondicion } from "../services/productService";
import { limpiarCacheSecciones }        from "../services/seccionesService";
import { useObjectUrls }                from "../hooks/useObjectUrls";
import Spinner                          from "../components/Spinner";
import Toast, { useToast }              from "../components/Toast";

// Carga diferida del recortador para no engordar el bundle inicial
const RecortadorFoto = lazy(() => import("../components/RecortadorFoto"));

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
  // dispositivo: `url` es un object URL de preview del blob YA
  // comprimido, y `blob` es ese mismo Blob comprimido, listo para
  // subir — ver handleFileChange para el motivo de comprimir acá y no
  // en el submit).
  const [fotos,          setFotos]          = useState([]);
  const [btnTexto,       setBtnTexto]       = useState("Guardar Cambios");
  const [enviando,       setEnviando]       = useState(false);
  const [cargando,       setCargando]       = useState(true);
  // 🔧 true mientras se comprimen las fotos recién elegidas, ver
  // Publicar.jsx (mismo patrón).
  const [procesandoImagenes, setProcesandoImagenes] = useState(false);
  
  // ✅ Nuevo manejo de Toasts centralizado
  const [toast, setToast] = useState(null);
  const mostrarToast = useToast(setToast, { single: true });

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  // ✂️ Estado para el modal de recortar/rotar foto
  const [fotoParaRecortar, setFotoParaRecortar] = useState(null);
  const enviandoRef = useRef(false); // 🔧 guard contra doble-submit, ver Publicar.jsx
  const { crearUrl, revocarUrl } = useObjectUrls();

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

  const MAX_IMAGEN_MB = 5;
  const MAX_FOTO_CAMARA_MB = 25;

  const handleFileChange = async (e) => {
    const filesSeleccionados = Array.from(e.target.files || []);
    e.target.value = "";

    if (filesSeleccionados.length === 0) return;

    const espacioDisponible = MAX_FOTOS - fotos.length;
    if (espacioDisponible <= 0) {
      mostrarToast(`Ya tienes el máximo de ${MAX_FOTOS} fotos.`, "error");
      return;
    }

    const candidatos = [];
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
      candidatos.push(file);
    }

    if (candidatos.length === 0) return;

    // 🔧 CRÍTICO (bug de Android) — mismo motivo exacto que
    // Publicar.jsx: el `File` que entrega el selector puede quedar con
    // su descriptor de lectura revocado por el sistema apenas se
    // cierra el picker. Si se guarda el `File` crudo en el estado y
    // recién se lee/comprime al hacer clic en "Guardar Cambios"
    // —minutos después— la lectura falla con:
    //   NotReadableError: The requested file could not be read...
    // Por eso se comprime ACÁ, en el mismo gesto de selección, y se
    // guarda en el estado el `Blob` ya comprimido (vive en memoria,
    // no depende de ningún descriptor de archivo del SO). El submit
    // solo sube esos Blobs con subirBlobsComprimidos(), sin volver a
    // tocar el `File` original.
    setProcesandoImagenes(true);
    const nuevas = [];
    try {
      for (const file of candidatos) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const blob = await comprimirImagen(file);
          nuevas.push({
            id:   `new-${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
            kind: "new",
            blob,
            url:  crearUrl(blob), // preview del BLOB comprimido, no del file original
          });
        } catch (err) {
          console.error("[EditarProducto] Error al procesar imagen:", err);
          mostrarToast(`No se pudo procesar "${file.name}". Probá con otra foto.`, "error");
        }
      }
    } finally {
      setProcesandoImagenes(false);
    }

    if (nuevas.length > 0) setFotos((prev) => [...prev, ...nuevas]);
    if (descartadosPorLimite) {
      mostrarToast(`Solo se agregaron ${espacioDisponible} foto(s): el máximo es ${MAX_FOTOS}.`, "error");
    }
  };

  const quitarFoto = (id) => {
    setFotos((prev) => {
      const objetivo = prev.find((f) => f.id === id);
      if (objetivo?.kind === "new") revocarUrl(objetivo.url);
      return prev.filter((f) => f.id !== id);
    });
  };

  // 📷 Maneja la captura directa desde la cámara móvil
  const handleCameraChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) {
      // El usuario canceló la captura de la cámara: sin ranuras vacías ni errores
      return;
    }

    if (fotos.length >= MAX_FOTOS) {
      mostrarToast(`Ya tienes el máximo de ${MAX_FOTOS} fotos.`, "error");
      return;
    }

    if (!file.type.startsWith("image/")) {
      mostrarToast("El archivo capturado debe ser una imagen.", "error");
      return;
    }

    if (file.size > MAX_FOTO_CAMARA_MB * 1024 * 1024) {
      mostrarToast(`La foto supera ${MAX_FOTO_CAMARA_MB}MB. Elige una más liviana.`, "error");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const fileEnMemoria = new File([buffer], file.name || "foto.jpg", { type: file.type });
      setFotoParaRecortar({
        origen: fileEnMemoria,
        tipo: "camara",
      });
    } catch (err) {
      console.error("[EditarProducto] Error al leer foto de cámara en memoria:", err);
      mostrarToast("No se pudo leer la foto. Inténtalo de nuevo.", "error");
    }
  };

  // ✂️ Abre el modal de recorte para una foto existente o ya agregada
  const abrirRecortadorExistente = (foto) => {
    setFotoParaRecortar({
      origen: foto.blob || foto.url,
      tipo: "editar",
      id: foto.id,
    });
  };

  // ✂️ Recorte confirmado por el usuario en RecortadorFoto
  const handleRecorteListo = async (fileRecortado) => {
    if (!fotoParaRecortar) return;
    setProcesandoImagenes(true);
    try {
      const blobComprimido = await comprimirImagen(fileRecortado);

      if (fotoParaRecortar.tipo === "camara") {
        setFotos((prev) => [
          ...prev,
          {
            id: `new-${fileRecortado.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            kind: "new",
            blob: blobComprimido,
            url: crearUrl(blobComprimido),
          },
        ]);
      } else if (fotoParaRecortar.tipo === "editar") {
        const id = fotoParaRecortar.id;
        setFotos((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              if (item.kind === "new") {
                revocarUrl(item.url);
              }
              return {
                id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                kind: "new",
                blob: blobComprimido,
                url: crearUrl(blobComprimido),
              };
            }
            return item;
          })
        );
      }
    } catch (err) {
      console.error("[EditarProducto] Error al procesar imagen recortada:", err);
      mostrarToast("No se pudo procesar la foto recortada.", "error");
    } finally {
      setProcesandoImagenes(false);
      setFotoParaRecortar(null);
    }
  };

  // ✂️ Omitir recorte y usar foto original
  const handleUsarSinRecortar = async (imagenOriginal) => {
    if (!fotoParaRecortar) return;
    if (fotoParaRecortar.tipo === "camara") {
      setProcesandoImagenes(true);
      try {
        const blobComprimido = await comprimirImagen(imagenOriginal);
        setFotos((prev) => [
          ...prev,
          {
            id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            kind: "new",
            blob: blobComprimido,
            url: crearUrl(blobComprimido),
          },
        ]);
      } catch (err) {
        console.error("[EditarProducto] Error al procesar imagen original:", err);
        mostrarToast("No se pudo procesar la foto.", "error");
      } finally {
        setProcesandoImagenes(false);
        setFotoParaRecortar(null);
      }
    } else {
      setFotoParaRecortar(null);
    }
  };

  const handleCancelarRecorte = () => {
    setFotoParaRecortar(null);
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
        // 🔧 Los Blobs de `fotosNuevas` ya están comprimidos desde la
        // selección (ver handleFileChange) — acá solo se suben, sin
        // volver a tocar `File`s ni descriptores del SO ya caducados.
        urlsNuevas = await subirBlobsComprimidos(fotosNuevas.map((f) => f.blob));
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

      limpiarCacheSecciones();
      navigate("/perfil", { state: { toastEditar: true } });
    } catch (err) {
      console.error("[EditarProducto] Error:", err);
      // 🔧 Mismo criterio que Publicar.jsx: err.code viene de
      // subirImagenImgBB() (imageUtils.js) cuando el fallo es de la
      // subida de imagen — permite distinguir un 413/504/timeout de
      // mobile de un error genérico de Firestore.
      const MENSAJES_ERROR = {
        PAYLOAD_TOO_LARGE: "La foto es demasiado pesada para subir. Probá con otra foto o mejorá tu conexión.",
        UPLOAD_TIMEOUT:     "La subida tardó demasiado — tu conexión puede estar lenta. Intenta de nuevo.",
        NETWORK_ERROR:      "Se perdió la conexión al subir la imagen. Verifica tu señal e intenta de nuevo.",
        IMGBB_TIMEOUT:      "El servidor de imágenes tardó demasiado en responder. Intenta de nuevo.",
        IMGBB_REJECTED:     "El servidor de imágenes rechazó la foto. Probá con otra.",
      };
      // 🔧 Fallback: err.message en vez de un string genérico — ver
      // el mismo comentario en Publicar.jsx.
      mostrarToast(MENSAJES_ERROR[err?.code] || err?.message || "Error al guardar. Intenta de nuevo.", "error");
      setBtnTexto("Guardar Cambios");
      setEnviando(false);
      enviandoRef.current = false;
    }
  };

  // ✅ Pantalla de carga limpia utilizando el nuevo Spinner
  if (cargando) return <Spinner mensaje="Cargando producto..." />;

  return (
    <div className="w-full bg-background md:min-h-screen">
      <div className="app-shell font-sans pb-8 md:max-w-[760px] md:overflow-visible md:bg-transparent md:px-5 md:pb-12 md:shadow-none lg:max-w-[920px] lg:px-6">

        {/* ════════════════════════════════════════════════════
               HEADER MÓVIL (< 768px)
          ════════════════════════════════════════════════════ */}
        <div className="md:hidden">
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
        </div>

        {/* ════════════════════════════════════════════════════
               HEADER TABLET/ESCRITORIO (md+)
          ════════════════════════════════════════════════════ */}
        <div className="hidden items-center justify-between py-5 md:flex">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-btn bg-card px-4 py-2 text-[13px] font-bold text-ink shadow-soft transition-colors hover:bg-background"
          >
            <ChevronLeft size={18} strokeWidth={2.4} />
            <span>Volver</span>
          </button>
          <h1 className="text-xl font-extrabold text-ink">Edita tu producto</h1>
          <div className="w-20" aria-hidden="true" />
        </div>

        {/* ════════════════════════════════════════════════════
               TARJETA — Formulario (1 col móvil/tablet, 2 col en lg)
          ════════════════════════════════════════════════════ */}
        <main className="relative -mt-6 px-4 md:mt-0 md:px-0">
          <form onSubmit={handleSubmit} className="rounded-t-[32px] bg-card p-5 pb-6 shadow-soft md:rounded-card md:p-7">

            <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">

              {/* COLUMNA IZQUIERDA EN LG: Fotos */}
              <div className="lg:col-span-1">
                {/* FOTOS (hasta 4) */}
                <div className="mb-5">
                  <div className="flex items-baseline justify-between">
                    <label className={labelClass}>Fotos del producto</label>
                    <span className="text-[11px] font-semibold text-ink/40">
                      {procesandoImagenes ? "Procesando..." : `${fotos.length}/${MAX_FOTOS}`}
                    </span>
                  </div>

                  {fotos.length === 0 ? (
                    <div className="mt-2 rounded-2xl border-2 border-dashed border-ink/15 bg-background p-5 text-center">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Camera size={24} />
                      </span>
                      <p className="mt-2 text-[14.5px] font-extrabold text-ink">
                        {procesandoImagenes ? "Procesando foto..." : "Agrega fotos de tu producto"}
                      </p>
                      <p className="mt-1 text-[12px] font-semibold text-ink/40">
                        Hasta {MAX_FOTOS} fotos · JPG, PNG · Máx. 5MB c/u
                      </p>
                      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          disabled={procesandoImagenes}
                          className="inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2 text-[13px] font-bold text-background shadow-soft transition-colors hover:bg-primary-dark disabled:opacity-50 md:hidden"
                        >
                          <Camera size={16} />
                          <span>Tomar foto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={procesandoImagenes}
                          className="inline-flex items-center gap-2 rounded-btn border border-ink/15 bg-card px-4 py-2 text-[13px] font-bold text-ink shadow-soft transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                        >
                          <Plus size={16} />
                          <span>Elegir de galería</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {fotos.map((f, idx) => (
                          <div key={f.id} className="relative aspect-square overflow-hidden rounded-2xl bg-background group">
                            <img src={f.url} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                            {idx === 0 && (
                              <span className="absolute bottom-1 left-1 rounded-chip bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                Portada
                              </span>
                            )}
                            {/* Botón editar / recortar */}
                            <button
                              type="button"
                              onClick={() => abrirRecortadorExistente(f)}
                              aria-label={`Recortar foto ${idx + 1}`}
                              className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-transform active:scale-90 hover:bg-black/80"
                            >
                              <Crop size={12} strokeWidth={2.5} />
                            </button>
                            {/* Botón quitar */}
                            <button
                              type="button"
                              onClick={() => quitarFoto(f.id)}
                              aria-label={`Quitar foto ${idx + 1}`}
                              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-transform active:scale-90 hover:bg-black/80"
                            >
                              <X size={12} strokeWidth={3} />
                            </button>
                          </div>
                        ))}

                        {fotos.length < MAX_FOTOS && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={procesandoImagenes}
                            aria-label="Agregar foto de galería"
                            className="flex aspect-square items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 bg-background text-ink/30 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60"
                          >
                            <Plus size={22} />
                          </button>
                        )}
                      </div>

                      {/* Botones inferiores para agregar más fotos */}
                      {fotos.length < MAX_FOTOS && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={procesandoImagenes}
                            className="inline-flex items-center gap-1.5 rounded-btn border border-primary/20 bg-primary/10 px-3 py-1.5 text-[12px] font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50 md:hidden"
                          >
                            <Camera size={14} />
                            <span>Tomar foto</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={procesandoImagenes}
                            className="inline-flex items-center gap-1.5 rounded-btn border border-ink/15 bg-background px-3 py-1.5 text-[12px] font-bold text-ink transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                          >
                            <Plus size={14} />
                            <span>Elegir de galería</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Input de cámara móvil con capture="environment" */}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    onChange={handleCameraChange}
                    disabled={procesandoImagenes}
                    className="hidden"
                  />
                  {/* Input de galería con selección múltiple */}
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
              </div>

              {/* COLUMNA DERECHA EN LG: Campos del formulario */}
              <div className="lg:col-span-1">
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
              </div>

            </div>

            {/* CTA A ANCHO COMPLETO AL FINAL */}
            <button
              type="submit"
              disabled={enviando || procesandoImagenes}
              className="flex w-full items-center justify-center gap-2 rounded-btn bg-primary py-4 text-[15px] font-extrabold text-white shadow-soft transition-all duration-200 ease-out hover:brightness-105 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 lg:mt-2"
            >
              <Send size={18} />
              {enviando ? btnTexto : "Guardar Cambios"}
            </button>
          </form>
        </main>

      {/* ✂️ Modal de recorte y rotación de fotos */}
      {fotoParaRecortar && (
        <Suspense fallback={null}>
          <RecortadorFoto
            imagen={fotoParaRecortar.origen}
            onListo={handleRecorteListo}
            onUsarOriginal={handleUsarSinRecortar}
            onCancelar={handleCancelarRecorte}
          />
        </Suspense>
      )}

      {/* ✅ TOAST LIMPIO */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[1000] w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2">
          <Toast mensaje={toast.mensaje} tipo={toast.tipo} />
        </div>
      )}
      </div>
    </div>
  );
};

export default EditarProducto;