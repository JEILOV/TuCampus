// src/pages/Login.jsx
// ============================================================
//  UNP Market — Login
//
//  Migra login.html conservando diseño pixel-perfect:
//    - signInWithPopup con GoogleAuthProvider
//    - prompt: "select_account" para forzar selector de cuenta
//    - Validación de dominio @alumnos.unp.edu.pe (+ signOut si falla)
//    - Creación/lectura del perfil en Firestore (colección "usuarios")
//    - Caché localStorage (solo UI, no seguridad)
//    - Redirección SPA con useNavigate → "/"
//    - Estado "cargando" para deshabilitar el botón y animar el label
//    - Redirige a "/" sin tocar Login si ya hay sesión activa
// ============================================================

import { useState, useEffect }         from "react";
import { useNavigate }                 from "react-router-dom";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc }         from "firebase/firestore";
import { db, auth }                    from "../services/firebase";

// ──────────────────────────────────────────────────────────────
//  CONSTANTES
// ──────────────────────────────────────────────────────────────
const DOMINIO_PERMITIDO  = "@alumnos.unp.edu.pe";
const LOGO_UNP           = "https://i.ibb.co/CGgVsvN/Escudo-Universidad-Nacional-de-Piura.png";
const ILUSTRACION_CAMPUS = "https://i.ibb.co/qLmxNQTz/Chat-GPT-Image-16-may-2026-04-32-51-a-m.png";

