// src/services/pushService.js
// ============================================================
//  TuCampus — Cliente del endpoint serverless de notificaciones
//  push (api/enviar-push.js, Vercel Serverless Function).
//
//  Capa deliberadamente delgada (FASE 4): el cliente NUNCA maneja
//  tokens ajenos ni construye el contenido del push. Solo envía
//  `{ tipo, ...referencias }` junto con el ID Token de Firebase Auth,
//  y el servidor valida el evento en Firestore y decide destinatarios
//  y contenido. Nunca lanza: un push que falla no debe romper el
//  flujo que lo originó (enviar un mensaje, dejar una reseña,
//  publicar un producto).
// ============================================================

import { auth } from "./firebase";
import { logError } from "../utils/errorHandler";

/**
 * Solicita al servidor el envío de una notificación push para un evento
 * recién persistido en Firestore.
 *
 * @param {Object} params
 * @param {"mensaje"|"resena"|"producto"} params.tipo
 * @returns {Promise<{successCount?:number, failureCount?:number, duplicado?:boolean, omitido?:boolean}|null>}
 *   `null` si no se pudo enviar (sin sesión, tipo faltante, error de red, etc.)
 */
export const solicitarPush = async ({ tipo, ...referencias } = {}) => {
  if (!tipo || typeof tipo !== "string") return null;

  // Solo usuarios con sesión de TuCampus pueden disparar pushes —
  // el backend vuelve a validar esto verificando el ID Token, esto
  // acá es solo para no intentar el fetch si obviamente va a fallar.
  if (!auth.currentUser) return null;

  try {
    const idToken = await auth.currentUser.getIdToken();

    const respuesta = await fetch("/api/enviar-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        tipo,
        ...referencias,
      }),
    });

    if (!respuesta.ok) {
      throw new Error(`El endpoint de push respondió ${respuesta.status}`);
    }

    return await respuesta.json();
  } catch (err) {
    logError("[pushService.solicitarPush]", err);
    return null; // fire-and-forget: nunca debe romper el flujo que lo llamó
  }
};
