// api/sitemap.js
// ============================================================
//  TuCampus — Sitemap dinámico (Vercel Serverless Function)
//
//  POR QUÉ ES DINÁMICO Y NO UN sitemap.xml ESTÁTICO: los productos
//  se crean y se eliminan constantemente (ver productService.js),
//  así que un XML estático quedaría desactualizado al día siguiente
//  de generarlo. Este endpoint arma el sitemap EN CADA REQUEST (con
//  caché de borde, ver Cache-Control abajo) a partir de lo que hay
//  ahora mismo en Firestore.
//
//  RUTA PÚBLICA: /sitemap.xml (ver rewrite en vercel.json que
//  redirige esa ruta hacia esta función — así los buscadores piden
//  la ruta estándar sin saber que por debajo es una función).
//
//  Reusa el mismo patrón de inicialización de firebase-admin que
//  api/enviar-push.js — mismas variables de entorno, ya configuradas
//  en Vercel (no hace falta agregar nada nuevo):
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY
// ============================================================

import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const BASE_URL = "https://www.tucampus.net.pe";

// Límite duro de Sitemaps 50,000 URLs por archivo (protocolo sitemaps.org).
// Muy por encima de lo que este proyecto va a tener en el corto/mediano
// plazo — si algún día se supera, hay que pasar a un sitemap index.
const MAX_PRODUCTOS = 45000;

// Rutas estáticas públicas (sin sesión) que sí queremos indexadas.
// NO se incluyen /chat, /perfil, /publicar, /editar, /notificaciones,
// /admin/anuncios — son privadas o requieren sesión (ver robots.txt).
const RUTAS_ESTATICAS = [
  { loc: "/", changefreq: "hourly", priority: "1.0" },
  { loc: "/terminos", changefreq: "yearly", priority: "0.3" },
];

const escaparXml = (texto) =>
  String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const formatearFecha = (timestampFirestore) => {
  try {
    const fecha = timestampFirestore?.toDate ? timestampFirestore.toDate() : new Date();
    return fecha.toISOString().split("T")[0]; // YYYY-MM-DD, formato que espera <lastmod>
  } catch {
    return new Date().toISOString().split("T")[0];
  }
};

export default async function handler(req, res) {
  try {
    const db = admin.firestore();

    // Solo productos "disponible" — los vendidos/pausados no aportan
    // valor de búsqueda y generan enlaces rotos en resultados de Google.
    const snap = await db
      .collection("productos")
      .where("estado", "==", "disponible")
      .orderBy("fecha", "desc")
      .limit(MAX_PRODUCTOS)
      .get();

    const urlsProductos = snap.docs.map((doc) => {
      const data = doc.data();
      return `  <url>
    <loc>${BASE_URL}/producto?id=${escaparXml(doc.id)}</loc>
    <lastmod>${formatearFecha(data.fecha)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    const urlsEstaticas = RUTAS_ESTATICAS.map(
      ({ loc, changefreq, priority }) => `  <url>
    <loc>${BASE_URL}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urlsEstaticas, ...urlsProductos].join("\n")}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // 🔧 Caché de borde de 1h: los buscadores no necesitan ver un
    // producto nuevo al segundo — regenerar en cada hit de Googlebot
    // sería gastar lecturas de Firestore sin beneficio real.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
  } catch (err) {
    console.error("[api/sitemap] Error inesperado:", err);
    // Fallback: sitemap mínimo (solo estáticas) en vez de un 500 crudo —
    // así Googlebot no ve un error duro si Firestore/admin falla, y
    // la home sigue indexada aunque los productos no aparezcan hoy.
    const xmlFallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${RUTAS_ESTATICAS.map(
  ({ loc, changefreq, priority }) => `  <url>
    <loc>${BASE_URL}${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
).join("\n")}
</urlset>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
    return res.status(200).send(xmlFallback);
  }
}
