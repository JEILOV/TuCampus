// src/pages/Terminos.jsx
// ============================================================
//  TuCampus — Términos, Condiciones y Política de Privacidad
//  (Fase 5 · Legal y Compliance)
//
//  Página pública, accesible sin sesión iniciada. Estructurada
//  en dos bloques navegables por pestañas: "Términos de Servicio"
//  y "Política de Privacidad". Contenido pensado para ser legible
//  y escaneable (secciones cortas, íconos, sin bloques de texto
//  interminables).
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";

const ULTIMA_ACTUALIZACION = "8 de agosto de 2026";

// ── Sub-componente: bloque de sección con ícono ────────────────
const Seccion = ({ icono, titulo, children }) => (
  <div style={{
    background: "white", borderRadius: "16px",
    border: "1.5px solid #e8e8f0", padding: "16px 18px",
    marginBottom: "12px",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
      <span style={{ fontSize: "1.2rem" }}>{icono}</span>
      <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "var(--azul-oscuro)" }}>
        {titulo}
      </h3>
    </div>
    <div style={{ fontSize: "0.88rem", color: "#5c5c7a", fontWeight: 600, lineHeight: 1.6 }}>
      {children}
    </div>
  </div>
);

// ── Sub-componente: lista de puntos ────────────────────────────
const Lista = ({ items }) => (
  <ul style={{ margin: "8px 0 0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

// ── Bloque: Términos de Servicio ───────────────────────────────
const TerminosServicio = () => (
  <>
    <Seccion icono="🎓" titulo="1. Naturaleza del servicio">
      <p style={{ margin: 0 }}>
        TuCampus es una plataforma de libre conexión entre estudiantes de la Universidad
        Nacional de Piura (UNP) que desean comprar, vender u ofrecer productos y servicios
        dentro de la comunidad universitaria. No somos intermediarios financieros, no
        procesamos pagos directamente y no participamos en la negociación, entrega o
        cobro de ninguna transacción. Nuestro rol se limita a facilitar el contacto entre
        las partes.
      </p>
    </Seccion>

    <Seccion icono="🪪" titulo="2. Verificación de identidad institucional">
      <p style={{ margin: 0 }}>
        El acceso a TuCampus requiere autenticarse con un correo institucional del dominio{" "}
        <strong>@alumnos.unp.edu.pe</strong>. Esta verificación tiene como único fin
        confirmar que la persona usuaria pertenece a la comunidad estudiantil de la UNP y
        reducir el riesgo de cuentas falsas o ajenas a la universidad.
      </p>
    </Seccion>

    <Seccion icono="🚫" titulo="3. Conducta y contenido prohibido">
      <p style={{ margin: 0 }}>
        Está terminantemente prohibido publicar, ofrecer o promocionar dentro de la
        plataforma:
      </p>
      <Lista items={[
        "Productos ilícitos o cuya venta esté prohibida o restringida por ley.",
        "Servicios académicos no éticos, incluyendo suplantación de identidad en exámenes, elaboración de trabajos para entrega como propios (ghostwriting académico) o cualquier forma de fraude académico.",
        "Bebidas alcohólicas.",
        "Sustancias controladas o cualquier producto que represente un riesgo para la salud o la seguridad de la comunidad universitaria.",
      ]} />
      <p style={{ margin: "10px 0 0" }}>
        El incumplimiento de esta cláusula puede resultar en la eliminación de la
        publicación y la suspensión permanente de la cuenta, sin perjuicio de las
        responsabilidades legales que correspondan.
      </p>
    </Seccion>

    <Seccion icono="⚖️" titulo="4. Exención de responsabilidad">
      <p style={{ margin: 0 }}>
        La responsabilidad sobre la entrega, calidad, autenticidad, condiciones y
        cumplimiento de cualquier producto o servicio publicado recae exclusivamente en
        la persona compradora y vendedora involucradas en cada transacción. TuCampus no
        garantiza, avala ni se responsabiliza por el resultado de las negociaciones
        realizadas entre usuarios, ni por daños, pérdidas o conflictos derivados de
        ellas. Recomendamos siempre verificar la identidad de la otra parte y acordar los
        términos de forma clara antes de concretar cualquier intercambio.
      </p>
    </Seccion>

    <Seccion icono="🔧" titulo="5. Modificaciones del servicio">
      <p style={{ margin: 0 }}>
        Podemos actualizar, suspender o discontinuar funciones de la plataforma en
        cualquier momento, así como modificar estos Términos. Los cambios relevantes se
        reflejarán en esta misma página junto con su fecha de actualización.
      </p>
    </Seccion>
  </>
);

// ── Bloque: Política de Privacidad ─────────────────────────────
const PoliticaPrivacidad = () => (
  <>
    <Seccion icono="📧" titulo="1. Datos institucionales">
      <p style={{ margin: 0 }}>
        Usamos tu correo institucional (@alumnos.unp.edu.pe) únicamente para verificar tu
        pertenencia a la comunidad UNP y para identificarte dentro de la plataforma. No lo
        compartimos con terceros ajenos al servicio.
      </p>
    </Seccion>

    <Seccion icono="🔒" titulo="2. Números de contacto (WhatsApp, Yape, Plin)">
      <p style={{ margin: 0 }}>
        Tu número de WhatsApp y los datos asociados a Yape o Plin se almacenan en una
        subcolección privada de tu cuenta, independiente de tu perfil público. Estos
        datos:
      </p>
      <Lista items={[
        "Nunca se muestran como texto visible en tu perfil público ni en las tarjetas de tus publicaciones.",
        "Se usan exclusivamente para generar el enlace dinámico del botón \"Contactar por WhatsApp\" cuando otro estudiante decide escribirte.",
        "En tu perfil público solo se exhiben íconos o insignias indicando qué métodos de pago aceptas (por ejemplo, \"Acepta Yape\"), sin revelar ningún número.",
      ]} />
    </Seccion>

    <Seccion icono="🗂️" titulo="3. Qué información es pública">
      <p style={{ margin: 0 }}>
        Son visibles públicamente dentro de la plataforma: tu nombre, foto de perfil,
        carrera o título corto, biografía, ubicación aproximada, calificaciones y
        publicaciones activas. El resto de la información de tu cuenta permanece privada.
      </p>
    </Seccion>

    <Seccion icono="💬" titulo="4. Chats y mensajes">
      <p style={{ margin: 0 }}>
        Las conversaciones del chat interno solo son visibles para las personas
        participantes de cada conversación y se usan para coordinar la compra o venta de
        productos publicados en la plataforma.
      </p>
    </Seccion>

    <Seccion icono="🛡️" titulo="5. Seguridad y acceso">
      <p style={{ margin: 0 }}>
        El acceso a la subcolección privada de contacto está restringido a estudiantes
        autenticados con correo institucional verificado. No vendemos ni cedemos tus datos
        personales a terceros con fines comerciales.
      </p>
    </Seccion>

    <Seccion icono="✉️" titulo="6. Tus derechos">
      <p style={{ margin: 0 }}>
        Puedes actualizar o eliminar tu número de contacto en cualquier momento desde tu
        perfil, en la sección "Editar perfil". Si tienes dudas sobre el tratamiento de tus
        datos, puedes escribirnos a través de los canales de soporte de la plataforma.
      </p>
    </Seccion>
  </>
);

// ── Componente principal ────────────────────────────────────────
const Terminos = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState("terminos"); // "terminos" | "privacidad"

  return (
    <div className="app-shell" style={{ background: "var(--bg-crema)", minHeight: "100vh", paddingBottom: "40px" }}>

      {/* HEADER */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--azul-oscuro)", padding: "18px 16px",
        display: "flex", alignItems: "center", gap: "12px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
      }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", color: "white",
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "white" }}>
            Términos y Privacidad
          </h1>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
            Última actualización: {ULTIMA_ACTUALIZACION}
          </p>
        </div>
      </div>

      {/* PESTAÑAS */}
      <div style={{
        display: "flex", gap: "8px", padding: "16px 16px 4px",
        maxWidth: "560px", margin: "0 auto", boxSizing: "border-box",
      }}>
        <button
          onClick={() => setTab("terminos")}
          style={{
            flex: 1, padding: "11px 0", borderRadius: "12px", border: "none",
            cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            fontWeight: 800, fontSize: "0.86rem",
            background: tab === "terminos" ? "var(--verde-marca)" : "white",
            color: tab === "terminos" ? "white" : "#5c5c7a",
            boxShadow: tab === "terminos" ? "0 4px 12px rgba(46,107,78,0.25)" : "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          Términos de Servicio
        </button>
        <button
          onClick={() => setTab("privacidad")}
          style={{
            flex: 1, padding: "11px 0", borderRadius: "12px", border: "none",
            cursor: "pointer", fontFamily: "'Nunito', sans-serif",
            fontWeight: 800, fontSize: "0.86rem",
            background: tab === "privacidad" ? "var(--verde-marca)" : "white",
            color: tab === "privacidad" ? "white" : "#5c5c7a",
            boxShadow: tab === "privacidad" ? "0 4px 12px rgba(46,107,78,0.25)" : "0 2px 8px rgba(0,0,0,0.05)",
          }}
        >
          Política de Privacidad
        </button>
      </div>

      {/* CONTENIDO */}
      <div style={{ padding: "12px 16px 0", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box" }}>
        {tab === "terminos" ? <TerminosServicio /> : <PoliticaPrivacidad />}

        <p style={{
          textAlign: "center", fontSize: "0.78rem", color: "#a0a5b9",
          fontWeight: 600, margin: "8px 0 0", lineHeight: 1.5,
        }}>
          Al usar TuCampus confirmas que has leído y aceptas estos Términos de Servicio y
          nuestra Política de Privacidad.
        </p>
      </div>
    </div>
  );
};

export default Terminos;