// src/components/RutaProtegida.jsx
// ============================================================
//  Guard de rutas privadas — versión con AuthContext
//
//  ANTES: Abría su propio onAuthStateChanged (listener #N),
//         duplicando la lógica de autenticación y generando
//         un flash de pantalla en blanco en cada navegación.
//
//  AHORA: Lee el estado del AuthContext (ya resuelto por main.jsx).
//         Si cargando=true muestra el spinner UNA sola vez al
//         inicio de la app, nunca más al navegar entre rutas.
// ============================================================

import { Navigate }  from "react-router-dom";
import { useAuth }   from "../context/AuthContext";

const RutaProtegida = ({ children }) => {
  const { user, cargando } = useAuth();

  // El estado cargando solo es true durante la hidratación inicial.
  // Una vez que AuthContext lo resuelve, nunca vuelve a ser true.
  if (cargando) {
    return (
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        height: "100vh", background: "var(--bg-crema)",
      }}>
        <p style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 700, color: "#5c5c7a" }}>
          Verificando acceso...
        </p>
      </div>
    );
  }

  // Sin usuario → redirigir al login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default RutaProtegida;