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
//
//  🔧 Refactor de estilo: esta página vivía con estilos inline y
//  CSS vars viejas (var(--azul-oscuro), var(--verde-marca), fuente
//  Nunito) mientras el resto de la app (Home, Publicar,
//  EditarProducto, Vendedor, Notificaciones, Perfil) ya había
//  migrado al Design System de Tailwind (bg-primary, text-ink,
//  bg-card, shadow-soft, rounded-btn/card, iconos lucide-react).
//  Se llevó al mismo patrón que Notificaciones.jsx (la otra página
//  "secundaria" de la app: back button simple + título + chips +
//  tarjetas), en vez del header azul alto de las páginas de acción
//  (Home/Publicar), que no encaja con contenido largo tipo legal.
//  La lógica (tabs, contenido) no cambió en absoluto.
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, GraduationCap, BadgeCheck, Ban, Scale, Settings2,
  Mail, Lock, Eye, MessageCircle, ShieldCheck, FileCheck2,
} from "lucide-react";

const ULTIMA_ACTUALIZACION = "8 de agosto de 2026";

// ── Sub-componente: bloque de sección con ícono ────────────────
// Mismo patrón visual que las tarjetas de Notificaciones.jsx:
// rounded-[24px] + bg-card + shadow-soft, con un círculo de ícono
// a la izquierda del título.
const Seccion = ({ Icono, titulo, children }) => (
  <div className="rounded-[24px] bg-card p-5 shadow-soft">
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icono size={19} strokeWidth={2.3} />
      </span>
      <h3 className="text-[15px] font-extrabold text-ink">{titulo}</h3>
    </div>
    <div className="mt-3 text-[13.5px] font-semibold leading-relaxed text-ink/70">
      {children}
    </div>
  </div>
);