// GoogleAuthProvider reutilizable (se configura una sola vez fuera del componente)
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// ──────────────────────────────────────────────────────────────
//  COMPONENTE
// ──────────────────────────────────────────────────────────────
const Login = () => {
  const navigate = useNavigate();

  const [cargando,    setCargando]    = useState(false);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [labelBtn,    setLabelBtn]    = useState("Continuar con correo institucional");

  // ── Si ya hay sesión activa, ir directo al Home ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) navigate("/", { replace: true });
    });
    return () => unsub();
  }, [navigate]);

  // ──────────────────────────────────────────────────────────────
  //  Handler: click en botón Google
  // ──────────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    if (cargando) return;

    // Limpieza preventiva de caché de sesión anterior
    ["unp_user_profile", "listaFavoritos",
     "mostrarToastPublicar", "productoSeleccionado"
    ].forEach((k) => localStorage.removeItem(k));

    setCargando(true);
    setErrorMsg("");
    setLabelBtn("Conectando");

    try {
      const result = await signInWithPopup(auth, provider);
      const user   = result.user;

      // ── Validación de dominio (primera capa) ──────────────────
      // La segunda capa son las Firestore Security Rules, que validan
      // request.auth.token.email en el servidor.
      if (!user.email.endsWith(DOMINIO_PERMITIDO)) {
        await signOut(auth);                    // revoca la sesión inmediatamente
        setErrorMsg(
          `Acceso exclusivo para la comunidad UNP.\n` +
          `Por favor inicia sesión con tu correo ${DOMINIO_PERMITIDO}`
        );
        setLabelBtn("Continuar con correo institucional");
        setCargando(false);
        return;
      }

      // ── Lectura / creación del perfil en Firestore ────────────
      const userRef  = doc(db, "usuarios", user.uid);
      const userSnap = await getDoc(userRef);

      let profileData = {
        uid:       user.uid,
        nombre:    user.displayName || "Estudiante UNP",
        email:     user.email,
        avatar:    user.photoURL    || "",
        ubicacion: "Piura",
        bio:       "Estudiante de la UNP",
        acercaDe:  "¡Hola! Bienvenido a mi tienda en el campus.",
        telefono:  "",
      };

      if (!userSnap.exists()) {
        // Primera vez: crea el documento base
        await setDoc(userRef, profileData);
      } else {
        // Ya existe: los datos de Firestore tienen prioridad
        profileData = { ...profileData, ...userSnap.data() };
      }

      // Caché local SOLO para velocidad de UI (nombre/avatar sin esperar a Firestore)
      localStorage.setItem("unp_user_profile", JSON.stringify(profileData));
      localStorage.setItem(
        "listaFavoritos",
        JSON.stringify(userSnap.exists() ? (userSnap.data().favoritos || []) : [])
      );

      // ── Navegación SPA sin recarga ────────────────────────────
      navigate("/", { replace: true });

    } catch (err) {
      console.error("Error de login:", err);

      if (err.code !== "auth/popup-closed-by-user") {
        setErrorMsg("Error de conexión. Inténtalo nuevamente.");
      }
      setLabelBtn("Continuar con correo institucional");
      setCargando(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Estilos idénticos al login.html original ── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --navy:        var(--azul-oscuro);
          --green:       var(--verde-marca);
          --text-mid:    #5c5c7a;
          --text-light:  #a0a0b8;
          --bg:          #f4f6f9;
          --white:       #ffffff;
          --border:      #e8e8f0;
          --shadow-card: 0 10px 40px rgba(0,0,0,.06), 0 2px 12px rgba(0,0,0,.04);
          --radius-card: 30px;
          --font:        'Nunito', sans-serif;
        }
        html, body {
          height: 100%;
          font-family: var(--font);
          background: var(--bg);
          -webkit-font-smoothing: antialiased;
        }
        body::before {
          content: ''; position: fixed; inset: 0;
          background-image:
            radial-gradient(circle at 15% 20%, rgba(58,125,68,.08) 0%, transparent 50%),
            radial-gradient(circle at 85% 80%, rgba(26,26,46,.06) 0%, transparent 50%);
          pointer-events: none; z-index: 0;
        }
        .login-page {
          position: relative; z-index: 1;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          min-height: 100vh; padding: 32px 20px 24px;
        }
        .login-shell {
          width: 100%; max-width: 480px;
          display: flex; flex-direction: column; align-items: center;
        }
        /* Header */
        .login-header {
          display: flex; flex-direction: column;
          align-items: center; gap: 12px; margin-bottom: 28px;
        }
        .login-logo {
          width: 68px; height: 68px; border-radius: 50%;
          object-fit: contain; border: 3px solid var(--white);
          box-shadow: 0 4px 20px rgba(26,26,46,.18);
          background: white; padding: 4px;
        }
        .login-title {
          font-size: 34px; font-weight: 900; color: var(--navy);
          letter-spacing: -1px; line-height: 1;
        }
        .login-title em { font-style: normal; color: var(--green); }
        .login-subtitle {
          font-size: 15px; font-weight: 600; color: var(--text-mid); letter-spacing: .1px;
        }
        /* Card */
        .login-card {
          width: 100%; background: var(--white);
          border-radius: var(--radius-card); box-shadow: var(--shadow-card);
          padding: 28px 28px 32px;
          display: flex; flex-direction: column; align-items: center;
          border: 1px solid rgba(232,232,240,.8);
        }
        /* Ilustración */
        .login-illustration-wrap {
          width: 100%; height: 200px; border-radius: 18px;
          overflow: hidden; margin-bottom: 26px;
          background: #e8ecf4; position: relative;
        }
        .login-illustration {
          width: 100%; height: 100%; object-fit: cover;
          display: block; border-radius: 18px;
        }
        /* Textos */
        .login-card-title {
          font-size: 22px; font-weight: 800; color: var(--navy);
          text-align: center; letter-spacing: -.4px; line-height: 1.25;
          margin-bottom: 10px;
        }
        .login-card-body {
          font-size: 14px; font-weight: 600; color: var(--text-mid);
          text-align: center; line-height: 1.65; max-width: 300px;
          margin-bottom: 28px;
        }
        /* Botón Google */
        .btn-google {
          display: flex; align-items: center; justify-content: center;
          gap: 12px; width: 100%; padding: 15px 24px;
          background: var(--white); border: 1.5px solid var(--border);
          border-radius: 50px; font-family: var(--font);
          font-size: 15.5px; font-weight: 800; color: var(--navy);
          cursor: pointer; letter-spacing: -.1px;
          box-shadow: 0 2px 8px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.05);
          transition: transform .18s ease, box-shadow .18s ease, border-color .15s;
          position: relative; overflow: hidden;
        }
        .btn-google:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,.12);
          border-color: #c8c8d8;
        }
        .btn-google:active:not(:disabled) { transform: scale(.97); }
        .btn-google:disabled { opacity: .72; cursor: not-allowed; }
        .google-icon { width: 22px; height: 22px; flex-shrink: 0; }
        /* Features */
        .login-features {
          display: flex; gap: 8px; justify-content: center;
          flex-wrap: wrap; margin-top: 24px; width: 100%;
        }
        .feature-chip {
          display: flex; align-items: center; gap: 5px;
          background: #f0f7f2; border: 1px solid rgba(58,125,68,.15);
          border-radius: 20px; padding: 5px 11px;
          font-size: 11px; font-weight: 700; color: var(--green);
        }
        /* Error */
        .login-error {
          width: 100%; margin-top: 16px; padding: 12px 16px;
          background: #fef2f2; border: 1.5px solid #fecaca;
          border-radius: 14px; font-size: 13px; font-weight: 700;
          color: #dc2626; text-align: center; white-space: pre-line;
          line-height: 1.5;
        }
        /* Footer */
        .login-footer {
          margin-top: 20px; padding: 0 8px;
          font-size: 11px; font-weight: 600;
          color: var(--text-light); text-align: center; line-height: 1.6;
        }
        .login-footer a { color: var(--green); text-decoration: none; font-weight: 700; }
        /* Spinner dot animation en el label */
        @keyframes dotPulse {
          0%   { content: '.'; }
          33%  { content: '..'; }
          66%  { content: '...'; }
          100% { content: '.'; }
        }
        .btn-label-loading::after {
          content: '.';
          animation: dotPulse 1s steps(3, end) infinite;
        }
      `}</style>

      <div className="login-page">
        <div className="login-shell">

          {/* HEADER */}
          <header className="login-header">
            <img
              src={LOGO_UNP}
              alt="Logo UNP Market"
              className="login-logo"
              width="68" height="68"
            />
            <h1 className="login-title">
              UNP <em>Market</em>
            </h1>
            <p className="login-subtitle">El mercado oficial de tu campus</p>
          </header>

          {/* CARD */}
          <div className="login-card">

            {/* Ilustración campus */}
            <div className="login-illustration-wrap">
              <img
                src={ILUSTRACION_CAMPUS}
                alt="Ilustración del campus de la UNP"
                className="login-illustration"
                width="600" height="340"
              />
            </div>

            <h2 className="login-card-title">Únete a la Comunidad</h2>
            <p className="login-card-body">
              Compre y venda dentro de la Universidad Nacional de Piura de forma segura y rápida.
            </p>

            {/* Botón Google */}
            <button
              className="btn-google"
              onClick={handleGoogleLogin}
              disabled={cargando}
              aria-label="Continuar con Google"
            >
              {/* SVG Google (colores oficiales) */}
              <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>

              <span className={cargando ? "btn-label-loading" : ""}>
                {labelBtn}
              </span>
            </button>

            {/* Error de dominio u otros */}
            {errorMsg && (
              <div className="login-error" role="alert">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Feature chips */}
            <div className="login-features" aria-label="Beneficios de la plataforma">
              {["✓ Gratis", "✓ Seguro", "✓ Instantáneo", "✓ Solo UNP"].map((chip) => (
                <div key={chip} className="feature-chip">{chip}</div>
              ))}
            </div>

          </div>{/* /login-card */}

          {/* FOOTER */}
          <footer className="login-footer">
            Al continuar, aceptas registrarte con tu correo institucional y los{" "}
            <a href="#">Términos y Condiciones</a>.
          </footer>

        </div>
      </div>
    </>
  );
};

export default Login;