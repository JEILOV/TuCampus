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

export const UNIVERSIDADES = {
  unp: { id: "unp", nombre: "Universidad Nacional de Piura",      dominio: "alumnos.unp.edu.pe" },
  ucv: { id: "ucv", nombre: "Universidad César Vallejo",          dominio: "ucvvirtual.edu.pe" },
  utp: { id: "utp", nombre: "Universidad Tecnológica del Perú",   dominio: "utp.edu.pe" },
};

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