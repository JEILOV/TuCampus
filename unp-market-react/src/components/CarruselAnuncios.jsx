// src/components/CarruselAnuncios.jsx
// ============================================================
//  TuCampus — Carrusel de Anuncios / Flyers del Campus
//
//  Franja deslizable horizontal para eventos de la universidad,
//  promociones o auspicios de negocios cercanos. Por ahora usa
//  un arreglo estático (ANUNCIOS_ESTATICOS); cuando exista una
//  colección de Firestore para esto, basta con reemplazar ese
//  arreglo por el resultado de un hook (mismo shape de props).
//
//  USO:
//    <CarruselAnuncios />
// ============================================================

// 🔧 Datos estáticos iniciales — mover a Firestore (colección
// "anuncios") cuando el equipo de auspicios/eventos lo requiera.
const ANUNCIOS_ESTATICOS = [
  {
    id: "feria-unp",
    titulo: "Feria UNP 2026",
    subtitulo: "Emprendimientos estudiantiles · 18-20 Ago",
    bg: "bg-primary",
    texto: "text-background",
  },
  {
    id: "promo-fotocopias",
    titulo: "20% dcto. en fotocopias",
    subtitulo: "Centro de copiado \"El Tigre\" · Puerta 3",
    bg: "bg-[#287653]",
    texto: "text-white",
  },
  {
    id: "semana-cultural",
    titulo: "Semana Cultural UNP",
    subtitulo: "Música, arte y talleres · Auditorio central",
    bg: "bg-[#a07850]",
    texto: "text-white",
  },
  {
    id: "promo-delivery",
    titulo: "Delivery gratis desde S/15",
    subtitulo: "Pide con estudiantes de tu facultad",
    bg: "bg-ink",
    texto: "text-background",
  },
];

const CarruselAnuncios = ({ anuncios = ANUNCIOS_ESTATICOS }) => {
  if (!anuncios || anuncios.length === 0) return null;

  return (
    <div
      className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Anuncios y flyers del campus"
    >
      {anuncios.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={a.onClick}
          className={`relative flex h-28 w-64 shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[24px] p-4 text-left shadow-soft transition-transform active:scale-[0.98] ${a.bg}`}
        >
          {a.imagen && (
            <img
              src={a.imagen}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
          )}
          <div className="relative">
            <p className={`text-[15px] font-extrabold leading-tight ${a.texto}`}>{a.titulo}</p>
            {a.subtitulo && (
              <p className={`mt-1 text-[11.5px] font-semibold leading-snug ${a.texto} opacity-80`}>
                {a.subtitulo}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
};

export default CarruselAnuncios;