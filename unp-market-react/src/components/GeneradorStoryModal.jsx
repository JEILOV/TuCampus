// src/components/GeneradorStoryModal.jsx
// ============================================================
//  TuCampus — Generador de Story para compartir un producto
//
//  Convierte una tarjeta React (formato 9:16, estilo Instagram
//  Stories / Estados de WhatsApp) en un PNG real usando
//  `html-to-image`, y lo comparte con la Web Share API nativa
//  (navigator.share con `files`, igual que "Compartir canción" de
//  Spotify). Si el navegador no soporta compartir archivos
//  (típicamente desktop), descarga el PNG automáticamente y copia
//  el link del producto al portapapeles.
//
//  ⚠️ DEPENDENCIA NUEVA — hay que instalarla:
//      npm install html-to-image
//
//  ⚠️ CORS: si `producto.imagen` o `avatarVendedor` viven en un
//  host que no manda cabeceras CORS (Access-Control-Allow-Origin),
//  html-to-image no puede leer esos píxeles y tira un error al
//  generar el PNG (el <img> se ve bien en pantalla, pero el canvas
//  queda "tainted"). ImgBB (usado hoy para las fotos de producto)
//  sí manda esas cabeceras, así que en la práctica no debería pasar
//  — pero si en el futuro se cambia de proveedor de imágenes, hay
//  que confirmar que el nuevo también las mande.
//
//  USO (ver integración en Producto.jsx):
//    {mostrandoStory && (
//      <GeneradorStoryModal
//        producto={producto}
//        emoji={emoji}
//        nombreVendedor={nombreVendedor}
//        avatarVendedor={avatarVendedor}
//        calificacion={reputacionVendedor?.calificacionPromedio || 0}
//        totalResenas={reputacionVendedor?.totalResenas || 0}
//        productoUrl={window.location.href} // fallback si no hay producto.id — ver SITIO_URL/urlCanonica abajo
//        onClose={() => setMostrandoStory(false)}
//        onToast={mostrarToast}
//      />
//    )}
// ============================================================

import { useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { QRCodeSVG } from "qrcode.react";
import { X, Share2, Download, Star } from "lucide-react";
import { UNIVERSIDADES, obtenerColorAccent } from "../config/universidades";

const MASCOTA_ICONO = "/assets/mascota-icono-placeholder.png";

// 🌐 Dominio propio oficial. El QR y el texto del pie de la story
// SIEMPRE deben apuntar acá — nunca a `window.location.href` (que en
// preview/staging/localhost sería otro host distinto al que la gente
// realmente va a escanear/visitar). `productoUrl` (prop) se conserva
// solo como fallback para `navigator.share({ url })` cuando por algún
// motivo no llega `producto.id`.
const SITIO_URL = "https://tucampus.net.pe";

// 🏫 Multicampus — Story Card: tematización por sede del PRODUCTO
// (`producto.universidadId`), no de la sede que el usuario esté
// explorando en Home (`--color-accent` global). En la práctica ambas
// suelen coincidir porque useProducts ya filtra por sede activa, pero
// esta tarjeta se genera a partir de UN producto concreto, así que se
// ancla a su propio dueño — más correcto y sigue funcionando igual si
// en el futuro se comparte desde un contexto que mezcle sedes.
//
// Clases Tailwind completas (no interpoladas) a propósito: Tailwind
// solo genera CSS para clases que puede leer como texto literal en el
// código fuente — un template string como `from-${color}-900` no
// generaría nada. Este mapa es la única fuente de verdad para los 3
// degradados; agregar una sede nueva implica agregar una entrada aquí
// Y en universidades.js (mismo criterio que el resto del proyecto).
const TEMA_STORY_POR_SEDE = {
  unp: {
    gradiente: "bg-gradient-to-br from-blue-900 to-blue-700",
    qrFg: "#1e3a8a", // blue-900 — coincide con el degradado, legible sobre blanco
  },
  ucv: {
    gradiente: "bg-gradient-to-br from-red-950 to-red-800",
    qrFg: "#450a0a", // red-950
  },
  utp: {
    gradiente: "bg-gradient-to-br from-zinc-950 to-zinc-900",
    qrFg: "#09090b", // zinc-950
  },
};
const TEMA_STORY_POR_DEFECTO = TEMA_STORY_POR_SEDE.unp;

// Slug simple para el nombre del archivo descargado.
const slugify = (texto) =>
  (texto || "producto")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "producto";

const descargarBlob = (blob, nombreArchivo) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const GeneradorStoryModal = ({
  producto,
  emoji = "📦",
  nombreVendedor = "Vendedor UNP",
  avatarVendedor = "",
  calificacion = 0,
  totalResenas = 0,
  productoUrl,
  onClose,
  onToast,
}) => {
  const storyRef       = useRef(null);
  const [generando, setGenerando] = useState(false);

  const titulo   = producto?.titulo || "Producto";
  const precio   = (producto?.precio || 0).toFixed(2);
  const imagen   = (producto?.imagen || "").trim();
  const tieneResenas = totalResenas > 0;

  // 🏫 Multicampus — sede del producto y su temática visual/textual.
  const universidadId = producto?.universidadId;
  const universidad    = UNIVERSIDADES[universidadId];
  const nombreSede      = universidad ? universidad.id.toUpperCase() : "TuCampus";
  const tema             = TEMA_STORY_POR_SEDE[universidadId] || TEMA_STORY_POR_DEFECTO;
  // Botón "Compartir": color de acento oficial de la sede del producto
  // (mismo mapa que usa CampusContext para --color-accent, pero
  // resuelto para ESTA sede puntual, no la que esté activa en Home).
  const colorAccentBoton = obtenerColorAccent(universidadId);

  // 🌐 URL canónica del producto — se arma con el dominio propio +
  // el id real (ruta usada en toda la app: /producto?id=...., ver
  // App.jsx + Producto.jsx). Si por lo que sea no llega `producto.id`,
  // cae a `productoUrl` (prop, hoy `window.location.href` desde
  // Producto.jsx) para no romper el compartir.
  const urlCanonica = producto?.id
    ? `${SITIO_URL}/producto?id=${producto.id}`
    : (productoUrl || SITIO_URL);

  const dominioCorto = (() => {
    try { return new URL(urlCanonica).host; }
    catch { return "tucampus.net.pe"; }
  })();

  // ── Genera el PNG a partir del nodo de la story ──────────────
  //
  // ⚠️ FIX CORS Google Fonts: por defecto, html-to-image intenta leer
  // `cssRules` de CADA <style>/<link> del documento —incluida la hoja
  // que Tailwind/el navegador carga desde fonts.googleapis.com— para
  // inlinear las fuentes en el PNG. Como esa hoja está en otro origen
  // y no siempre expone CORS al `cssRules` (aunque el archivo cargue
  // bien), el navegador tira `SecurityError: Cannot access rules` y la
  // promesa de toBlob() nunca resuelve → el botón se queda pegado en
  // "Generando imagen...". `skipFonts: true` evita ese intento de
  // lectura por completo (no necesitamos fuentes custom embebidas acá,
  // la tarjeta usa la tipografía del sistema/Tailwind por defecto).
  const generarImagen = async () => {
    if (!storyRef.current) return null;
    // pixelRatio 4 sobre una tarjeta de 270×480css ≈ 1080×1920px reales
    // — la resolución estándar de una Instagram Story.
    return await toBlob(storyRef.current, {
      pixelRatio: 4,
      cacheBust: true,
      skipFonts: true, // evita el SecurityError al leer cssRules de Google Fonts
      fontEmbedCSS: "", // refuerzo: aunque alguna versión ignore skipFonts, no hay CSS de fuentes que intentar parsear
    });
  };

  // ── Botón principal: compartir (o fallback descargar+copiar) ──
  const handleCompartir = async () => {
    if (generando) return;
    setGenerando(true);
    try {
      const blob = await generarImagen();
      if (!blob) throw new Error("No se pudo generar la imagen.");

      const nombreArchivo = `tucampus-${slugify(titulo)}.png`;
      const file = new File([blob], nombreArchivo, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: titulo,
          text: `¡Mira "${titulo}" en TuCampus!`,
          url: urlCanonica,
        });
      } else {
        // Fallback: navegadores de escritorio (o sin soporte de
        // compartir archivos) — descarga automática + link copiado.
        descargarBlob(blob, nombreArchivo);
        try {
          await navigator.clipboard.writeText(urlCanonica);
          onToast?.("Imagen descargada y link copiado al portapapeles 🔗", "success");
        } catch {
          onToast?.(`Imagen descargada. Copiá el link manualmente: ${urlCanonica}`, "success");
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") return; // el usuario cerró el share sheet — no es un error
      console.error("[GeneradorStoryModal] Error al compartir:", err);
      onToast?.("No se pudo generar la imagen para compartir.", "error");
    } finally {
      setGenerando(false);
    }
  };

  // ── Botón secundario: descargar directo, sin intentar compartir ──
  const handleDescargar = async () => {
    if (generando) return;
    setGenerando(true);
    try {
      const blob = await generarImagen();
      if (!blob) throw new Error("No se pudo generar la imagen.");
      descargarBlob(blob, `tucampus-${slugify(titulo)}.png`);
      onToast?.("Imagen descargada ✓", "success");
    } catch (err) {
      console.error("[GeneradorStoryModal] Error al descargar:", err);
      onToast?.("No se pudo generar la imagen.", "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-ink/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget && !generando) onClose?.(); }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[420px] flex-col overflow-y-auto rounded-t-[28px] bg-card p-5 pb-6 sm:rounded-[28px]">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-extrabold text-ink">Compartir producto</p>
          <button
            type="button"
            onClick={() => !generando && onClose?.()}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-ink/50"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Tarjeta capturable — formato Story 9:16 ────────────
             270×480 css px * pixelRatio 4 = 1080×1920 px reales.
             TODO lo que esté dentro de storyRef termina en el PNG;
             los botones de abajo quedan fuera a propósito. */}
        <div className="mx-auto w-[270px]">
          <div
            ref={storyRef}
            className={`relative h-[480px] w-[270px] overflow-hidden rounded-[28px] ${tema.gradiente}`}
          >
            {/* Halo decorativo */}
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)" }}
            />

            <div className="relative flex h-full flex-col px-5 pt-6">
              {/* Marca TuCampus arriba */}
              <div className="flex items-center gap-1.5">
                <img
                  src={MASCOTA_ICONO}
                  alt=""
                  crossOrigin="anonymous"
                  className="h-6 w-6 object-contain"
                />
                <span className="text-[13px] font-extrabold tracking-wide text-white">TuCampus</span>
              </div>

              {/* Imagen del producto, con badge de precio flotante */}
              <div className="relative mx-auto mt-5 w-[210px]">
                <div className="aspect-square w-full overflow-hidden rounded-[22px] shadow-[0_18px_34px_rgba(0,0,0,0.45)]">
                  {imagen ? (
                    <img
                      src={imagen}
                      alt=""
                      crossOrigin="anonymous"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#c8a97a] to-[#a07850] text-6xl">
                      {emoji}
                    </div>
                  )}
                </div>
                <span className="absolute -bottom-3 -right-3 rounded-full bg-white px-3.5 py-1.5 text-[15px] font-extrabold text-ink shadow-[0_6px_14px_rgba(0,0,0,0.3)]">
                  S/ {precio}
                </span>
              </div>

              {/* Título + vendedor */}
              <div className="mt-7 flex-1">
                <p
                  className="text-[19px] font-extrabold leading-tight text-white"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {titulo}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 text-[10px] font-bold text-white">
                    {avatarVendedor?.trim() ? (
                      <img
                        src={avatarVendedor}
                        alt=""
                        crossOrigin="anonymous"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (nombreVendedor || "?")[0].toUpperCase()
                    )}
                  </div>
                  <span className="truncate text-[12.5px] font-bold text-white/85">
                    {nombreVendedor}
                  </span>

                  <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-[#F5B301] px-2 py-[3px] text-[11px] font-extrabold text-ink">
                    <Star size={11} strokeWidth={2.5} fill="#1a1a1a" color="#1a1a1a" />
                    {tieneResenas ? calificacion.toFixed(1) : "Nuevo"}
                  </span>
                </div>
              </div>

              {/* Footer distintivo */}
              <div className="mb-6 flex items-center justify-between border-t border-white/15 pt-3">
                <div>
                  <p className="text-[12px] font-extrabold text-white">Disponible en la {nombreSede}</p>
                  <p className="text-[10.5px] font-semibold text-white/60">{dominioCorto}</p>
                </div>
                {/* QR real y escaneable — apunta directo a la URL del
                    producto. Fondo blanco + padding propio (no solo el
                    del contenedor) para que quede un margen "silencioso"
                    (quiet zone) alrededor del código: sin eso, lectores
                    de cámara/Instagram pueden fallar en detectarlo,
                    sobre todo con el fondo oscuro de la story detrás.
                    🏫 fgColor sigue el mismo tono base que el degradado
                    de fondo de esta sede (ver TEMA_STORY_POR_SEDE), en
                    vez del azul UNP fijo que tenía antes. */}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white p-1.5">
                  <QRCodeSVG
                    value={urlCanonica}
                    size={44}
                    bgColor="#ffffff"
                    fgColor={tema.qrFg}
                    level="M"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Acciones — fuera del nodo capturado */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleCompartir}
            disabled={generando}
            // 🏫 Multicampus: color de acento de la sede DEL PRODUCTO
            // (no bg-[var(--color-accent)], que sigue la sede que el
            // usuario esté EXPLORANDO en Home — puede no coincidir si
            // este modal se abre desde otro contexto). Se aplica vía
            // style porque el valor es dinámico (viene de
            // obtenerColorAccent), no una clase Tailwind estática.
            style={{ backgroundColor: colorAccentBoton }}
            className="flex items-center justify-center gap-2 rounded-btn py-3.5 text-[14.5px] font-extrabold text-white shadow-soft transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
          >
            <Share2 size={18} />
            {generando ? "Generando imagen..." : "Compartir en Stories / WhatsApp"}
          </button>
          <button
            type="button"
            onClick={handleDescargar}
            disabled={generando}
            className="flex items-center justify-center gap-2 rounded-btn border-[1.5px] border-ink/10 py-3 text-[13.5px] font-bold text-ink/60 disabled:opacity-60"
          >
            <Download size={16} />
            Descargar imagen
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneradorStoryModal;