// src/utils/errorHandler.js
// ============================================================
//  UNP Market — Manejador centralizado de errores
// ============================================================

const MENSAJES_FIREBASE = {
  // ── Auth ──────────────────────────────────────────────────
  "auth/popup-closed-by-user":    null,  // silencioso: el usuario canceló
  "auth/popup-blocked":           "Tu navegador bloqueó el popup. Permite popups para este sitio.",
  "auth/network-request-failed":  "Sin conexión. Revisa tu internet e intenta de nuevo.",
  "auth/too-many-requests":       "Demasiados intentos. Espera unos minutos antes de reintentar.",
  "auth/user-disabled":           "Esta cuenta fue deshabilitada. Contacta al administrador.",
  "auth/provider-already-linked": null,  // manejado explícitamente en Perfil.jsx

  // ── Firestore ─────────────────────────────────────────────
  "permission-denied":            "No tienes permiso para realizar esta acción.",
  "unavailable":                  "Sin conexión con el servidor. Intenta de nuevo.",
  "deadline-exceeded":            "La operación tardó demasiado. Intenta de nuevo.",
  "not-found":                    "El recurso solicitado no existe o fue eliminado.",
  "already-exists":               "Este registro ya existe.",
  "resource-exhausted":           "Límite de operaciones alcanzado. Intenta más tarde.",  // quota-exceeded
  "unauthenticated":              "Tu sesión expiró. Vuelve a iniciar sesión.",
  "cancelled":                    "La operación fue cancelada. Intenta de nuevo.",
  "data-loss":                    "Hubo un problema con los datos. Contacta al soporte.",

  // ── Storage ───────────────────────────────────────────────
  "storage/unauthorized":         "No tienes permiso para subir archivos.",
  "storage/quota-exceeded":       "Almacenamiento lleno. Contacta al administrador.",
  "storage/retry-limit-exceeded": "No se pudo subir la imagen. Revisa tu conexión.",
  "storage/invalid-format":       "El formato del archivo no es válido.",
  "storage/object-not-found":     "El archivo no existe o fue eliminado.",
};

const FALLBACKS = {
  auth:      "Error de autenticación. Intenta de nuevo.",
  firestore: "Error al conectar con la base de datos.",
  storage:   "Error al subir el archivo.",
  imgbb:     "No se pudo subir la imagen. Intenta de nuevo.",
  default:   "Algo salió mal. Intenta de nuevo.",
};

/**
 * Traduce un error de Firebase/ImgBB a un mensaje para el usuario.
 *
 * @param {Error}  error     El error capturado en el catch
 * @param {string} contexto  "auth" | "firestore" | "storage" | "imgbb"
 * @returns {string|null}    Mensaje para mostrar, o null si debe ser silencioso
 */
export const traducirError = (error, contexto = "default") => {
  const codigo = error?.code ?? "";

  if (codigo && codigo in MENSAJES_FIREBASE) {
    return MENSAJES_FIREBASE[codigo]; // puede ser null (error silencioso)
  }

  if (error?.message === "ImgBB rechazó la imagen") {
    return FALLBACKS.imgbb;
  }

  return FALLBACKS[contexto] ?? FALLBACKS.default;
};

/**
 * Loguea el error en consola con contexto.
 *
 * 🔧 Se loguea SIEMPRE, también en producción — no solo en DEV.
 * Antes tenía un guard `if (import.meta.env.DEV)` bajo el supuesto de
 * que "Vite elimina los console.error del bundle final en producción",
 * pero eso es falso para este proyecto: no hay `drop_console` ni config
 * de terser en vite.config.js, así que ese guard simplemente apagaba
 * TODO logging en producción sin que nada lo reemplazara. Resultado:
 * un error real de un usuario en el celular era invisible incluso
 * conectando el teléfono por USB y abriendo chrome://inspect — la
 * consola remota estaba vacía porque logError nunca llegaba a loguear
 * nada fuera de DEV. Sin visibilidad en producción no hay forma de
 * diagnosticar un bug que solo reproduce ahí.
 *
 * @param {string} origen  Ej: "[productService.crearProducto]"
 * @param {Error}  error
 */
export const logError = (origen, error) => {
  console.error(origen, error);
};