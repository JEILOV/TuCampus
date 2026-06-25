// src/context/AuthContext.jsx
// ============================================================
//  TuCampus — Contexto global de autenticación
//
//  RESPONSABILIDADES:
//    1. Correr UN SOLO onAuthStateChanged para toda la app.
//    2. Al detectar usuario autenticado, obtener/crear su perfil
//       en Firestore usando el servicio ya existente.
//    3. Fusionar favoritos de invitado con los de Firestore
//       al iniciar sesión (lógica que antes vivía en Login.jsx).
//    4. Exponer { user, perfil, favoritos, cargando,
//               actualizarPerfil, actualizarFavoritos, cerrarSesion }
//       a cualquier componente vía useAuth().
//
//  POR QUÉ ES MEJOR:
//    - Antes: 5-6 listeners onAuthStateChanged abiertos en paralelo
//      (uno por página), con race conditions y duplicación.
//    - Ahora: 1 listener, 1 fuente de verdad, cero duplicación.
// ============================================================

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut }                                  from "firebase/auth";
import { auth }                                                         from "../services/firebase";
import { obtenerOCrearPerfilUsuario, sincronizarFavoritos }             from "../services/userService";
import {
  obtenerFavoritos,
  guardarFavoritos,
  fusionarFavoritos,
} from "../utils/favoritesStorage";

// ── 1. Creación del contexto ─────────────────────────────────
//  Valor inicial null: cualquier componente que llame useAuth()
//  FUERA del Provider recibirá null y sabrá que hay un bug.
const AuthContext = createContext(null);

// ── 2. Provider ──────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  // user    → objeto Firebase Auth (uid, email, displayName, photoURL…)
  // perfil  → documento Firestore del usuario (nombre, bio, teléfono…)
  // favoritos → Set<string> de IDs de productos favoritos
  // cargando → true mientras Firebase resuelve el estado inicial
  const [user,      setUser]      = useState(null);
  const [perfil,    setPerfil]    = useState(null);
  const [favoritos, setFavoritos] = useState(new Set());
  const [cargando,  setCargando]  = useState(true); // empieza en true: aún no sabemos

  // ── 3. Listener único de autenticación ───────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // Usuario cerró sesión o no está autenticado
        setUser(null);
        setPerfil(null);
        setFavoritos(new Set());
        setCargando(false);
        return;
      }

      try {
        // Recuperar favoritos que el usuario marcó como invitado
        const favoritosInvitado = obtenerFavoritos();

        // Obtener o crear perfil en Firestore (usa el servicio ya existente)
        const { perfil: perfilObtenido, favoritosGuardados } =
          await obtenerOCrearPerfilUsuario(firebaseUser);

        // Fusionar favoritos invitado + Firestore sin duplicados
        const favoritosFusionados = fusionarFavoritos(favoritosInvitado, favoritosGuardados);

        // Si hubo favoritos nuevos de invitado, persistirlos en Firestore
        if (favoritosInvitado.length > 0) {
          await sincronizarFavoritos(firebaseUser.uid, favoritosFusionados);
        }

        // Sincronizar localStorage con el resultado final
        guardarFavoritos(favoritosFusionados);

        setUser(firebaseUser);
        setPerfil(perfilObtenido);
        setFavoritos(new Set(favoritosFusionados));
      } catch (error) {
        // Si Firestore falla, al menos tenemos el user de Auth
        console.error("[AuthContext] Error al cargar perfil:", error);
        setUser(firebaseUser);
        setPerfil(null);
        setFavoritos(new Set(obtenerFavoritos()));
      } finally {
        setCargando(false);
      }
    });

    // Limpieza: cuando el componente se desmonte (HMR de Vite, etc.)
    return () => unsubscribe();
  }, []); // [] → solo se monta una vez en toda la vida de la app

  // ── 4. Acciones expuestas ─────────────────────────────────

  /**
   * Actualiza el perfil en el contexto tras una edición exitosa.
   * El componente Perfil.jsx ya hizo el setDoc; solo sincronizamos
   * el estado global para que el resto de la app vea los cambios.
   * @param {Object} nuevosDatos - campos actualizados del perfil
   */
  const actualizarPerfil = useCallback((nuevosDatos) => {
    setPerfil((prev) => ({ ...prev, ...nuevosDatos }));
  }, []);

  /**
   * Actualiza el Set de favoritos y lo persiste en localStorage.
   * La sincronización con Firestore es responsabilidad del llamador
   * (Home.jsx llama a sincronizarFavoritos después de llamar esto).
   * @param {Set<string>} nuevosFavoritos
   */
  const actualizarFavoritos = useCallback((nuevosFavoritos) => {
    setFavoritos(nuevosFavoritos);
    guardarFavoritos([...nuevosFavoritos]);
  }, []);

  /**
   * Cierra la sesión de Firebase y limpia el estado global.
   * Centralizado aquí: antes cada página tenía su propio signOut + localStorage.clear().
   */
  const cerrarSesion = useCallback(async () => {
    try {
      await signOut(auth);
      // Limpiar localStorage de datos de sesión
      ["unp_user_profile", "listaFavoritos", "mostrarToastPublicar", "productoSeleccionado"]
        .forEach((k) => localStorage.removeItem(k));
      // El onAuthStateChanged de arriba se disparará automáticamente
      // y reseteará user, perfil y favoritos.
    } catch (error) {
      console.error("[AuthContext] Error al cerrar sesión:", error);
      throw error; // re-lanzamos para que el componente pueda mostrar un toast
    }
  }, []);

  // ── 5. Valor del contexto ────────────────────────────────
  const value = {
    user,           // Firebase Auth user object (o null)
    perfil,         // Documento Firestore del usuario (o null)
    favoritos,      // Set<string> de IDs favoritos
    cargando,       // boolean — true mientras se resuelve el estado inicial
    actualizarPerfil,
    actualizarFavoritos,
    cerrarSesion,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// ── 6. Hook de consumo ───────────────────────────────────────
/**
 * Hook para consumir el AuthContext en cualquier componente.
 *
 * @example
 *   const { user, perfil, cargando, cerrarSesion } = useAuth();
 *
 * @throws {Error} si se usa fuera de <AuthProvider>
 */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() debe usarse dentro de <AuthProvider>. Revisa main.jsx.");
  }
  return ctx;
};