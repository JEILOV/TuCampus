// src/components/InstalarPWABanner.jsx
// ============================================================
//  TuCampus — Banner discreto de instalación de PWA
//
//  Se monta UNA vez, fuera de <Routes> (ver App.jsx, mismo patrón que
//  NotificacionToast), así aparece en cualquier pantalla sin importar
//  la ruta. Solo se renderiza cuando:
//    · el navegador confirmó que la app es instalable
//      (usePwaInstall → puedeInstalar), y
//    · el usuario no lo descartó recientemente (localStorage).
//
//  Descartar guarda la fecha en localStorage y no vuelve a insistir
//  por 14 días — evita ser invasivo en cada visita sin desaparecer
//  para siempre (útil si al usuario se le olvidó instalar y vuelve
//  semanas después).
// ============================================================

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { usePwaInstall } from "../hooks/usePwaInstall";

const CLAVE_DESCARTE = "tucampus_pwa_banner_descartado_en";
const DIAS_ANTES_DE_REINSISTIR = 14;

const fueDescartadoRecientemente = () => {
  const guardado = localStorage.getItem(CLAVE_DESCARTE);
  if (!guardado) return false;

  const dias = (Date.now() - Number(guardado)) / (1000 * 60 * 60 * 24);
  return dias < DIAS_ANTES_DE_REINSISTIR;
};

const InstalarPWABanner = () => {
  const { puedeInstalar, instalar } = usePwaInstall();
  const [visible, setVisible]   = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (puedeInstalar && !fueDescartadoRecientemente()) setVisible(true);
    else if (!puedeInstalar) setVisible(false);
  }, [puedeInstalar]);

  const descartar = () => {
    localStorage.setItem(CLAVE_DESCARTE, String(Date.now()));
    setVisible(false);
  };

  const manejarInstalar = async () => {
    setInstalando(true);
    const resultado = await instalar();
    setInstalando(false);

    // Si el usuario acepta, el navegador ya se encarga de instalar y
    // el hook lo detecta vía el evento `appinstalled`. Si rechaza el
    // prompt nativo, lo tratamos igual que un descarte manual para no
    // volver a interrumpirlo de inmediato.
    if (resultado === "dismissed") descartar();
    else setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-card bg-card px-4 py-3.5 shadow-softLg ring-1 ring-ink/5 sm:left-4 sm:right-auto"
      role="dialog"
      aria-label="Instalar TuCampus"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-primary/10 text-primary">
        <Download size={20} strokeWidth={2.5} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">Instalar TuCampus</p>
        <p className="truncate text-[12px] text-ink/60">Acceso directo desde tu celular</p>
      </div>

      <button
        type="button"
        onClick={manejarInstalar}
        disabled={instalando}
        className="shrink-0 rounded-btn bg-primary px-3.5 py-2 text-[12.5px] font-bold text-white transition-opacity disabled:opacity-60"
      >
        {instalando ? "..." : "Instalar"}
      </button>

      <button
        type="button"
        onClick={descartar}
        aria-label="Cerrar"
        className="shrink-0 rounded-full p-1 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink/70"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default InstalarPWABanner;