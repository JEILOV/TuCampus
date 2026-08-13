// src/config/universidades.js
// ============================================================
//  TuCampus — Catálogo de universidades (Multicampus)
//
//  Única fuente de verdad del lado del cliente sobre qué sedes
//  están soportadas y con qué dominio de correo institucional
//  se identifica a cada una.
//
//  ⚠️ IMPORTANTE: si agregas o quitas una universidad aquí, la
//  whitelist de dominios en `firestore.rules` (función
//  `esEstudianteValido()`) DEBE actualizarse a mano también —
//  el candado real de seguridad vive en las reglas, este archivo
//  es solo para UX/lógica de la app (detección, badges, filtros).
// ============================================================

// 🎨 `color` = color institucional de cada sede (Sistema de Colores
// Temáticos por Sede). Se usa para tematizar el Header de Home.jsx,
// el banner de Perfil.jsx y las tarjetas del vendedor (Vendedor.jsx),
// vía estilos inline (`style={{ backgroundColor: universidad.color }}`)
// ya que Tailwind no puede generar clases con colores dinámicos en
// tiempo de build.
export const UNIVERSIDADES = {
  unp: { id: "unp", nombre: "Universidad Nacional de Piura",      dominio: "alumnos.unp.edu.pe", color: "#0f4c81" }, // Azul
  ucv: { id: "ucv", nombre: "Universidad César Vallejo",          dominio: "ucvvirtual.edu.pe",   color: "#D32F2F" }, // Rojo
  utp: { id: "utp", nombre: "Universidad Tecnológica del Perú",   dominio: "utp.edu.pe",          color: "#18181B" }, // Negro
};

// Color de respaldo cuando no se conoce la sede del usuario/vendedor
// (perfiles viejos sin `universidadId`, o datos aún cargando).
const COLOR_POR_DEFECTO = UNIVERSIDADES.unp.color;

// Lista derivada, útil para iterar (selects, validaciones, etc.)
export const LISTA_UNIVERSIDADES = Object.values(UNIVERSIDADES);

/**
 * Detecta a qué universidad pertenece un correo institucional según
 * su dominio. Hace match exacto de sufijo (no solo "incluye"), para
 * evitar falsos positivos con subdominios o dominios similares.
 *
 * @param {string} email
 * @returns {{id: string, nombre: string, dominio: string} | null}
 *   El objeto de la universidad correspondiente, o null si el correo
 *   no pertenece a ninguna sede soportada.
 */
export const detectarUniversidad = (email) => {
  if (!email || typeof email !== "string") return null;
  const emailLower = email.toLowerCase().trim();

  const universidad = LISTA_UNIVERSIDADES.find((u) =>
    emailLower.endsWith(`@${u.dominio}`)
  );

  return universidad || null;
};

/**
 * Atajo booleano: ¿el correo pertenece a alguna universidad soportada?
 * Útil en Login.jsx / AuthContext.jsx para el bloqueo de acceso.
 * @param {string} email
 * @returns {boolean}
 */
export const esCorreoInstitucionalValido = (email) => detectarUniversidad(email) !== null;

/**
 * 🎨 Color institucional de una sede por su `universidadId`.
 * Si la sede no existe en el catálogo (perfil viejo, dato corrupto, etc.),
 * cae de vuelta al color de UNP para no romper la UI.
 * @param {string|null|undefined} universidadId
 * @returns {string} Color hex, ej. "#0f4c81"
 */
export const obtenerColorUniversidad = (universidadId) =>
  UNIVERSIDADES[universidadId]?.color || COLOR_POR_DEFECTO;

/**
 * Oscurece un color hex un cierto porcentaje — usado para armar el
 * degradado del banner (de `color` a una versión más oscura de sí
 * mismo), igual que antes se hacía con `primary` -> `primary-dark`.
 * @param {string} hex
 * @param {number} porcentaje  0-100
 * @returns {string} Color hex oscurecido
 */
export const oscurecerColor = (hex, porcentaje = 20) => {
  const limpio = (hex || COLOR_POR_DEFECTO).replace("#", "");
  const num = parseInt(limpio, 16);
  const factor = 1 - porcentaje / 100;

  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * factor));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * factor));
  const b = Math.max(0, Math.round((num & 0xff) * factor));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

/**
 * 🏫 Nombre de estudiante por defecto según sede — reemplaza el
 * hardcode "Estudiante UNP" para que cada sede tenga el suyo
 * ("Estudiante UTP", "Estudiante UCV", etc.).
 * @param {string|null|undefined} universidadId
 * @returns {string}
 */
export const nombreEstudiantePorDefecto = (universidadId) => {
  const u = UNIVERSIDADES[universidadId];
  return u ? `Estudiante ${u.id.toUpperCase()}` : "Estudiante TuCampus";
};

/**
 * 🏫 Bio de estudiante por defecto según sede — reemplaza el
 * hardcode "Estudiante de la UNP".
 * @param {string|null|undefined} universidadId
 * @returns {string}
 */
export const bioEstudiantePorDefecto = (universidadId) => {
  const u = UNIVERSIDADES[universidadId];
  return u ? `Estudiante de la ${u.id.toUpperCase()}` : "Estudiante de TuCampus";
};

/**
 * 🏫 Nombre de vendedor por defecto según sede — reemplaza el
 * hardcode "Vendedor UNP" / "Vendedor de la UNP".
 * @param {string|null|undefined} universidadId
 * @param {boolean} conArticulo  true -> "Vendedor de la UTP", false -> "Vendedor UTP"
 * @returns {string}
 */
export const vendedorPorDefecto = (universidadId, conArticulo = false) => {
  const u = UNIVERSIDADES[universidadId];
  if (!u) return conArticulo ? "Vendedor de TuCampus" : "Vendedor TuCampus";
  return conArticulo ? `Vendedor de la ${u.id.toUpperCase()}` : `Vendedor ${u.id.toUpperCase()}`;
};