// ── Sub-componente: lista de puntos ────────────────────────────
const Lista = ({ items }) => (
  <ul className="mt-2.5 flex list-disc flex-col gap-2 pl-5 marker:text-primary/50">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

// ── Bloque: Términos de Servicio ───────────────────────────────
const TerminosServicio = () => (
  <>
    <Seccion Icono={GraduationCap} titulo="1. Naturaleza del servicio">
      <p className="m-0">
        TuCampus es una plataforma de libre conexión entre estudiantes de la Universidad
        Nacional de Piura (UNP) que desean comprar, vender u ofrecer productos y servicios
        dentro de la comunidad universitaria. No somos intermediarios financieros, no
        procesamos pagos directamente y no participamos en la negociación, entrega o
        cobro de ninguna transacción. Nuestro rol se limita a facilitar el contacto entre
        las partes.
      </p>
    </Seccion>

    <Seccion Icono={BadgeCheck} titulo="2. Verificación de identidad institucional">
      <p className="m-0">
        El acceso a TuCampus requiere autenticarse con un correo institucional del dominio{" "}
        <strong className="font-extrabold text-ink">@alumnos.unp.edu.pe</strong>. Esta
        verificación tiene como único fin confirmar que la persona usuaria pertenece a la
        comunidad estudiantil de la UNP y reducir el riesgo de cuentas falsas o ajenas a
        la universidad.
      </p>
    </Seccion>

    <Seccion Icono={Ban} titulo="3. Conducta y contenido prohibido">
      <p className="m-0">
        Está terminantemente prohibido publicar, ofrecer o promocionar dentro de la
        plataforma:
      </p>
      <Lista items={[
        "Productos ilícitos o cuya venta esté prohibida o restringida por ley.",
        "Servicios académicos no éticos, incluyendo suplantación de identidad en exámenes, elaboración de trabajos para entrega como propios (ghostwriting académico) o cualquier forma de fraude académico.",
        "Bebidas alcohólicas.",
        "Sustancias controladas o cualquier producto que represente un riesgo para la salud o la seguridad de la comunidad universitaria.",
      ]} />
      <p className="m-0 mt-2.5">
        El incumplimiento de esta cláusula puede resultar en la eliminación de la
        publicación y la suspensión permanente de la cuenta, sin perjuicio de las
        responsabilidades legales que correspondan.
      </p>
    </Seccion>

    <Seccion Icono={Scale} titulo="4. Exención de responsabilidad">
      <p className="m-0">
        La responsabilidad sobre la entrega, calidad, autenticidad, condiciones y
        cumplimiento de cualquier producto o servicio publicado recae exclusivamente en
        la persona compradora y vendedora involucradas en cada transacción. TuCampus no
        garantiza, avala ni se responsabiliza por el resultado de las negociaciones
        realizadas entre usuarios, ni por daños, pérdidas o conflictos derivados de
        ellas. Recomendamos siempre verificar la identidad de la otra parte y acordar los
        términos de forma clara antes de concretar cualquier intercambio.
      </p>
    </Seccion>

    <Seccion Icono={Settings2} titulo="5. Modificaciones del servicio">
      <p className="m-0">
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
    <Seccion Icono={Mail} titulo="1. Datos institucionales">
      <p className="m-0">
        Usamos tu correo institucional (@alumnos.unp.edu.pe) únicamente para verificar tu
        pertenencia a la comunidad UNP y para identificarte dentro de la plataforma. No lo
        compartimos con terceros ajenos al servicio.
      </p>
    </Seccion>

    <Seccion Icono={Lock} titulo="2. Números de contacto (WhatsApp, Yape, Plin)">
      <p className="m-0">
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

    <Seccion Icono={Eye} titulo="3. Qué información es pública">
      <p className="m-0">
        Son visibles públicamente dentro de la plataforma: tu nombre, foto de perfil,
        carrera o título corto, biografía, ubicación aproximada, calificaciones y
        publicaciones activas. El resto de la información de tu cuenta permanece privada.
      </p>
    </Seccion>

    <Seccion Icono={MessageCircle} titulo="4. Chats y mensajes">
      <p className="m-0">
        Las conversaciones del chat interno solo son visibles para las personas
        participantes de cada conversación y se usan para coordinar la compra o venta de
        productos publicados en la plataforma.
      </p>
    </Seccion>

    <Seccion Icono={ShieldCheck} titulo="5. Seguridad y acceso">
      <p className="m-0">
        El acceso a la subcolección privada de contacto está restringido a estudiantes
        autenticados con correo institucional verificado. No vendemos ni cedemos tus datos
        personales a terceros con fines comerciales.
      </p>
    </Seccion>

    <Seccion Icono={FileCheck2} titulo="6. Tus derechos">
      <p className="m-0">
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
    <div className="app-shell bg-background pb-10 font-sans">

      {/* ════════════════════════════════════════════════════
             HEADER — back button + título (mismo patrón que
             Notificaciones.jsx: página secundaria, sin banner azul)
        ════════════════════════════════════════════════════ */}
      <div className="px-5 pt-6">
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-soft"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="mt-5">
          <h1 className="text-[26px] font-extrabold leading-tight text-ink">
            Términos y Privacidad
          </h1>
          <p className="mt-1 text-[13.5px] font-semibold text-ink/40">
            Última actualización: {ULTIMA_ACTUALIZACION}
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════
             PESTAÑAS — mismo estilo chip que los filtros de
             Notificaciones.jsx, a ancho completo (son solo 2)
        ════════════════════════════════════════════════════ */}
      <div className="mt-5 flex gap-2.5 px-5">
        <button
          onClick={() => setTab("terminos")}
          className={`flex-1 rounded-full px-4 py-3 text-[13px] font-extrabold transition-colors ${
            tab === "terminos"
              ? "bg-[#287653] text-white shadow-soft"
              : "border-[1.5px] border-ink/10 bg-card text-ink/60"
          }`}
        >
          Términos de Servicio
        </button>
        <button
          onClick={() => setTab("privacidad")}
          className={`flex-1 rounded-full px-4 py-3 text-[13px] font-extrabold transition-colors ${
            tab === "privacidad"
              ? "bg-[#287653] text-white shadow-soft"
              : "border-[1.5px] border-ink/10 bg-card text-ink/60"
          }`}
        >
          Política de Privacidad
        </button>
      </div>

      {/* ════════════════════════════════════════════════════
             CONTENIDO
        ════════════════════════════════════════════════════ */}
      <section className="mt-4 flex flex-col gap-3 px-5">
        {tab === "terminos" ? <TerminosServicio /> : <PoliticaPrivacidad />}

        <p className="m-0 mt-2 text-center text-[12.5px] font-semibold leading-relaxed text-ink/40">
          Al usar TuCampus confirmas que has leído y aceptas estos Términos de Servicio y
          nuestra Política de Privacidad.
        </p>
      </section>
    </div>
  );
};

export default Terminos;