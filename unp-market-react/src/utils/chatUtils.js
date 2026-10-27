// src/utils/chatUtils.js
// ============================================================
//  TuCampus — Utilidades del Chat
// ============================================================

// 🔒 S08: Trunca texto a 200 caracteres (con "…" si se cortó) y autorNombre a 100
// para cumplir con esRespondiendoAValido() en firestore.rules.
export const construirRespondiendoA = (mensajeRespondiendo, miUid, otroNombre) => {
  if (!mensajeRespondiendo) return null;
  const textoCrudo = mensajeRespondiendo.texto || (mensajeRespondiendo.imagen ? "📷 Imagen" : "");
  const texto = textoCrudo.length > 200 ? `${textoCrudo.slice(0, 199)}…` : textoCrudo;
  const nombreCrudo = mensajeRespondiendo.deUid === miUid
    ? "Tú"
    : (otroNombre || "Estudiante UNP");
  const autorNombre = nombreCrudo.slice(0, 100);
  return {
    id:          mensajeRespondiendo.id,
    texto,
    autorNombre,
  };
};
