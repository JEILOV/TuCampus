// src/components/NotificacionToast.jsx
// ============================================================
//  TuCampus — Toast flotante de notificación en PRIMER PLANO
//
//  Muestra una tarjeta flotante (arriba-derecha en desktop, arriba-
//  centro en móvil) cuando llega un push de FCM mientras la pestaña
//  está abierta y con foco. Con la app en segundo plano o cerrada,
//  quien se encarga de mostrar la notificación es el Service Worker
//  (public/firebase-messaging-sw.js), no este componente.
//
//  Fuente del payload: notificationService.escucharNotificacionesPrimerPlano,
//  que ya normaliza el mensaje a { titulo, cuerpo, url } sin importar
//  si FCM lo mandó en `notification` o en `data`.
//
//  Comportamiento:
//    · Solo escucha si hay sesión iniciada (useAuth().user).
//    · Se autodescarta a los 5s, o antes si el usuario hace click
//      (cierra + navega a `url`) o toca el botón de cerrar (cierra sin navegar).
//    · Un mensaje nuevo reemplaza al que esté visible y reinicia el timer
//      — mantenemos como máximo un toast a la vez, a propósito, para no
//      apilar tarjetas si llegan varios pushes seguidos.
//
//  USO: montar UNA vez, dentro del árbol de <BrowserRouter> (para poder
//  usar useNavigate) y dentro de <AuthProvider> (para useAuth). Ver App.jsx.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { escucharNotificacionesPrimerPlano } from "../services/notificationService";

const DURACION_MS = 5000;

const NotificacionToast = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // toast: null cuando no hay nada que mostrar.
  const [toast, setToast]     = useState(null);
  const [entrando, setEntrando] = useState(false);
  const timeoutRef = useRef(null);

  const cerrar = () => {
    clearTimeout(timeoutRef.current);
    setEntrando(false);
    // Espera a que termine la transición de salida antes de desmontar,
    // para no cortar la animación en seco.
    setTimeout(() => setToast(null), 200);
  };

  useEffect(() => {
    if (!user) {
      setToast(null);
      return;
    }

    let cancelado = false;
    let unsubscribe = () => {};

    escucharNotificacionesPrimerPlano((payload) => {
      if (cancelado) return;

      clearTimeout(timeoutRef.current);
      setToast(payload);
      // Doble rAF/microtask evita que el navegador colapse el estado
      // inicial (opacity 0) con el final en el mismo frame — así la
      // transición de entrada sí se ve.
      requestAnimationFrame(() => requestAnimationFrame(() => setEntrando(true)));

      timeoutRef.current = setTimeout(cerrar, DURACION_MS);
    }).then((fn) => {
      if (cancelado) fn();
      else unsubscribe = fn;
    });

    return () => {
      cancelado = true;
      unsubscribe();
      clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!toast) return null;

  const irAlEnlace = () => {
    cerrar();
    navigate(toast.url || "/");
  };

  return (
    <div
      className="fixed inset-x-4 top-4 z-50 flex justify-center sm:inset-x-auto sm:right-4 sm:left-auto sm:justify-end"
      aria-live="polite"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={irAlEnlace}
        onKeyDown={(e) => e.key === "Enter" && irAlEnlace()}
        className={`flex w-full max-w-sm cursor-pointer items-start gap-3 rounded-card bg-card px-4 py-3.5 shadow-softLg ring-1 ring-ink/5 transition-all duration-200 ease-out ${
          entrando ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        }`}
      >
        <span className="mt-0.5 text-xl shrink-0" aria-hidden="true">
          🔔
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-ink">{toast.titulo}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink/70">
            {toast.cuerpo}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            cerrar();
          }}
          aria-label="Cerrar notificación"
          className="shrink-0 rounded-full px-1.5 py-0.5 text-sm font-bold text-ink/30 hover:text-ink/60"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default NotificacionToast;