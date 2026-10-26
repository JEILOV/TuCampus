// src/hooks/useObjectUrls.js
// ============================================================
//  H09: Gestión centralizada de Object URLs de previsualización
//  Evita fugas de memoria al reemplazar/quitar imágenes o desmontar.
// ============================================================

import { useEffect, useRef, useCallback } from "react";

/**
 * Crea un Object URL, lo registra en el Set `registro` y lo devuelve.
 * @param {Set<string>} registro
 * @param {Blob|File} blob
 * @returns {string}
 */
export const crearUrlPreview = (registro, blob) => {
  const url = URL.createObjectURL(blob);
  registro.add(url);
  return url;
};

/**
 * Revoca un Object URL únicamente si fue creado y sigue activo en `registro`.
 * Si la URL no existe en el registro (ej. URL remota o ya revocada), no falla.
 * @param {Set<string>} registro
 * @param {string|null|undefined} url
 */
export const revocarUrlPreview = (registro, url) => {
  if (!url || !registro.has(url)) return;
  URL.revokeObjectURL(url);
  registro.delete(url);
};

/**
 * Revoca todos los Object URLs pendientes en `registro` y vacía el Set.
 * @param {Set<string>} registro
 */
export const revocarTodasUrlsPreview = (registro) => {
  for (const url of Array.from(registro)) {
    URL.revokeObjectURL(url);
  }
  registro.clear();
};

/**
 * Hook que mantiene un registro por ref de todos los Object URLs creados
 * por el componente y los revoca automáticamente al desmontar.
 */
export const useObjectUrls = () => {
  const urlsRef = useRef(new Set());

  const crearUrl = useCallback((blob) => {
    return crearUrlPreview(urlsRef.current, blob);
  }, []);

  const revocarUrl = useCallback((url) => {
    revocarUrlPreview(urlsRef.current, url);
  }, []);

  const revocarTodas = useCallback(() => {
    revocarTodasUrlsPreview(urlsRef.current);
  }, []);

  useEffect(() => {
    const registro = urlsRef.current;
    return () => {
      revocarTodasUrlsPreview(registro);
    };
  }, []);

  return { crearUrl, revocarUrl, revocarTodas };
};
