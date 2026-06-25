// src/main.jsx
import { StrictMode }  from "react";
import { createRoot }  from "react-dom/client";
import "./index.css";
import App             from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

// AuthProvider envuelve TODA la app.
// Esto garantiza que el listener onAuthStateChanged se registre
// una sola vez, antes de que cualquier ruta o componente se monte.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);