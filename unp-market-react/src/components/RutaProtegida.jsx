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
import Spinner from "../components/Spinner";

const RutaProtegida = ({ children }) => {
  const { user, cargando } = useAuth();

  // El estado cargando solo es true durante la hidratación inicial.
  // Una vez que AuthContext lo resuelve, nunca vuelve a ser true.
 if (cargando) return <Spinner mensaje="Verificando acceso..." />;

  // Sin usuario → redirigir al login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default RutaProtegida;