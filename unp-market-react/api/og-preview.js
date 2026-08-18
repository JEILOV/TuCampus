// api/og-preview.js
// ============================================================
//  TuCampus — OpenGraph dinámico para /producto
//
//  Esta función SOLO se invoca cuando `vercel.json` detecta (vía
//  el header User-Agent) que quien pide /producto es un crawler
//  de redes sociales (WhatsApp, Facebook, Telegram, Twitter/X,
//  Discord, etc.) — ver la regla `has` en vercel.json. Un usuario
//  real navegando en el navegador NUNCA pasa por aquí: sigue yendo
//  directo al index.html de la SPA, sin costo extra de Firestore
//  ni de cómputo en cada visita normal.
//
//  Responsabilidad de esta función:
//    1. Leer `?id=` de la URL de /producto.
//    2. Consultar el producto en Firestore con firebase-admin
//       (bypassa Firestore Rules — no necesita el usuario logueado).
//    3. Devolver un HTML mínimo y estático con <meta> OpenGraph
//       ya rellenas con título, precio, campus, imagen, etc.
//       Los crawlers NO ejecutan JS, así que esto es indispensable
//       para que el preview de WhatsApp/Facebook/Telegram muestre
//       datos reales del producto en vez del <title>TuCampus</title>
//       genérico de index.html.
//
//  Variables de entorno necesarias en Vercel (Project Settings →
//  Environment Variables), sacadas del JSON de la Service Account
//  (Firebase Console → Configuración del proyecto → Cuentas de
//  servicio → Generar nueva clave privada):
//
//    FIREBASE_PROJECT_ID    = unp-market
//    FIREBASE_CLIENT_EMAIL  = firebase-adminsdk-xxxxx@unp-market.iam.gserviceaccount.com
//    FIREBASE_PRIVATE_KEY   = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
//
//  ⚠️ FIREBASE_PRIVATE_KEY: al pegarla en Vercel, las líneas vienen
//  con "\n" literales (texto), no saltos de línea reales — por eso
//  abajo se hace `.replace(/\\n/g, "\n")`. Pégala tal cual sale del
//  JSON, entre comillas, sin tocarla a mano.
// ============================================================

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Catálogo de universidades (duplicado minimal de
//    src/config/universidades.js — esta función corre en un
//    runtime aislado de Vercel y no puede importar código de /src). ──
const NOMBRE_UNIVERSIDAD = {
  unp: "Universidad Nacional de Piura",
  ucv: "Universidad César Vallejo",
  utp: "Universidad Tecnológica del Perú",
};

// 🌐 Debe coincidir exactamente con el canonical de index.html
// (https://www.tucampus.net.pe/) y con el destino del redirect 308
// en vercel.json — así ningún link generado acá (urlProducto, url
// en el <meta http-equiv="refresh">, og:url, etc.) pasa por el salto
// extra del redirect del dominio viejo.
const SITE_URL = "https://www.tucampus.net.pe";
const IMAGEN_POR_DEFECTO = `${SITE_URL}/assets/icon-512.png`;

// ── Inicialización perezosa de firebase-admin (una sola vez por
//    instancia "caliente" de la función serverless). ──
function obtenerDb() {
  if (!getApps().length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      throw new Error(
        "Faltan variables de entorno FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
      );
    }

    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  return getFirestore();
}

// ── Escapa texto para uso seguro dentro de atributos/contenido HTML.
//    Los títulos/descripciones vienen de contenido publicado por
//    usuarios (productService.js) — nunca deben inyectarse crudos. ──
function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Recorta descripciones largas para que el preview no se vea
//    cortado a la mitad de una palabra en WhatsApp/Facebook. ──
function truncar(texto, maxLen) {
  if (!texto || texto.length <= maxLen) return texto || "";
  return `${texto.slice(0, maxLen - 1).trimEnd()}…`;
}

function construirHtml({ titulo, descripcion, imagen, url }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>${escaparHtml(titulo)}</title>
<meta name="description" content="${escaparHtml(descripcion)}" />
<link rel="canonical" href="${escaparHtml(url)}" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="TuCampus" />
<meta property="og:title" content="${escaparHtml(titulo)}" />
<meta property="og:description" content="${escaparHtml(descripcion)}" />
<meta property="og:image" content="${escaparHtml(imagen)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="1200" />
<meta property="og:url" content="${escaparHtml(url)}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escaparHtml(titulo)}" />
<meta name="twitter:description" content="${escaparHtml(descripcion)}" />
<meta name="twitter:image" content="${escaparHtml(imagen)}" />

<!-- Si un humano llega a abrir esta URL directo (no un crawler),
     lo mandamos a la SPA real en vez de dejarlo en esta página
     estática mínima. -->
<meta http-equiv="refresh" content="0; url=${escaparHtml(url)}" />
</head>
<body>
  <p>Redirigiendo a <a href="${escaparHtml(url)}">${escaparHtml(titulo)}</a>…</p>
</body>
</html>`;
}

function htmlGenerico() {
  return construirHtml({
    titulo: "TuCampus",
    descripcion: "El marketplace de tu universidad. Compra y vende entre estudiantes de tu campus.",
    imagen: IMAGEN_POR_DEFECTO,
    url: `${SITE_URL}/`,
  });
}

export default async function handler(req, res) {
  const id = typeof req.query?.id === "string" ? req.query.id : Array.isArray(req.query?.id) ? req.query.id[0] : null;

  // Sin id → no hay nada que mostrar de un producto específico.
  if (!id) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(htmlGenerico());
    return;
  }

  const urlProducto = `${SITE_URL}/producto?id=${encodeURIComponent(id)}`;

  try {
    const db = obtenerDb();
    const snap = await db.collection("productos").doc(id).get();

    if (!snap.exists) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      res.status(200).send(
        construirHtml({
          titulo: "Producto no disponible | TuCampus",
          descripcion: "Este producto ya no está disponible en TuCampus.",
          imagen: IMAGEN_POR_DEFECTO,
          url: urlProducto,
        })
      );
      return;
    }

    const producto = snap.data() || {};

    const titulo = producto.titulo || "Producto en TuCampus";
    const precio = typeof producto.precio === "number" ? producto.precio.toFixed(2) : producto.precio;

    // 🏫 Sede dinámica: prioriza un campo de texto libre en el producto
    // (`sede` o `universidad`, por si en el futuro se permite una sede
    // fuera del catálogo fijo) por encima del lookup vía `universidadId`
    // en NOMBRE_UNIVERSIDAD. Si no hay ninguno de los dos, cae al nombre
    // de la sede original de TuCampus en vez del genérico "TuCampus" —
    // así el preview de WhatsApp siempre nombra una universidad real.
    const nombreUniversidad =
      producto.sede
      || producto.universidad
      || NOMBRE_UNIVERSIDAD[producto.universidadId]
      || "Universidad Nacional de Piura";

    const imagen =
      (Array.isArray(producto.imagenes) && producto.imagenes.length > 0
        ? producto.imagenes[0]
        : producto.imagen) || IMAGEN_POR_DEFECTO;

    const ogTitle = precio ? `${titulo} - S/ ${precio} | TuCampus` : `${titulo} | TuCampus`;
    const ogDescription = truncar(
      `${nombreUniversidad} • ${producto.descripcion || "Disponible en TuCampus"}`,
      200
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Cache corto en el edge: si el vendedor edita precio/foto, el
    // preview se refresca solo en máximo 5 minutos sin tener que
    // tocar nada manualmente.
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(
      construirHtml({
        titulo: ogTitle,
        descripcion: ogDescription,
        imagen,
        url: urlProducto,
      })
    );
  } catch (err) {
    console.error("[og-preview] Error consultando Firestore:", err);
    // Ante cualquier falla (credenciales, red, doc corrupto) devolvemos
    // el preview genérico en vez de un error 500 — un preview
    // genérico es mejor que un link roto en WhatsApp.
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(
      construirHtml({
        titulo: "TuCampus",
        descripcion: "El marketplace de tu universidad.",
        imagen: IMAGEN_POR_DEFECTO,
        url: urlProducto,
      })
    );
  }
}