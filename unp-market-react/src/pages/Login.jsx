// src/pages/Login.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";

// ──────────────────────────────────────────────────────────────
//  CONSTANTES Y RECURSOS
// ──────────────────────────────────────────────────────────────
const DOMINIO_PERMITIDO  = "@alumnos.unp.edu.pe";
const LOGO_HORIZONTAL    = "https://i.ibb.co/R5wf8nn/Chat-GPT-Image-17-jun-2026-03-37-18-p-m-removebg-preview.png";
const ILUSTRACION_CAMPUS = "https://i.ibb.co/qLmxNQTz/Chat-GPT-Image-16-may-2026-04-32-51-a-m.png";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const Toast = ({ mensaje }) => (
  <div style={{
    background: "#fecaca", color: "#991b1b",
    padding: "14px 18px", borderRadius: "16px", fontSize: "13.5px",
    fontWeight: 700, boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
    fontFamily: "'Nunito', sans-serif",
    display: "flex", alignItems: "center", gap: "10px"
  }}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="3">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
    {mensaje}
  </div>
);

// ──────────────────────────────────────────────────────────────
//  COMPONENTE
// ──────────────────────────────────────────────────────────────
const Login = () => {
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(false);
  const [toast, setToast] = useState(null);
  const [labelBtn, setLabelBtn] = useState("Continuar con correo institucional");

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

 useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // Solo te redirige automáticamente si tienes la cuenta correcta
      if (user && user.email?.endsWith(DOMINIO_PERMITIDO)) {
        navigate("/", { replace: true });
      }
    });
    return () => unsub();
  }, [navigate]);

  const handleGoogleLogin = async () => {
    if (cargando) return;

    ["unp_user_profile", "listaFavoritos", "mostrarToastPublicar", "productoSeleccionado"]
      .forEach((k) => localStorage.removeItem(k));

    setCargando(true);
    setLabelBtn("Conectando...");

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user.email.endsWith(DOMINIO_PERMITIDO)) {
        await signOut(auth);
        setToast({ mensaje: "Acceso denegado: Usa tu correo @alumnos.unp.edu.pe" });
        setLabelBtn("Continuar con correo institucional");
        setCargando(false);
        return;
      }

      const userRef = doc(db, "usuarios", user.uid);
      const userSnap = await getDoc(userRef);

      let profileData = {
        uid: user.uid,
        nombre: user.displayName || "Estudiante UNP",
        email: user.email,
        avatar: user.photoURL || "",
        ubicacion: "Piura",
        bio: "Estudiante de la UNP",
        acercaDe: "¡Hola! Bienvenido a mi tienda en el campus.",
        telefono: "",
      };

      if (!userSnap.exists()) {
        await setDoc(userRef, profileData);
      } else {
        profileData = { ...profileData, ...userSnap.data() };
      }

      localStorage.setItem("unp_user_profile", JSON.stringify(profileData));
      localStorage.setItem("listaFavoritos", JSON.stringify(userSnap.exists() ? (userSnap.data().favoritos || []) : []));

      navigate("/", { replace: true });

    } catch (err) {
      console.error("Error de login:", err);
      if (err.code !== "auth/popup-closed-by-user") {
        setToast({ mensaje: "Error de conexión. Inténtalo nuevamente." });
      }
      setLabelBtn("Continuar con correo institucional");
      setCargando(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        
     {/* LOGO OFICIAL CON ESQUINAS REDONDEADAS */}
        <header className="login-brand" style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '24px' }}>
          <img 
            src={LOGO_HORIZONTAL} 
            alt="Mercado UNP" 
            style={{ 
              width: '100%', 
              maxWidth: '350px', 
              height: 'auto', 
              objectFit: 'contain',
              borderRadius: '50px' /* <-- Redondeo para matar los picos filosos */
            }} 
          />
        </header>

        {/* TARJETA BLANCA */}
        <div className="login-card">
          <div className="login-illustration-wrap">
            <img src={ILUSTRACION_CAMPUS} alt="Campus UNP" className="login-illustration" />
          </div>

          <h1 className="login-card-title">Únete a la Comunidad</h1>
          <p className="login-card-body">
            Compra y vende dentro de la Universidad Nacional de Piura de forma segura y rápida.
          </p>

          <button className="btn-login-primary" onClick={handleGoogleLogin} disabled={cargando}>
            <div className="login-google-icon-wrap">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </div>
            <span className={cargando ? "btn-label-loading" : ""}>{labelBtn}</span>
          </button>

          <div className="login-features">
            <div className="login-feature-chip chip--verde"><span className="chip-check">✓</span> Gratis</div>
            <div className="login-feature-chip chip--verde"><span className="chip-check">✓</span> Seguro</div>
            <div className="login-feature-chip chip--naranja"><span className="chip-check">✓</span> Instantáneo</div>
            <div className="login-feature-chip chip--azul"><span className="chip-check">✓</span> Solo UNP</div>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="login-footer">
          Al continuar aceptas registrarte con tu correo institucional y los <a href="#">Términos y Condiciones</a>.
        </footer>

      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: "40px", left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, width: "calc(100% - 40px)", maxWidth: "390px", pointerEvents: "none",
        }}>
          <Toast mensaje={toast.mensaje}/>
        </div>
      )}
    </div>
  );
};

export default Login;