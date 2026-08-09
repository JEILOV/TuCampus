// src/components/MenuChat.jsx
// ============================================================
//  TuCampus — Menú de opciones del chat (Fase 6 · Chat Avanzado)
//
//  Dropdown que se abre desde el ⋮ del header de Chat.jsx.
//  Dos acciones, nada de editar/borrar mensajes (eso queda afuera
//  a propósito: los mensajes son evidencia de acuerdos de compra
//  y venta, no deben poder alterarse ni desaparecer).
//
//    · Bloquear / Desbloquear usuario  → userService.bloquearUsuario
//    · Ocultar chat                    → chatService.ocultarChat
//
//  No sabe nada de Firestore: solo dispara los callbacks que le
//  pasa Chat.jsx y se cierra sola al elegir una opción o al
//  tocar afuera (overlay transparente en position:fixed).
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