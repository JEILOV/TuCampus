// src/components/BannerNotificaciones.jsx
// ============================================================
//  TuCampus — Banner discreto para activar notificaciones push
//
//  Se muestra solo si, a la vez:
//    · Hay sesión iniciada (useAuth().user)
//    · El navegador soporta Notification API + Service Worker
//    · El usuario todavía NO respondió el permiso del navegador
//      (Notification.permission === "default")
//    · No lo cerró antes en este dispositivo (localStorage)
//
//  En cuanto el usuario responde algo (acepta, el navegador deniega,
//  o cierra el banner con "Ahora no"), desaparece para siempre en
//  este dispositivo — no queremos ser invasivos.
//
//  USO:
//    <BannerNotificaciones />
// ============================================================

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { solicitarPermisoNotificaciones } from "../services/notificationService";

const CLAVE_DESCARTADO = "tucampus_banner_notif_descartado";

const BannerNotificaciones = () => {
  const { user, perfil } = useAuth();
  const [visible, setVisible] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!user) {
      setVisible(false);
      return;
    }

    const soportado =
      typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
    if (!soportado) {
      setVisible(false);
      return;
    }

    const yaDescartado = localStorage.getItem(CLAVE_DESCARTADO) === "1";
    const yaRespondioPermiso = Notification.permission !== "default";

    setVisible(!yaDescartado && !yaRespondioPermiso);
  }, [user]);

  const cerrar = () => {
    localStorage.setItem(CLAVE_DESCARTADO, "1");
    setVisible(false);
  };

  const activar = async () => {
    if (!user || cargando) return;
    setCargando(true);
    await solicitarPermisoNotificaciones(user.uid, perfil?.universidadId);
    setCargando(false);
    // Se descarta tanto si aceptó como si el navegador denegó el
    // permiso — en ambos casos ya respondió y no hay que insistir.
    localStorage.setItem(CLAVE_DESCARTADO, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="relative z-10 mx-4 mt-3 flex items-center gap-3 rounded-card bg-card px-4 py-3 shadow-soft">
      <span className="text-xl" aria-hidden="true">
        🔔
      </span>

      <p className="flex-1 text-[12.5px] font-semibold leading-snug text-ink/80">
        Activa las notificaciones para enterarte de ofertas y avisos en tu campus.
      </p>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={activar}
          disabled={cargando}
          className="rounded-chip bg-primary px-3 py-1.5 text-[11.5px] font-bold text-background disabled:opacity-60"
        >
          {cargando ? "..." : "Activar"}
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="text-[10.5px] font-semibold text-ink/40"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
};

export default BannerNotificaciones;