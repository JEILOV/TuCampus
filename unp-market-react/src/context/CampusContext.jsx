// src/context/CampusContext.jsx
// ============================================================
//  TuCampus — Contexto de Sede Activa (colores de interacción)
//
//  RESPONSABILIDAD: una sola fuente de verdad para "qué sede está
//  activa ahora mismo" y su color de acento (`obtenerColorAccent`,
//  ver config/universidades.js) — y publicarlo como la variable CSS
//  `--color-accent` en <html>, para que CUALQUIER componente en
//  cualquier página pueda usarlo con una clase Tailwind arbitraria
//  (`bg-[var(--color-accent)]`, `text-[var(--color-accent)]`) sin
//  necesidad de recibirlo por props ni de consumir este contexto
//  directamente.
//
//  Por qué una variable CSS en <html> y no solo Context + props:
//    - BottomNav.jsx y BotonNotificaciones.jsx se montan en 5 páginas
//      distintas (Home, Perfil, Publicar, Vendedor, EditarProducto).
//      Prop-drilling el color hasta cada uno sería más código y más
//      frágil que dejar que la cascada normal de CSS haga el trabajo.
//
//  QUÉ SEDE SE CONSIDERA "ACTIVA":
//    - Por defecto, la del perfil del usuario (`perfil.universidadId`).
//    - Home.jsx permite EXPLORAR otra sede sin cambiar de perfil (ver
//      el selector de campus ahí) — mientras se explora, sedeActiva
//      sigue esa sede elegida, y por diseño eso recolorea TODA la app
//      (BottomNav, badge, etc.) hasta que se elija otra o se recargue
//      la página. Esto es intencional: el pedido fue que el color siga
//      "la sede seleccionada", no necesariamente la del perfil.
//
//  USO:
//    // main.jsx — una sola vez, dentro de <AuthProvider>:
//    <CampusProvider><App /></CampusProvider>
//
//    // Cualquier componente que necesite el valor (no solo el CSS var):
//    const { sedeActiva, setSedeActiva, colorAccent } = useCampus();
// ============================================================

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { obtenerColorAccent } from "../config/universidades";

const CampusContext = createContext(null);

export const CampusProvider = ({ children }) => {
  const { perfil } = useAuth();

  const [sedeActiva, setSedeActivaState] = useState(perfil?.universidadId || "unp");

  // 🔧 Mismo patrón que usaba Home.jsx: si el usuario todavía NO
  // eligió una sede manualmente, mantenemos sedeActiva sincronizada
  // con perfil.universidadId apenas resuelva (Firebase Auth/Firestore
  // suelen resolver después del primer render).
  const tocoSelectorRef = useRef(false);
  useEffect(() => {
    if (!tocoSelectorRef.current && perfil?.universidadId) {
      setSedeActivaState(perfil.universidadId);
    }
  }, [perfil?.universidadId]);

  // setSedeActiva "público": marca que el usuario ya eligió a mano,
  // para que el efecto de arriba deje de pisar su elección.
  const setSedeActiva = (universidadId) => {
    tocoSelectorRef.current = true;
    setSedeActivaState(universidadId);
  };

  const colorAccent = obtenerColorAccent(sedeActiva);

  // Publica el color como variable CSS global — así cualquier
  // elemento en cualquier página lo puede usar sin prop-drilling.
  useEffect(() => {
    document.documentElement.style.setProperty("--color-accent", colorAccent);
  }, [colorAccent]);

  const value = { sedeActiva, setSedeActiva, colorAccent };

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
};

/**
 * Hook para consumir el CampusContext en cualquier componente.
 *
 * @example
 *   const { sedeActiva, setSedeActiva, colorAccent } = useCampus();
 *
 * @throws {Error} si se usa fuera de <CampusProvider>
 */
export const useCampus = () => {
  const ctx = useContext(CampusContext);
  if (!ctx) {
    throw new Error("useCampus() debe usarse dentro de <CampusProvider>. Revisa main.jsx.");
  }
  return ctx;
};