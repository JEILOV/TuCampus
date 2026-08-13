// src/pages/Login.jsx
// ============================================================
//  TuCampus — Login
//
//  ANTES (problemas):
//    1. Tenía imports de doc/getDoc/setDoc pero los usaba
//       DUPLICANDO la lógica de obtenerOCrearPerfilUsuario().
//    2. Abría un onAuthStateChanged propio (listener extra).
//    3. Manipulaba localStorage directamente (fragilidad).
//    4. signOut/navigate estaban duplicados en Perfil.jsx.
//
//  AHORA:
//    - Solo dispara signInWithPopup() y valida el dominio.
//    - El AuthContext detecta el login via su onAuthStateChanged,
//      carga el perfil, fusiona favoritos y actualiza el estado.
//    - La redirección ocurre reactivamente: cuando user cambia
//      en AuthContext, el useEffect redirige al home.
//    - cerrarSesion y todo el localStorage están en AuthContext.
//
//  DISEÑO (Fase 1 — Design System + Login, migrado a Tailwind):
//    - Solo se tocó la capa visual. Cero cambios de lógica.
//    - Único método de login: Google (único provider real en el
//      código). No se agregan botones de Microsoft/Email porque
//      no hay lógica detrás y quedarían inutilizados.
//    - FIX 1: insignia UNP + texto quedaban corridos a la izquierda
//      por "ml-1.5" + "self-start" + falta de "justify-center".
//      Ahora el bloque se centra como conjunto dentro del contenedor.
//    - FIX 2: había un hueco vacío arriba y el footer/beneficios se
//      cortaban abajo. Se redujo el padding superior (pt-14 → pt-6)
//      y algunos márgenes internos para subir todo el contenido y
//      liberar espacio al final.
// ============================================================

import { useState, useEffect }       from "react";
import { useNavigate, Link }         from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { Zap, ShieldCheck, Smile, ArrowRight } from "lucide-react";
import { auth }                      from "../services/firebase";
import { useAuth }                   from "../context/AuthContext";
import { esCorreoInstitucionalValido } from "../config/universidades";

// Placeholders de imágenes — reemplazar por los archivos finales.
const LOGO_UNP     = "/assets/logo-unp-placeholder.png";
const MASCOTA_LOGIN = "/assets/mascota-placeholder.png";

// El provider se crea FUERA del componente: es un objeto estático,
// recrearlo en cada render no tiene sentido.
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ── Sub-componente Toast (rediseñado a Tailwind) ──────────────
const Toast = ({ mensaje }) => (
  <div className="flex items-center gap-2.5 rounded-btn bg-red-100 px-[18px] py-3.5 text-[13.5px] font-bold text-red-800 shadow-softLg">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="3" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
    {mensaje}
  </div>
);

// ── Componente principal ─────────────────────────────────────
const Login = () => {
  const navigate              = useNavigate();
  const { user, cargando }    = useAuth(); // ← consume el contexto
  const [enviando, setEnviando] = useState(false);
  const [toast,    setToast]    = useState(null);
  const [labelBtn, setLabelBtn] = useState("Iniciar sesión");

  // Redirección reactiva: solo redirige si el usuario es de la UNP
  useEffect(() => {
    if (!cargando && user && user.email?.endsWith(DOMINIO_PERMITIDO)) {
      navigate("/", { replace: true });
    }
  }, [user, cargando, navigate]);

  // Auto-dismiss del toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const handleGoogleLogin = async () => {
    if (enviando) return;
    setEnviando(true);
    setLabelBtn("Conectando...");

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user   = result.user;

      // Validación de dominio: único negocio que vive en Login
      // 🏫 Multicampus: acepta cualquier dominio institucional del
      // catálogo (UNP, UCV, UTP) — ver src/config/universidades.js.
      if (!esCorreoInstitucionalValido(user.email)) {
        await signOut(auth);
        setToast({ mensaje: "Acceso denegado: Usa tu correo institucional (UNP, UCV o UTP)" });
        setLabelBtn("Iniciar sesión");
        setEnviando(false);
        return;
      }

      // ✅ A partir de aquí: el onAuthStateChanged del AuthContext se dispara,
      //    carga el perfil de Firestore, fusiona favoritos y pone cargando=false.
      //    El useEffect de arriba detecta user != null y redirige.
      //    Login.jsx no necesita saber nada más.

    } catch (err) {
      console.error("[Login] Error de autenticación:", err);
      if (err.code !== "auth/popup-closed-by-user") {
        setToast({ mensaje: "Error de conexión. Inténtalo nuevamente." });
      }
      setLabelBtn("Iniciar sesión");
      setEnviando(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-between bg-primary px-6 pb-6 pt-6 font-sans">

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex w-full max-w-[350px] flex-1 flex-col items-center justify-center text-center">

        {/* INSIGNIA UNP — centrada como bloque (logo + texto) */}
        <div className="flex w-full items-center justify-center gap-2.5 text-center">
          <img
            src={LOGO_UNP}
            alt="Universidad Nacional de Piura"
            className="h-11 w-11 shrink-0 object-contain"
          />
          <p className="text-[11px] font-semibold leading-snug text-background/65">
            Desarrollado por estudiantes de la<br />Universidad Nacional de Piura
          </p>
        </div>

        {/* MASCOTA */}
        <img
          src={MASCOTA_LOGIN}
          alt="Mascota TuCampus"
          className="mt-4 h-[260px] w-[260px] object-contain"
        />

        {/* MARCA */}
        <h1 className="mt-2 text-[2.5rem] font-extrabold leading-none text-background">
          TuCampus
        </h1>
        <p className="mt-2 text-[15px] font-medium text-background/80">
          Conecta. Comparte. Crece.
        </p>

        {/* BOTÓN PRINCIPAL */}
        <button
          onClick={handleGoogleLogin}
          disabled={enviando}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-btn bg-background py-4 text-base font-bold text-primary shadow-softLg transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          <span>{labelBtn}</span>
          <ArrowRight size={18} strokeWidth={2.5} />
        </button>

        <p className="mt-6 flex items-center gap-1.5 text-xs font-medium text-background/60">
          <ShieldCheck size={14} />
          Tu información está segura con nosotros.
        </p>
      </div>

      {/* FOOTER — 3 beneficios */}
      <div className="mt-6 grid w-full max-w-[350px] grid-cols-3 divide-x divide-background/20 text-background/85">
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <Zap size={18} />
          <span className="text-[11px] font-semibold leading-tight">Publica en segundos</span>
        </div>
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <ShieldCheck size={18} />
          <span className="text-[11px] font-semibold leading-tight">Comunidad UNP</span>
        </div>
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <Smile size={18} />
          <span className="text-[11px] font-semibold leading-tight">Rápido, fácil y gratis</span>
        </div>
      </div>

      <footer className="mt-3 max-w-[300px] text-center text-[11px] leading-snug text-background/50">
        Al continuar aceptas registrarte con tu correo institucional y los{" "}
        <Link to="/terminos" className="underline">Términos y Privacidad</Link>.
      </footer>

      {/* TOAST DE ERROR */}
      {toast && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-[1000] w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2">
          <Toast mensaje={toast.mensaje} />
        </div>
      )}
    </div>
  );
};

export default Login;