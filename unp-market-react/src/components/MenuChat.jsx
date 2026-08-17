// src/components/MenuChat.jsx
// ============================================================
//  TuCampus — Menús contextuales del chat (Fase 6 + Fase 8)
//
//  Dos componentes en este archivo, ambos reusan <ItemMenu>:
//
//  1) MenuChat (default export) — dropdown del ⋮ en el header:
//       · Bloquear / Desbloquear usuario → userService.bloquearUsuario
//       · Ocultar chat                   → chatService.ocultarChat
//
//  2) MenuMensaje (named export) — Fase 8 · menú contextual de UN
//     mensaje puntual, se abre con mantener presionado (long-press
//     táctil) o click derecho sobre una burbuja (ver Burbuja en
//     Chat.jsx). Se posiciona en las coordenadas exactas del gesto:
//       · Responder   → precarga la cita (mismo flujo que el botón
//                        de responder que ya tenía cada burbuja)
//       · Editar mensaje → solo si el mensaje es propio y es de texto
//       · Copiar texto   → clipboard, solo si el mensaje es de texto
//     Cada acción es opcional (si el padre no pasa el callback, esa
//     fila directamente no se muestra) — así Chat.jsx decide caso a
//     caso qué opciones tienen sentido (ej. no se puede editar un
//     mensaje ajeno, no se puede responder si la conversación está
//     bloqueada).
//
//  Ninguno de los dos sabe nada de Firestore: solo disparan los
//  callbacks que les pasa Chat.jsx y se cierran solos al elegir una
//  opción o al tocar afuera (overlay transparente en position:fixed).
// ============================================================

const ItemMenu = ({ icono, children, color = "var(--azul-oscuro)", onClick, ultimo = false }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: "10px",
      width: "100%", padding: "13px 16px",
      background: "white", border: "none",
      borderBottom: ultimo ? "none" : "1px solid #f1f3f5",
      cursor: "pointer", textAlign: "left",
      fontFamily: "'Nunito', sans-serif", fontSize: "0.88rem", fontWeight: 700,
      color,
    }}
  >
    <span style={{ fontSize: "1rem", lineHeight: 1 }}>{icono}</span>
    {children}
  </button>
);

/**
 * @param {Object} props
 * @param {boolean} props.abierto
 * @param {() => void} props.onCerrar
 * @param {boolean} props.bloqueado        Si yo ya bloqueé a esta persona.
 * @param {() => void} props.onBloquear
 * @param {() => void} props.onDesbloquear
 * @param {() => void} props.onOcultar
 */
const MenuChat = ({ abierto, onCerrar, bloqueado, onBloquear, onDesbloquear, onOcultar }) => {
  if (!abierto) return null;

  return (
    <>
      {/* Overlay invisible: cualquier click afuera cierra el menú */}
      <div onClick={onCerrar} style={{ position: "fixed", inset: 0, zIndex: 150 }} />

      <div
        role="menu"
        style={{
          position: "absolute", top: "100%", right: "12px", marginTop: "6px",
          zIndex: 151, background: "white", borderRadius: "14px",
          boxShadow: "0 10px 30px rgba(15,37,64,0.18)",
          minWidth: "210px", overflow: "hidden",
        }}
      >
        {bloqueado ? (
          <ItemMenu icono="🔓" color="var(--verde-marca)" onClick={onDesbloquear}>
            Desbloquear usuario
          </ItemMenu>
        ) : (
          <ItemMenu icono="🚫" color="#dc2626" onClick={onBloquear}>
            Bloquear usuario
          </ItemMenu>
        )}
        <ItemMenu icono="🗑️" onClick={onOcultar} ultimo>
          Ocultar chat
        </ItemMenu>
      </div>
    </>
  );
};

export default MenuChat;

// ── Menú contextual de un mensaje (Fase 8) ────────────────────
/**
 * @param {Object} props
 * @param {Object|null} props.mensaje   El mensaje sobre el que se abrió el menú (o null = cerrado).
 * @param {{x: number, y: number}|null} props.posicion  Coordenadas del gesto (long-press/click derecho).
 * @param {() => void} props.onCerrar
 * @param {(mensaje: Object) => void} [props.onResponder]  Omitir para ocultar la opción.
 * @param {(mensaje: Object) => void} [props.onEditar]     Omitir para ocultar la opción (ej. mensaje ajeno o de imagen).
 * @param {(mensaje: Object) => void} [props.onCopiar]     Omitir para ocultar la opción.
 */
export const MenuMensaje = ({ mensaje, posicion, onCerrar, onResponder, onEditar, onCopiar }) => {
  if (!mensaje || !posicion) return null;

  const items = [
    onResponder && { icono: "↩️", label: "Responder",       onClick: () => onResponder(mensaje) },
    onEditar    && { icono: "✏️", label: "Editar mensaje",  onClick: () => onEditar(mensaje) },
    onCopiar    && { icono: "📋", label: "Copiar texto",    onClick: () => onCopiar(mensaje) },
  ].filter(Boolean);

  if (items.length === 0) return null;

  // Clamp dentro del viewport: el gesto puede haber ocurrido cerca de
  // cualquier borde de la pantalla (mensaje al fondo, al costado, etc.)
  const ANCHO_MENU = 190;
  const ALTO_ITEM  = 46;
  const vw = typeof window !== "undefined" ? window.innerWidth  : posicion.x + ANCHO_MENU + 20;
  const vh = typeof window !== "undefined" ? window.innerHeight : posicion.y + items.length * ALTO_ITEM + 20;
  const left = Math.max(10, Math.min(posicion.x, vw - ANCHO_MENU - 10));
  const top  = Math.max(10, Math.min(posicion.y, vh - items.length * ALTO_ITEM - 10));

  return (
    <>
      <div onClick={onCerrar} style={{ position: "fixed", inset: 0, zIndex: 150 }} />

      <div
        role="menu"
        style={{
          position: "fixed", top, left,
          zIndex: 151, background: "white", borderRadius: "14px",
          boxShadow: "0 10px 30px rgba(15,37,64,0.18)",
          minWidth: `${ANCHO_MENU}px`, overflow: "hidden",
        }}
      >
        {items.map((item, i) => (
          <ItemMenu
            key={item.label}
            icono={item.icono}
            onClick={() => { item.onClick(); onCerrar(); }}
            ultimo={i === items.length - 1}
          >
            {item.label}
          </ItemMenu>
        ))}
      </div>
    </>
  );
};