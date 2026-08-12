// src/pages/PanelAdminAnuncios.jsx
// ============================================================
//  TuCampus — Panel de Gestión Rápida de Anuncios
//
//  Ruta privada (ver App.jsx: /admin/anuncios, envuelta en
//  RutaProtegida) que permite crear, activar/desactivar y
//  eliminar los flyers que se muestran en <CarruselAnuncios/>
//  en Home.jsx, leyendo/escribiendo directo en /anuncios.
//
//  🔒 GATING DE ACCESO — hoy no existe un sistema de roles en la
//  app (no hay campo "rol" en /usuarios), así que el acceso se
//  restringe por email exacto contra ADMIN_EMAILS. Esto es un
//  candado de UI, NO de seguridad: la protección real vive en
//  firestore.rules (la escritura en /anuncios debe exigir
//  request.auth.token.email in [...] igual que aquí — ver el
//  firestore.rules actualizado que te compartí aparte). Si más
//  adelante agregan un campo "rol: admin" en /usuarios, este
//  archivo y las reglas deberían migrar a usar ese campo en vez
//  de una lista de emails hardcodeada.
// ============================================================

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { ChevronLeft, Trash2, Eye, EyeOff, ImagePlus, Plus } from "lucide-react";
import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";
import { comprimirImagen, subirImagenImgBB } from "../utils/imageUtils";
import {
  crearAnuncio, actualizarAnuncio,
  alternarActivoAnuncio, eliminarAnuncio,
} from "../services/adService";
import Toast, { useToast } from "../components/Toast";

// 🔧 Editar esta lista con los correos @alumnos.unp.edu.pe (o el que
// uses para administrar) que deben tener acceso al panel.
const ADMIN_EMAILS = [
  "0512023070@alumnos.unp.edu.pe",
];

const inputClass =
  "w-full box-border rounded-btn border-[1.5px] border-ink/10 bg-background px-3.5 py-3 text-[15px] font-bold text-ink outline-none focus:border-primary/40";
const labelClass = "text-[13.5px] font-bold text-ink";

const ESTADO_VACIO = {
  id: null,
  titulo: "",
  subtitulo: "",
  colorFondo: "#1c398e",
  imagenUrl: "",
  enlaceUrl: "",
  orden: 0,
  activo: true,
};

