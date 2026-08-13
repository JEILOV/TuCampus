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
//    - Solo se tocó la capa visual. Cero cambios de lógica preexistente.
//    - Dos vías de acceso: Google (OAuth) y Correo institucional +
//      Contraseña con verificación por email. Se descartó el botón de
//      Microsoft/Outlook: Azure Entra bloqueó la creación de la App
//      Registration por falta de directorio corporativo/tarjeta, así
//      que UTP y cualquier otra sede sin OAuth propio usan el flujo
//      de Email/Password (Firebase lo soporta nativo, sin depender
//      de ningún proveedor externo).
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
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { Zap, ShieldCheck, Smile, ArrowRight, Mail, ArrowLeft } from "lucide-react";
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

  // ── Email + Contraseña ────────────────────────────────────
  // modoAuth: 'social' (Google) | 'email' (correo institucional + contraseña)
  // modoEmail: dentro de 'email', si el usuario quiere 'login' o 'registro'
  const [modoAuth,     setModoAuth]     = useState("social");
  const [modoEmail,    setModoEmail]    = useState("login");
  const [formEmail,    setFormEmail]    = useState("");
  const [formPassword, setFormPassword] = useState("");

  // Redirección reactiva: solo redirige si el usuario es de un
  // dominio institucional soportado (UNP, UCV o UTP) Y tiene el
  // correo verificado. Google ya llega con emailVerified=true;
  // para Email/Password, handleEmailSubmit se encarga de cerrar
  // la sesión si aún no verificó, así que este check es un
  // segundo candado, no el único.
  // 🏫 Multicampus: reemplaza al viejo `DOMINIO_PERMITIDO` (constante
  // hardcodeada a un único dominio UNP que ya no existe) por la
  // misma validación multicampus que usan los handlers más abajo.
  useEffect(() => {
    if (!cargando && user && esCorreoInstitucionalValido(user.email) && user.emailVerified) {
      navigate("/", { replace: true });
    }
  }, [user, cargando, navigate]);

  // Auto-dismiss del toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Wrapper de signInWithPopup: valida el dominio institucional y deja
  // que el onAuthStateChanged del AuthContext haga el resto (perfil,
  // favoritos, redirección reactiva). Queda parametrizado por provider
  // para poder reutilizarse si en el futuro se suma otro OAuth (ej. si
  // Azure Entra desbloquea la App Registration de Microsoft más adelante).
  const iniciarSesionCon = async (provider, labelConectando) => {
    if (enviando) return;
    setEnviando(true);
    setLabelBtn(labelConectando);

    try {
      const result = await signInWithPopup(auth, provider);
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

  const handleGoogleLogin = () => iniciarSesionCon(googleProvider, "Conectando...");

  // Cambia entre 'login' y 'registro' dentro del modo email, limpiando
  // el estado para que no arrastre errores/valores del otro sub-modo.
  const cambiarModoEmail = (nuevoModo) => {
    setModoEmail(nuevoModo);
    setToast(null);
  };

  const volverAOpcionesSociales = () => {
    setModoAuth("social");
    setFormEmail("");
    setFormPassword("");
    setToast(null);
  };

  // Registro/login con correo institucional + contraseña.
  // Reglas de negocio:
  //   1. El correo debe pertenecer a un dominio soportado (UNP/UCV/UTP).
  //   2. Al REGISTRARSE: se crea el usuario, se dispara sendEmailVerification()
  //      y se cierra la sesión de inmediato — no lo dejamos entrar hasta
  //      que confirme el correo desde su bandeja (Gmail/Outlook/etc.).
  //      obtenerOCrearPerfilUsuario() se ejecuta solo por el
  //      onAuthStateChanged de AuthContext (ver nota debajo del componente):
  //      no hace falta llamarlo aquí a mano.
  //   3. Al INICIAR SESIÓN: si emailVerified es false, lo expulsamos con
  //      un mensaje claro en vez de dejarlo pasar a medias.
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;

    const emailLimpio = formEmail.trim().toLowerCase();

    if (!esCorreoInstitucionalValido(emailLimpio)) {
      setToast({ mensaje: "Ingresa tu correo institucional (UNP, UCV o UTP)" });
      return;
    }
    if (formPassword.length < 6) {
      setToast({ mensaje: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }

    setEnviando(true);

    try {
      if (modoEmail === "registro") {
        const cred = await createUserWithEmailAndPassword(auth, emailLimpio, formPassword);
        await sendEmailVerification(cred.user);
        await signOut(auth); // Obligamos a verificar antes de dejarlo entrar

        setToast({ mensaje: "Cuenta creada. Revisa tu correo y verifica tu cuenta para poder ingresar." });
        setModoEmail("login");
        setFormPassword("");
      } else {
        const cred = await signInWithEmailAndPassword(auth, emailLimpio, formPassword);

        if (!cred.user.emailVerified) {
          await signOut(auth);
          setToast({ mensaje: "Debes verificar tu correo antes de ingresar. Revisa tu bandeja de entrada." });
          setEnviando(false);
          return;
        }

        // ✅ A partir de aquí: el onAuthStateChanged del AuthContext se dispara,
        //    carga el perfil de Firestore, fusiona favoritos y pone cargando=false.
        //    El useEffect de arriba detecta user != null + emailVerified y redirige.
      }
    } catch (err) {
      console.error("[Login] Error de autenticación por correo:", err);
      let mensaje = "Error de conexión. Inténtalo nuevamente.";
      if (err.code === "auth/email-already-in-use") {
        mensaje = "Ese correo ya está registrado. Intenta iniciar sesión.";
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        mensaje = "Correo o contraseña incorrectos.";
      } else if (err.code === "auth/user-not-found") {
        mensaje = "No existe una cuenta con ese correo. Regístrate primero.";
      } else if (err.code === "auth/weak-password") {
        mensaje = "La contraseña es muy débil (mínimo 6 caracteres).";
      } else if (err.code === "auth/too-many-requests") {
        mensaje = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
      }
      setToast({ mensaje });
    } finally {
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

        {modoAuth === "social" ? (
          <>
            {/* BOTÓN PRINCIPAL — Google */}
            <button
              onClick={handleGoogleLogin}
              disabled={enviando}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-btn bg-background py-4 text-base font-bold text-primary shadow-softLg transition-transform active:scale-[0.98] disabled:opacity-70"
            >
              <span>{labelBtn}</span>
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>

            {/* BOTÓN SECUNDARIO — abre el formulario de correo institucional */}
            <button
              onClick={() => setModoAuth("email")}
              disabled={enviando}
              className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-btn border border-background/25 bg-transparent py-4 text-base font-bold text-background shadow-none transition-transform active:scale-[0.98] disabled:opacity-70"
            >
              <Mail size={18} strokeWidth={2.5} />
              <span>Ingresar con correo institucional</span>
            </button>

            <p className="mt-3 px-2 text-[11px] font-medium leading-snug text-background/60">
              Alumnos UTP / Otros campus: pueden registrarse e ingresar con su
              correo institucional (@utp.edu.pe) y contraseña.
            </p>
          </>
        ) : (
          <>
            {/* FORMULARIO — Correo institucional + contraseña */}
            <form onSubmit={handleEmailSubmit} className="mt-8 flex w-full flex-col gap-3">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Correo institucional (@utp.edu.pe, etc.)"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={enviando}
                className="w-full rounded-btn bg-background/95 px-4 py-3.5 text-sm font-semibold text-primary placeholder:text-primary/40 outline-none disabled:opacity-70"
              />
              <input
                type="password"
                autoComplete={modoEmail === "registro" ? "new-password" : "current-password"}
                placeholder="Contraseña"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                disabled={enviando}
                className="w-full rounded-btn bg-background/95 px-4 py-3.5 text-sm font-semibold text-primary placeholder:text-primary/40 outline-none disabled:opacity-70"
              />

              <button
                type="submit"
                disabled={enviando}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-btn bg-background py-4 text-base font-bold text-primary shadow-softLg transition-transform active:scale-[0.98] disabled:opacity-70"
              >
                <span>
                  {enviando
                    ? "Procesando..."
                    : modoEmail === "registro" ? "Registrarme" : "Iniciar sesión"}
                </span>
                <ArrowRight size={18} strokeWidth={2.5} />
              </button>
            </form>

            <p className="mt-3 px-2 text-[11px] font-medium leading-snug text-background/60">
              Alumnos UTP / Otros campus: pueden registrarse e ingresar con su
              correo institucional (@utp.edu.pe) y contraseña.
            </p>

            {/* Alternar entre login y registro */}
            <button
              onClick={() => cambiarModoEmail(modoEmail === "registro" ? "login" : "registro")}
              disabled={enviando}
              className="mt-3 text-xs font-bold text-background/85 underline underline-offset-2"
            >
              {modoEmail === "registro"
                ? "¿Ya tienes cuenta? Inicia sesión"
                : "¿No tienes cuenta? Regístrate"}
            </button>

            {/* Volver a Google */}
            <button
              onClick={volverAOpcionesSociales}
              disabled={enviando}
              className="mt-4 flex items-center gap-1.5 text-xs font-medium text-background/60"
            >
              <ArrowLeft size={13} />
              Volver a las opciones de acceso
            </button>
          </>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-background/60">
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
          <span className="text-[11px] font-semibold leading-tight">Comunidades Universitarias</span>
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