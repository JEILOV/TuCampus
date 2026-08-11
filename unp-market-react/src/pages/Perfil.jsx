// src/pages/Perfil.jsx
import { useState, useEffect, useRef }              from "react";
import { useNavigate, useLocation }                 from "react-router-dom";
import {
  doc, setDoc, getDocs,
  collection, query, where,
  updateDoc, deleteDoc,
} from "firebase/firestore";
import { Link }                        from "react-router-dom";
import {
  ChevronLeft, Settings, Pencil, MapPin, CheckCircle2,
  MessageCircle, LayoutGrid, ImagePlus, LogOut,
} from "lucide-react";
import { db }                          from "../services/firebase";
import { useAuth }                     from "../context/AuthContext";
import { comprimirImagen, subirImagenImgBB } from "../utils/imageUtils";
import { obtenerContactoPrivado, guardarContactoPrivado } from "../services/userService";
import Spinner                         from "../components/Spinner";
import { useToast, ToastContainer }    from "../components/Toast";
import BottomNav                       from "../components/BottomNav";

// Placeholders — reemplazar por los archivos finales de cada logo.
const YAPE_PLACEHOLDER = "/assets/yape-placeholder.png";
const PLIN_PLACEHOLDER = "/assets/plin-placeholder.png";

// ──────────────────────────────────────────────────────────────
//  SUB-COMPONENTE: Tarjeta de producto en modo perfil
//  (mismo lenguaje visual que ProductCard.jsx, con acciones extra
//  de dueño — editar/agotar/borrar — que ProductCard no maneja)
// ──────────────────────────────────────────────────────────────
const TarjetaPerfil = ({ producto, onAgotar, onBorrar, onEditar }) => {
  const { titulo, precio, imagen, vendedorNombre, vendedor, avatarVendedor, estado } = producto;
  const agotado    = (estado || "").toLowerCase() === "agotado";
  const nombreVend = vendedorNombre || vendedor || "Yo";

  return (
    <article className="flex h-fit w-full flex-col self-start overflow-hidden rounded-card bg-card shadow-soft">
      {/* Imagen */}
      <div className="relative aspect-square w-full bg-background">
        {imagen?.trim() ? (
          <img
            src={imagen}
            alt={titulo}
            className={`h-full w-full object-cover${agotado ? " grayscale opacity-70" : ""}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">📦</div>
        )}
        <span className="absolute right-2.5 top-2.5 rounded-chip bg-ink px-2.5 py-1 text-xs font-bold text-white shadow-soft">
          S/ {(precio || 0).toFixed(2)}
        </span>
        {agotado && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/35 backdrop-blur-[2px]">
            <span className="-rotate-3 rounded-chip bg-ink px-3.5 py-1.5 text-[13px] font-extrabold text-white shadow-soft">
              AGOTADO
            </span>
          </div>
        )}
      </div>

      {/* Cuerpo */}
      <div className="flex flex-col gap-2 p-3">
        <p className="truncate text-[13.5px] font-bold leading-tight text-ink">
          {titulo || "Sin título"}
        </p>

        {/* Vendedor */}
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {avatarVendedor?.trim()
              ? <img src={avatarVendedor} alt="" className="h-full w-full object-cover" />
              : (nombreVend || "?")[0].toUpperCase()
            }
          </div>
          <span className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-ink/60">
            {nombreVend}
          </span>
        </div>

        {/* Botones de acción */}
        <div className="mt-1 flex gap-1.5">
          <button onClick={onEditar} className="flex-1 rounded-[10px] bg-background py-1.5 text-[11px] font-bold text-ink/70">
            Editar
          </button>
          <button onClick={onAgotar} className="flex-1 rounded-[10px] bg-background py-1.5 text-[11px] font-bold text-ink/70">
            {agotado ? "Disponible" : "Agotar"}
          </button>
          <button onClick={onBorrar} className="flex-1 rounded-[10px] bg-red-50 py-1.5 text-[11px] font-bold text-red-500">
            Borrar
          </button>
        </div>
      </div>
    </article>
  );
};

// ──────────────────────────────────────────────────────────────
//  ESTILOS compartidos del formulario (clases Tailwind reutilizables)
// ──────────────────────────────────────────────────────────────
const inputClass = "w-full box-border rounded-btn border-[1.5px] border-ink/10 bg-background px-3.5 py-3 text-[15px] font-bold text-ink outline-none focus:border-primary/40";
const labelClass = "text-[13.5px] font-bold text-ink";

// ──────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────
const Perfil = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { user, perfil, cerrarSesion, actualizarPerfil } = useAuth();

  // ── Datos locales de esta página ──
  const [productos,      setProductos]      = useState([]);
  const [cargando,       setCargando]       = useState(true);

  // ── UI ──
  const [dropdownOpen,    setDropdownOpen]    = useState(false);
  const [modalOpen,       setModalOpen]       = useState(false);
  const [guardando,       setGuardando]       = useState(false);
  const [toasts,          setToasts]          = useState([]);
  const [productoABorrar, setProductoABorrar] = useState(null);

  // ── Modal: campos controlados ──
  const [mNombre,    setMNombre]    = useState("");
  const [mBio,       setMBio]       = useState("");
  const [mAcerca,    setMAcerca]    = useState("");
  const [mUbicacion, setMUbicacion] = useState("");
  const [mTelefono,  setMTelefono]  = useState("");
  const [mAceptaYape, setMAceptaYape] = useState(false);
  const [mAceptaPlin, setMAceptaPlin] = useState(false);
  const [mAvatarFile,  setMAvatarFile]  = useState(null);
  const [mPortadaFile, setMPortadaFile] = useState(null);
  const [mAvatarPrev,  setMAvatarPrev]  = useState(null);
  const [mPortadaPrev, setMPortadaPrev] = useState(null);

  const avatarInputRef  = useRef(null);
  const portadaInputRef = useRef(null);
  const dropdownRef     = useRef(null);

  // ✅ Toast helper unificado (modo array)
  const mostrarToast = useToast(setToasts);

  useEffect(() => {
    if (!user) return;

    const cargarProductos = async () => {
      try {
        const q    = query(collection(db, "productos"), where("userUid", "==", user.uid));
        const snap = await getDocs(q);
        setProductos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("[Perfil] Error al cargar productos:", err);
      } finally {
        setCargando(false);
      }
    };

    cargarProductos();
  }, [user]);

  useEffect(() => {
    if (!cargando && location.state?.abrirModalEdicion) {
      abrirModal();
      window.history.replaceState({}, document.title);
    }
  }, [location, cargando]);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSignOut = async () => {
    try {
      await cerrarSesion();
      navigate("/login", { replace: true });
    } catch (err) {
      mostrarToast("Error al cerrar sesión", "error");
    }
  };

  const abrirModal = async () => {
    const p = perfil || {};
    setMNombre(p.nombre       || "");
    setMBio(p.bio             || "");
    setMAcerca(p.acercaDe     || "");
    setMUbicacion(p.ubicacion || "");
    setMAvatarFile(null);
    setMPortadaFile(null);
    setMAvatarPrev(p.avatar  || null);
    setMPortadaPrev(p.portada || null);
    setMAceptaYape(!!p.aceptaYape);
    setMAceptaPlin(!!p.aceptaPlin);
    setDropdownOpen(false);
    setModalOpen(true);

    // 🔒 El número real vive solo en /usuarios/{uid}/privado/contacto.
    // Se carga aparte (y de forma asíncrona) para no bloquear la
    // apertura del modal ni exponerlo nunca en el doc público.
    setMTelefono("");
    try {
      const contacto = await obtenerContactoPrivado(user.uid);
      setMTelefono(contacto?.telefono || "");
    } catch (err) {
      console.error("[Perfil] Error al cargar contacto privado:", err);
    }
  };

  const handleFileSelect = (tipo, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (tipo === "avatar")  { setMAvatarFile(file);  setMAvatarPrev(url); }
    if (tipo === "portada") { setMPortadaFile(file); setMPortadaPrev(url); }
  };

  const ejecutarGuardadoReal = async () => {
    const perfilPrev = perfil || {};

    let avatarFinal  = perfilPrev.avatar  || "";
    let portadaFinal = perfilPrev.portada || "";

    if (mAvatarFile) {
      const blob = await comprimirImagen(mAvatarFile);
      avatarFinal = await subirImagenImgBB(blob);
    }
    if (mPortadaFile) {
      const blob = await comprimirImagen(mPortadaFile);
      portadaFinal = await subirImagenImgBB(blob);
    }

    const telefonoFinal = mTelefono.trim();

    // 🔒 El número NUNCA se escribe en el doc público /usuarios/{uid}.
    // Se guarda aparte en la subcolección privada de contacto, junto
    // con los métodos de pago (por ahora, mismo número para Yape/Plin).
    await guardarContactoPrivado(user.uid, {
      telefono: telefonoFinal,
      metodosPago: {
        yape: { activo: mAceptaYape, numero: mAceptaYape ? telefonoFinal : "" },
        plin: { activo: mAceptaPlin, numero: mAceptaPlin ? telefonoFinal : "" },
      },
    });

    const nuevoPerfil = {
      ...perfilPrev,
      uid:        user.uid,
      nombre:     mNombre    || perfilPrev.nombre    || "",
      bio:        mBio       || perfilPrev.bio       || "",
      acercaDe:   mAcerca    || perfilPrev.acercaDe  || "",
      ubicacion:  mUbicacion || perfilPrev.ubicacion || "",
      avatar:     avatarFinal,
      portada:    portadaFinal,
      aceptaYape: mAceptaYape,
      aceptaPlin: mAceptaPlin,
    };
    delete nuevoPerfil.telefono; // por si un perfil viejo aún lo traía

    await setDoc(doc(db, "usuarios", user.uid), nuevoPerfil, { merge: true });
    actualizarPerfil(nuevoPerfil);

    setModalOpen(false);
    mostrarToast("¡Perfil guardado correctamente!");

    try {
      const q    = query(collection(db, "productos"), where("userUid", "==", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        // 🔒 Solo se sincronizan datos públicos (nombre, avatar, insignias
        // de método de pago). El teléfono nunca se copia a "productos".
        await Promise.all(snap.docs.map((d) =>
          updateDoc(doc(db, "productos", d.id), {
            avatarVendedor: avatarFinal,
            vendedorNombre: nuevoPerfil.nombre || "",
            vendedor:       nuevoPerfil.nombre || "",
            aceptaYape:     mAceptaYape,
            aceptaPlin:     mAceptaPlin,
          })
        ));
        setProductos((prev) => prev.map((p) => ({
          ...p,
          avatarVendedor: avatarFinal,
          vendedorNombre: nuevoPerfil.nombre || "",
          vendedor:       nuevoPerfil.nombre || "",
          aceptaYape:     mAceptaYape,
          aceptaPlin:     mAceptaPlin,
        })));
        mostrarToast(`✓ Perfil actualizado en ${snap.size} publicación${snap.size !== 1 ? "es" : ""}`);
      }
    } catch (syncErr) {
      console.warn("[Perfil] Error al sincronizar productos:", syncErr);
    }
  };

  const handleGuardar = async () => {
    if (!user) return;
    setGuardando(true);
    try {
      await ejecutarGuardadoReal();
    } catch (err) {
      console.error(err);
      mostrarToast("Error al guardar el perfil", "error");
    } finally {
      setGuardando(false);
    }
  };

  const handleAgotar = async (prod) => {
    const nuevoEstado = (prod.estado || "").toLowerCase() === "agotado" ? "disponible" : "agotado";
    try {
      await updateDoc(doc(db, "productos", prod.id), { estado: nuevoEstado });
      setProductos((prev) =>
        prev.map((p) => p.id === prod.id ? { ...p, estado: nuevoEstado } : p)
      );
      mostrarToast(nuevoEstado === "agotado" ? "Producto marcado como agotado" : "Producto disponible de nuevo");
    } catch (err) {
      console.error(err);
      mostrarToast("Error al actualizar el estado", "error");
    }
  };

  const handleBorrar = (prod) => setProductoABorrar(prod);

  const confirmarBorrado = async () => {
    if (!productoABorrar) return;
    try {
      await deleteDoc(doc(db, "productos", productoABorrar.id));
      setProductos((prev) => prev.filter((p) => p.id !== productoABorrar.id));
      mostrarToast("Producto eliminado");
    } catch (err) {
      console.error(err);
      mostrarToast("Error al eliminar", "error");
    } finally {
      setProductoABorrar(null);
    }
  };

  const handleEditar = (prod) => navigate(`/editar?id=${prod.id}`);

  // ✅ Pantalla de carga limpia utilizando el nuevo Spinner
  if (cargando) return <Spinner mensaje="Cargando perfil..." />;

  const p = perfil || {};

  return (
    <div className="app-shell font-sans pb-24">

      {/* ════════════════════════════════════════════════════
             CABECERA — Banner + Avatar + Nombre
        ════════════════════════════════════════════════════ */}
      <div
        className="relative flex min-h-[300px] w-full flex-col items-center justify-center overflow-hidden rounded-b-[32px] bg-gradient-to-b from-primary to-primary-dark px-6 pb-10 pt-14"
        style={p.portada?.trim() ? { backgroundImage: `url('${p.portada}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {/* Botón volver */}
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Botón ⚙️ + Dropdown */}
        <div ref={dropdownRef} className="absolute right-4 top-4 z-10">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            aria-label="Configuración"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          >
            <Settings size={18} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-[46px] z-[200] min-w-[190px] overflow-hidden rounded-btn border border-ink/5 bg-card shadow-softLg">
              <button
                onClick={abrirModal}
                className="flex w-full items-center gap-2.5 border-b border-background px-4 py-3.5 text-left text-[14px] font-bold text-ink"
              >
                <Pencil size={16} />
                Editar perfil
              </button>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-[14px] font-bold text-red-500"
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>

        {/* Contenedor Central: Avatar + Textos */}
        <div className="relative z-[5] flex flex-col items-center gap-2.5">

          {/* Avatar circular con botón de edición */}
          <div className="relative mb-1">
            <div className="flex h-[100px] w-[100px] items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-primary-dark text-4xl font-bold text-white shadow-softLg">
              {p.avatar?.trim() ? <img src={p.avatar} alt={p.nombre} className="h-full w-full object-cover" /> : (p.nombre || "U")[0].toUpperCase()}
            </div>

            {/* Lápiz naranja */}
            <button
              onClick={abrirModal}
              aria-label="Editar foto"
              className="absolute bottom-1 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-orange-500 text-white shadow-soft"
            >
              <Pencil size={13} />
            </button>
          </div>

          <h1 className="text-center text-2xl font-extrabold text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.4)]">
            {p.nombre || "Estudiante UNP"}
          </h1>
          <p className="text-[13px] font-bold text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.3)]">
            {p.bio || "Estudiante de la UNP"}
          </p>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-chip border border-white/40 bg-white/20 px-4 py-1.5 text-[12px] font-bold text-white backdrop-blur">
            <CheckCircle2 size={14} />
            Estudiante verificado
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
             INFO: UBICACIÓN + MÉTODOS DE PAGO
        ════════════════════════════════════════════════════ */}
      <div className="relative z-10 -mt-5 flex gap-3 px-4">
        <div className="flex flex-1 items-center justify-center gap-2 rounded-card bg-card px-4 py-3.5 shadow-soft">
          <MapPin size={18} className="shrink-0 text-primary" />
          <span className="truncate text-[13px] font-extrabold text-ink">
            {p.ubicacion || "Piura"}
          </span>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-center gap-2.5 rounded-card bg-card px-4 py-3.5 shadow-soft">
          {/* 🔒 Nunca se imprime el número: solo los logos de qué métodos
              de contacto/pago acepta este usuario. */}
          {p.aceptaYape && <img src={YAPE_PLACEHOLDER} alt="Yape" className="h-7 w-7 rounded-full object-cover" />}
          {p.aceptaPlin && <img src={PLIN_PLACEHOLDER} alt="Plin" className="h-7 w-7 rounded-full object-cover" />}
          {!p.aceptaYape && !p.aceptaPlin && (
            <span className="text-[12.5px] font-extrabold text-ink/50">Sin métodos configurados</span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
             ACERCA DE MÍ
        ════════════════════════════════════════════════════ */}
      <div className="px-4 pb-2 pt-4">
        <div className="rounded-card bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageCircle size={16} className="text-primary" />
            <span className="text-sm font-bold text-ink">Acerca de mí</span>
          </div>
          <p className="break-words text-[13px] font-semibold leading-relaxed text-ink/70">
            {p.acercaDe || "¡Hola! Bienvenido a mi tienda en el campus."}
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
             MIS PUBLICACIONES ACTIVAS
        ════════════════════════════════════════════════════ */}
      <div className="px-4 pb-5 pt-4">
        <div className="mb-3 flex items-center justify-between border-b-2 border-[#287653]/25 pb-2.5">
          <div className="flex items-center gap-2">
            <LayoutGrid size={16} className="text-[#287653]" />
            <span className="text-[15px] font-extrabold text-[#287653]">
              Mis Publicaciones Activas
            </span>
          </div>
          {productos.length > 0 && (
            <button className="text-[12.5px] font-bold text-primary">Ver todas →</button>
          )}
        </div>

        {productos.length === 0 ? (
          <p className="py-5 text-center text-[13px] font-bold text-ink/50">
            Aún no tienes publicaciones.
          </p>
        ) : (
          <div className="grid grid-cols-2 items-start gap-3">
            {productos.map((prod) => (
              <TarjetaPerfil
                key={prod.id}
                producto={prod}
                onAgotar={() => handleAgotar(prod)}
                onBorrar={() => handleBorrar(prod)}
                onEditar={() => handleEditar(prod)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════
             TÉRMINOS Y PRIVACIDAD
        ════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 pt-1 text-center">
        <Link to="/terminos" className="text-[12px] font-bold text-ink/40 underline">
          Términos y Privacidad
        </Link>
      </div>

      {/* ════════════════════════════════════════════════════
             BOTTOM NAVIGATION
        ════════════════════════════════════════════════════ */}
      <BottomNav activo="perfil" />

      {/* ════════════════════════════════════════════════════
             MODAL: EDITAR PERFIL
        ════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
          className="fixed inset-0 z-[500] flex items-end bg-ink/50 backdrop-blur-sm"
        >
          <div className="mx-auto box-border max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-card px-5 pb-8 pt-6">
            <h2 className="mb-5 text-[19px] font-extrabold text-ink">
              Editar Mi Perfil
            </h2>

            <div className="flex flex-col gap-3.5">
              <div>
                <label className={labelClass}>Nombre Completo</label>
                <input
                  value={mNombre}
                  onChange={(e) => setMNombre(e.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              <div>
                <label className={labelClass}>Carrera / Título corto</label>
                <input
                  value={mBio}
                  onChange={(e) => setMBio(e.target.value)}
                  placeholder="Ej: Ing. Informático"
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              <div>
                <label className={labelClass}>Acerca de mí</label>
                <textarea
                  value={mAcerca}
                  onChange={(e) => setMAcerca(e.target.value)}
                  rows={3}
                  className={`${inputClass} mt-1.5 resize-none`}
                />
              </div>
              <div>
                <label className={labelClass}>Ubicación actual</label>
                <input
                  value={mUbicacion}
                  onChange={(e) => setMUbicacion(e.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              <div>
                <label className={labelClass}>WhatsApp (sin +51)</label>
                <input
                  value={mTelefono}
                  onChange={(e) => {
                    const soloNumeros = e.target.value.replace(/\D/g, "");
                    if (soloNumeros.length <= 9) setMTelefono(soloNumeros);
                  }}
                  placeholder="Ej: 987654321"
                  type="tel"
                  maxLength={9}
                  className={`${inputClass} mt-1.5`}
                />
                <p className="mt-1.5 text-[11.5px] font-semibold text-ink/40">
                  🔒 Se guarda de forma privada. Nunca se muestra en tu perfil público, solo
                  alimenta el botón de WhatsApp.
                </p>
              </div>

              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-bold text-ink">
                  <input type="checkbox" checked={mAceptaYape} onChange={(e) => setMAceptaYape(e.target.checked)} />
                  Acepto Yape
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-bold text-ink">
                  <input type="checkbox" checked={mAceptaPlin} onChange={(e) => setMAceptaPlin(e.target.checked)} />
                  Acepto Plin
                </label>
              </div>

              {/* Foto de perfil */}
              <div>
                <label className={labelClass}>Foto de Perfil</label>
                <input type="file" accept="image/*" ref={avatarInputRef} className="hidden"
                  onChange={(e) => handleFileSelect("avatar", e.target.files[0])} />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="mt-1.5 box-border flex w-full items-center justify-center gap-2.5 rounded-btn border-[1.5px] border-dashed border-ink/10 bg-background px-3.5 py-3.5"
                >
                  {mAvatarPrev
                    ? <img src={mAvatarPrev} alt="Avatar" className="h-10 w-10 rounded-full object-cover" />
                    : <ImagePlus size={20} className="text-ink/30" />
                  }
                  <span className="text-[14px] font-bold text-ink/70">
                    {mAvatarPrev ? "Cambiar foto de perfil" : "Subir foto de perfil"}
                  </span>
                </button>
              </div>

              {/* Imagen de portada */}
              <div>
                <label className={labelClass}>Imagen de Portada (Banner)</label>
                <input type="file" accept="image/*" ref={portadaInputRef} className="hidden"
                  onChange={(e) => handleFileSelect("portada", e.target.files[0])} />
                {mPortadaPrev && (
                  <img src={mPortadaPrev} alt="Banner" className="mb-1.5 mt-1.5 h-20 w-full rounded-btn object-cover" />
                )}
                <button
                  onClick={() => portadaInputRef.current?.click()}
                  className="box-border flex w-full items-center justify-center gap-2.5 rounded-btn border-[1.5px] border-dashed border-ink/10 bg-background px-3.5 py-3.5"
                >
                  <ImagePlus size={20} className="text-ink/30" />
                  <span className="text-[14px] font-bold text-ink/70">
                    {mPortadaPrev ? "Cambiar imagen de portada" : "Subir imagen de portada"}
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-btn bg-background py-3.5 text-[15px] font-bold text-ink/60"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className={`flex-[1.5] rounded-btn py-3.5 text-[15px] font-bold text-white shadow-soft ${
                  guardando ? "cursor-not-allowed bg-[#6b9e74]" : "bg-[#287653]"
                }`}
              >
                {guardando ? "Guardando..." : "Guardar Perfil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
             MODAL: CONFIRMAR BORRADO
        ════════════════════════════════════════════════════ */}
      {productoABorrar && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setProductoABorrar(null); }}
          className="fixed inset-0 z-[600] flex items-center justify-center bg-ink/50 p-5 backdrop-blur-sm"
        >
          <div className="w-full max-w-[340px] rounded-card bg-card p-6 text-center shadow-softLg">
            <h2 className="mb-2.5 text-[17px] font-extrabold text-ink">
              ¿Eliminar producto?
            </h2>
            <p className="mb-5 text-[14px] font-semibold leading-snug text-ink/60">
              {`Vas a eliminar "${productoABorrar.titulo}". Esta acción no se puede deshacer.`}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setProductoABorrar(null)}
                className="flex-1 rounded-btn bg-background py-3 text-[14px] font-bold text-ink/60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarBorrado}
                className="flex-1 rounded-btn bg-red-500 py-3 text-[14px] font-bold text-white shadow-soft"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />

    </div>
  );
};

export default Perfil;