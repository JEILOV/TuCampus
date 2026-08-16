// src/main.jsx
import { StrictMode }  from "react";
import { createRoot }  from "react-dom/client";
import "./index.css";
import App             from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CampusProvider } from "./context/CampusContext.jsx";

// AuthProvider envuelve TODA la app.
// Esto garantiza que el listener onAuthStateChanged se registre
// una sola vez, antes de que cualquier ruta o componente se monte.
//
// CampusProvider va DENTRO de AuthProvider porque necesita leer
// perfil.universidadId — publica el color de acento de la sede activa
// como variable CSS en <html> (ver context/CampusContext.jsx).
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <CampusProvider>
        <App />
      </CampusProvider>
    </AuthProvider>
  </StrictMode>
);