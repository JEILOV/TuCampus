// src/components/ProductCard.jsx
// ============================================================
//  TuCampus — Tarjeta de producto (compartida)
//
//  Extraída de Home.jsx (Fase 2 del rediseño) para poder
//  reutilizarla en Favoritos, Vendedor, etc. Migrada a Tailwind;
//  la lógica (estado agotado, placeholder por categoría, formato
//  de precio) es exactamente la misma que ya tenías.
//
//  ⭐ Fase "Reputación visible": se agregó un badge de estrellas
//  sobre la imagen, usando calificacionVendedor / totalResenasVendedor
//  (denormalizados en el producto al publicar — ver productService.js).
//  Si el vendedor aún no tiene reseñas, muestra "⭐ Nuevo".
//
//  USO:
//    <ProductCard producto={p} onVerDetalle={(id) => ...} />
// ============================================================

import { useState } from "react";
import { Star } from "lucide-react";
import { CATEGORY_ICON_MAP, IconPackage } from "./CategoryIcons";

const ProductCard = ({ producto, onVerDetalle }) => {
  const {
    id, titulo, precio, imagen, categoria,
    vendedorNombre, avatarVendedor, estado,
  } = producto;

  const estaAgotado = estado === "agotado";
  const catKey = (categoria || "").toLowerCase();
  const IconPlaceholder = CATEGORY_ICON_MAP[catKey] || IconPackage;

  // 🔧 Rendimiento/CLS: el contenedor ya reserva el espacio exacto
  // (aspect-square), así que no hay salto de layout al cargar. Este
  // estado es solo para el efecto de aparición: un skeleton shimmer
  // sutil mientras la imagen decodifica, con fade-in al terminar, en
  // vez de un "pop" brusco cuando la conexión es lenta.
  const [imagenCargada, setImagenCargada] = useState(false);

  // 🔧 Lectura defensiva de la reputación denormalizada. El único
  // nombre de campo real que escribe productService.crearProducto y
  // que ahora también refresca reviewService.guardarOActualizarResena
  // en cada reseña es calificacionVendedor/totalResenasVendedor — no
  // existe (ni existió) un campo "vendedorCalificacion"/
  // "vendedorTotalResenas" en este proyecto, así que no se agrega ese
  // fallback para no sugerir un campo que nunca se escribe. Se usa
  // `??` en vez de `||` para que un 0 explícito no se pise a sí mismo.
  const calificacionVendedor = producto.calificacionVendedor ?? 0;
  const totalResenasVendedor = producto.totalResenasVendedor ?? 0;
  const tieneResenas = totalResenasVendedor > 0;

  return (
    <article
      onClick={() => onVerDetalle(id)}
      className={`h-fit w-full cursor-pointer self-start overflow-hidden rounded-card bg-card shadow-soft transition-all duration-200 ease-out active:scale-[0.98]${
        estaAgotado ? " opacity-70" : ""
      }`}
    >
      {/* Imagen 1:1 con precio flotante */}
      <div className="relative aspect-square w-full bg-background">
        {imagen && imagen.trim() ? (
          <>
            {/* Skeleton shimmer — visible hasta que la imagen real termine
                de decodificar. Mismo tamaño exacto que la imagen final
                (absolute inset-0 dentro del contenedor aspect-square), así
                que no hay salto de layout, solo una transición de opacidad. */}
            {!imagenCargada && (
              <div className="absolute inset-0 animate-pulse bg-ink/10" aria-hidden="true" />
            )}
            <img
              src={imagen}
              alt={titulo || "Producto"}
              loading="lazy"
              decoding="async"
              onLoad={() => setImagenCargada(true)}
              className={`h-full w-full object-cover transition-opacity duration-300 ease-out${
                imagenCargada ? " opacity-100" : " opacity-0"
              }${estaAgotado ? " grayscale" : ""}`}
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <IconPlaceholder color="#a07850" />
          </div>
        )}

        <span
          className={`absolute right-2.5 top-2.5 rounded-chip px-2.5 py-1 text-xs font-bold text-white shadow-soft ${
            estaAgotado ? "bg-ink/50" : "bg-ink"
          }`}
        >
          S/ {(precio || 0).toFixed(2)}
        </span>

        {/* ⭐ Badge de reputación del vendedor */}
        <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-chip bg-white/95 px-2 py-1 text-[11px] font-extrabold text-ink shadow-soft">
          <Star size={12} strokeWidth={2.5} fill="#F5B301" color="#F5B301" />
          {tieneResenas ? (
            <>
              {calificacionVendedor.toFixed(1)}
              <span className="font-semibold text-ink/50">({totalResenasVendedor})</span>
            </>
          ) : (
            <span className="text-ink/50">Nuevo</span>
          )}
        </span>

        {estaAgotado && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
            <span className="rounded-chip bg-white px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* Cuerpo: título + vendedor */}
      <div className="p-3">
        <h3 className={`truncate text-[13.5px] font-bold ${estaAgotado ? "text-ink/50" : "text-ink"}`}>
          {titulo || "Sin título"}
        </h3>

        {vendedorNombre && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {avatarVendedor?.trim() ? (
                <img
                  src={avatarVendedor}
                  alt={vendedorNombre}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                (vendedorNombre || "?")[0].toUpperCase()
              )}
            </div>
            <span className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-ink/60">
              {vendedorNombre}
            </span>
          </div>
        )}
      </div>
    </article>
  );
};

export default ProductCard;