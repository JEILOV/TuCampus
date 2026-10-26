// lib/serverAuth.js
// ============================================================
//  HELPER COMPARTIDO DE AUTENTICACIÓN DEL SERVIDOR — UNP Market
//
//  Vive fuera de api/ para que Vercel no lo exponga como endpoint
//  serverless independiente. Verifica ID tokens de Firebase Auth y
//  exige correo verificado + dominio institucional autorizado.
// ============================================================

import admin from "firebase-admin";

// 🏫 Multicampus: whitelist de dominios institucionales soportados.
// ⚠️ Debe coincidir exactamente con `esEstudianteValido` en firestore.rules
// y con `src/config/universidades.js`.
export const DOMINIOS_PERMITIDOS = [
  "alumnos.unp.edu.pe",
  "ucvvirtual.edu.pe",
  "utp.edu.pe",
];

export const obtenerAdmin = () => {
  if (!admin.apps.length) {
    const env = globalThis.process?.env || {};
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin;
};

export const esEmailInstitucional = (email) => {
  if (typeof email !== "string") return false;
  const limpio = email.trim().toLowerCase();
  if (!limpio || !limpio.includes("@")) return false;
  return DOMINIOS_PERMITIDOS.some(
    (dominio) =>
      limpio.endsWith("@" + dominio) && limpio.length > dominio.length + 1
  );
};

export const autenticarEstudiante = async (req) => {
  const authHeader =
    req?.headers?.authorization || req?.headers?.Authorization || "";
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "Sesión requerida. Inicia sesión para continuar.",
    };
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      error: "Sesión requerida. Inicia sesión para continuar.",
    };
  }

  let appAdmin;
  try {
    appAdmin = obtenerAdmin();
  } catch (adminErr) {
    console.error(
      "[serverAuth] Error al inicializar firebase-admin (revisar variables de entorno):",
      adminErr?.code || adminErr?.message
    );
    return {
      ok: false,
      status: 401,
      error: "Tu sesión expiró o no es válida. Vuelve a iniciar sesión.",
    };
  }

  let decoded;
  try {
    decoded = await appAdmin.auth().verifyIdToken(idToken);
  } catch (err) {
    console.error(
      "[serverAuth] verifyIdToken falló:",
      err?.code || err?.message
    );
    return {
      ok: false,
      status: 401,
      error: "Tu sesión expiró o no es válida. Vuelve a iniciar sesión.",
    };
  }

  if (!decoded?.uid) {
    return {
      ok: false,
      status: 401,
      error: "Tu sesión no es válida. Vuelve a iniciar sesión.",
    };
  }

  if (decoded.email_verified !== true) {
    return {
      ok: false,
      status: 403,
      error: "Debes verificar tu correo institucional antes de realizar esta acción.",
    };
  }

  if (!esEmailInstitucional(decoded.email)) {
    return {
      ok: false,
      status: 403,
      error: "Solo se permiten cuentas con correo institucional autorizado.",
    };
  }

  return {
    ok: true,
    uid: decoded.uid,
    email: decoded.email.trim().toLowerCase(),
  };
};