const PanelAdminAnuncios = () => {
  const navigate = useNavigate();
  const { user, cargando: cargandoAuth } = useAuth();

  const [anuncios, setAnuncios]   = useState([]);
  const [form, setForm]           = useState(ESTADO_VACIO);
  const [archivo, setArchivo]     = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [toast, setToast] = useState(null);
  const mostrarToast = useToast(setToast, { single: true });

  const esAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (!esAdmin) return;
    // 🔧 Panel admin: acá SÍ interesa ver todos los anuncios
    // (activos e inactivos), no solo los activos que ve el
    // carrusel público. adService.suscribirAnuncios filtra por
    // activo==true, así que para el listado completo armamos
    // nuestra propia suscripción sin ese filtro.
    const q = query(collection(db, "anuncios"), orderBy("orden", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => setAnuncios(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error("[PanelAdminAnuncios] Error al listar anuncios:", err);
        mostrarToast("No se pudo cargar la lista de anuncios.", "error");
      },
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin]);

  const limpiarFormulario = () => {
    setForm(ESTADO_VACIO);
    setArchivo(null);
  };

  const cargarParaEditar = (a) => {
    setForm({
      id: a.id,
      titulo: a.titulo || "",
      subtitulo: a.subtitulo || "",
      colorFondo: a.colorFondo || "#1c398e",
      imagenUrl: a.imagenUrl || "",
      enlaceUrl: a.enlaceUrl || "",
      orden: a.orden ?? 0,
      activo: a.activo ?? true,
    });
    setArchivo(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleArchivo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      mostrarToast("El archivo debe ser una imagen (JPG o PNG).", "error");
      e.target.value = "";
      return;
    }
    setArchivo(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim()) {
      mostrarToast("El título es obligatorio.", "error");
      return;
    }

    setGuardando(true);
    try {
      let imagenUrl = form.imagenUrl;
      if (archivo) {
        const comprimido = await comprimirImagen(archivo);
        imagenUrl = await subirImagenImgBB(comprimido);
      }

      const payload = {
        titulo: form.titulo,
        subtitulo: form.subtitulo,
        colorFondo: form.colorFondo,
        imagenUrl,
        enlaceUrl: form.enlaceUrl,
        orden: Number(form.orden) || 0,
        activo: !!form.activo,
      };

      if (form.id) {
        await actualizarAnuncio(form.id, payload);
        mostrarToast("Anuncio actualizado.", "success");
      } else {
        await crearAnuncio(payload);
        mostrarToast("Anuncio creado.", "success");
      }
      limpiarFormulario();
    } catch (err) {
      console.error("[PanelAdminAnuncios] Error al guardar:", err);
      mostrarToast(err.message || "Error al guardar el anuncio.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = async (a) => {
    try {
      await alternarActivoAnuncio(a.id, !a.activo);
    } catch (err) {
      mostrarToast("No se pudo cambiar el estado del anuncio.", "error");
    }
  };

  const handleEliminar = async (a) => {
    if (!window.confirm(`¿Eliminar el anuncio "${a.titulo}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await eliminarAnuncio(a.id);
      if (form.id === a.id) limpiarFormulario();
      mostrarToast("Anuncio eliminado.", "success");
    } catch (err) {
      mostrarToast("No se pudo eliminar el anuncio.", "error");
    }
  };

  if (cargandoAuth) return null;

  if (!esAdmin) {
    return (
      <div className="app-shell flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center font-sans">
        <p className="text-[16px] font-extrabold text-ink">No tienes acceso a esta página.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 rounded-btn bg-primary px-5 py-2.5 text-[14px] font-extrabold text-white"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell bg-background pb-10 font-sans">
      <header className="relative rounded-b-[32px] bg-primary px-6 pb-8 pt-8">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="absolute left-5 top-8 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="text-center text-xl font-extrabold text-background">Gestión de Anuncios</p>
        <p className="mt-1 text-center text-[12px] font-medium text-background/75">
          Se reflejan en vivo en el carrusel de Home
        </p>
      </header>

      <main className="relative -mt-5 px-4">
        {/* ── FORMULARIO ─────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="rounded-[28px] bg-card p-5 shadow-soft">
          <p className="mb-4 text-[15px] font-extrabold text-ink">
            {form.id ? "Editar anuncio" : "Nuevo anuncio"}
          </p>

          <div className="mb-3.5">
            <label className={labelClass}>Título *</label>
            <input type="text" required maxLength={80} placeholder="Ej: Feria UNP 2026"
              value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className={`${inputClass} mt-2`} />
          </div>

          <div className="mb-3.5">
            <label className={labelClass}>Subtítulo</label>
            <input type="text" maxLength={120} placeholder="Ej: Emprendimientos estudiantiles · 18-20 Ago"
              value={form.subtitulo} onChange={(e) => setForm({ ...form, subtitulo: e.target.value })}
              className={`${inputClass} mt-2`} />
          </div>

          <div className="mb-3.5 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Color de fondo</label>
              <div className="mt-2 flex items-center gap-2">
                <input type="color" value={form.colorFondo}
                  onChange={(e) => setForm({ ...form, colorFondo: e.target.value })}
                  className="h-11 w-14 shrink-0 cursor-pointer rounded-btn border-[1.5px] border-ink/10 bg-background" />
                <input type="text" value={form.colorFondo}
                  onChange={(e) => setForm({ ...form, colorFondo: e.target.value })}
                  className={`${inputClass} flex-1`} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Orden</label>
              <input type="number" min="0" step="1" value={form.orden}
                onChange={(e) => setForm({ ...form, orden: e.target.value })}
                className={`${inputClass} mt-2`} />
            </div>
          </div>

          <div className="mb-3.5">
            <label className={labelClass}>Foto (opcional)</label>
            <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-btn border-[1.5px] border-dashed border-ink/15 bg-background px-3.5 py-3 text-[13px] font-bold text-ink/60">
              <ImagePlus size={18} className="shrink-0 text-primary" />
              {archivo ? archivo.name : (form.imagenUrl ? "Imagen actual ✓ Toca para cambiarla" : "Subir imagen de fondo")}
              <input type="file" accept="image/*" onChange={handleArchivo} className="hidden" />
            </label>
          </div>

          <div className="mb-3.5">
            <label className={labelClass}>Enlace al tocar (opcional)</label>
            <input type="text" placeholder="https://... o /producto?id=xxx"
              value={form.enlaceUrl} onChange={(e) => setForm({ ...form, enlaceUrl: e.target.value })}
              className={`${inputClass} mt-2`} />
            <p className="mt-1 text-[11px] font-semibold text-ink/40">
              Empieza con "http" para abrir en pestaña nueva, o con "/" para navegar dentro de la app.
            </p>
          </div>

          <label className="mb-4 flex items-center gap-2.5">
            <input type="checkbox" checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="h-4.5 w-4.5 accent-primary" />
            <span className="text-[13.5px] font-bold text-ink">Activo (visible en el carrusel)</span>
          </label>

          <div className="flex gap-2.5">
            <button type="submit" disabled={guardando}
              className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-primary py-3.5 text-[14px] font-extrabold text-white shadow-soft disabled:opacity-70">
              <Plus size={18} />
              {guardando ? "Guardando..." : form.id ? "Guardar cambios" : "Crear anuncio"}
            </button>
            {form.id && (
              <button type="button" onClick={limpiarFormulario}
                className="rounded-btn border-[1.5px] border-ink/10 px-4 py-3.5 text-[13.5px] font-bold text-ink/60">
                Cancelar
              </button>
            )}
          </div>
        </form>

        {/* ── LISTADO ─────────────────────────────────────── */}
        <div className="mt-5">
          <p className="mb-2.5 px-1 text-[13.5px] font-extrabold text-ink/60">
            Anuncios ({anuncios.length})
          </p>
          <div className="flex flex-col gap-2.5">
            {anuncios.map((a) => (
              <div key={a.id}
                className={`flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft ${a.activo ? "" : "opacity-50"}`}>
                <div className="h-12 w-12 shrink-0 rounded-xl" style={{ backgroundColor: a.colorFondo || "#1c398e" }} />
                <button type="button" onClick={() => cargarParaEditar(a)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[13.5px] font-extrabold text-ink">{a.titulo}</p>
                  <p className="truncate text-[11.5px] font-semibold text-ink/50">
                    {a.subtitulo || "Sin subtítulo"} · orden {a.orden ?? 0}
                  </p>
                </button>
                <button type="button" onClick={() => handleToggleActivo(a)}
                  aria-label={a.activo ? "Desactivar" : "Activar"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-ink/60">
                  {a.activo ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
                <button type="button" onClick={() => handleEliminar(a)}
                  aria-label="Eliminar"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
            {anuncios.length === 0 && (
              <p className="px-1 text-[13px] font-semibold text-ink/40">
                Aún no hay anuncios. El carrusel de Home muestra los banners locales por defecto.
              </p>
            )}
          </div>
        </div>
      </main>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[1000] w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2">
          <Toast mensaje={toast.mensaje} tipo={toast.tipo} />
        </div>
      )}
    </div>
  );
};

export default PanelAdminAnuncios;