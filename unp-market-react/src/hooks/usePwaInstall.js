// src/hooks/usePwaInstall.js
// ============================================================
//  TuCampus — Hook de instalación de PWA
//
//  Captura el evento `beforeinstallprompt` (Chrome/Android/Edge —
//  Safari/iOS NO lo dispara, ver nota abajo) y expone lo mínimo para
//  que un componente de UI decida cuándo/cómo pedir la instalación:
//
//    const { puedeInstalar, instalar, appInstalada } = usePwaInstall();
//
//  · puedeInstalar: true solo cuando el navegador ya avisó que la app
//    es instalable Y todavía no se llamó a prompt() para ese evento.
//  · instalar(): dispara el prompt nativo del navegador; devuelve
//    la elección del usuario ("accepted" | "dismissed") o null si no
//    había prompt disponible.
//  · appInstalada: true si la app ya corre en modo standalone (ya
//    instalada) — sirve para no mostrar el banner de instalación.
//
//  ⚠️ iOS/Safari no soporta `beforeinstallprompt` — ahí no hay forma
//  de disparar un prompt nativo por código; solo existe el flujo
//  manual "Compartir → Agregar a pantalla de inicio". Este hook deja
//  `puedeInstalar` en false en iOS a propósito (no hay evento que
//  escuchar); si más adelante quieren instrucciones para iOS, se
//  agregaría una detección de UA aparte en el componente de UI.
// ============================================================

import { useState, useEffect, useCallback } from "react";

const estaEnStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches ||
  // iOS Safari: no tiene display-mode, expone esta propiedad no estándar.
  window.navigator.standalone === true;

export function usePwaInstall() {
  const [eventoDiferido, setEventoDiferido] = useState(null);
  const [appInstalada, setAppInstalada]     = useState(estaEnStandalone);

  useEffect(() => {
    if (appInstalada) return; // ya instalada — no hace falta escuchar nada más

    const alAntesDeInstalar = (evento) => {
      // Evita que Chrome muestre su propio mini-banner automático;
      // guardamos el evento para dispararlo nosotros cuando el
      // usuario toque nuestro botón (UI propia, ver InstalarPWABanner).
      evento.preventDefault();
      setEventoDiferido(evento);
    };

    const alInstalar = () => {
      setAppInstalada(true);
      setEventoDiferido(null);
    };

    window.addEventListener("beforeinstallprompt", alAntesDeInstalar);
    window.addEventListener("appinstalled", alInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", alAntesDeInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, [appInstalada]);

  const instalar = useCallback(async () => {
    if (!eventoDiferido) return null;

    eventoDiferido.prompt();
    const { outcome } = await eventoDiferido.userChoice; // "accepted" | "dismissed"

    // El evento es de un solo uso — tanto si acepta como si rechaza,
    // hay que esperar a que el navegador dispare uno nuevo la próxima vez.
    setEventoDiferido(null);
    return outcome;
  }, [eventoDiferido]);

  return {
    puedeInstalar: !!eventoDiferido && !appInstalada,
    appInstalada,
    instalar,
  };
}

export default usePwaInstall;