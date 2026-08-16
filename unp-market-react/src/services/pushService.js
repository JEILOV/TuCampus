// src/services/pushService.js
// ============================================================
//  TuCampus — Cliente del endpoint serverless de notificaciones
//  push (api/enviar-push.js, Vercel Serverless Function).
//
//  Capa deliberadamente delgada: arma el request, adjunta el ID
//  Token de Firebase Auth de quien está logueado (así el backend
//  puede verificar que quien dispara el push es un usuario real
//  de TuCampus, sin necesitar un "secreto" en el bundle del
//  cliente — cualquier valor embebido en el JS público deja de
//  ser secreto), y nunca lanza: un push que falla no debe romper
//  el flujo que lo originó (enviar un mensaje, dejar una reseña,
//  publicar un producto).
// ============================================================

import { auth } from "./firebase";
import { logError } from "../utils/errorHandler";

const MAX_TOKENS_POR_ENVIO = 500; // límite duro de sendEachForMulticast (FCM)

/**
 * Envía una notificación push a uno o más tokens FCM, vía el
 * endpoint serverless /api/enviar-push.
 *
 * @param {Object} params
 * @param {string[]} params.tokens   Tokens FCM destino (se recorta a 500)
 * @param {string} params.titulo
 * @param {string} params.cuerpo
 * @param {string} [params.url="/"] Ruta a abrir al hacer click en la notificación
 * @param {string} [params.avatar] Foto de PERFIL de quien origina el evento
 *   (chat/reseña) — se muestra como `icon`, el círculo chico, nunca expandido.
 * @param {string} [params.imagen] Foto de PRODUCTO — se muestra como `image`,
 *   la vista previa grande expandida. No usar para avatares de usuario.
 * @param {Object} [params.data={}] Payload extra opcional (solo strings)
 * @returns {Promise<{successCount:number, failureCount:number, tokensInvalidos:string[]}|null>}
 *   `null` si no se pudo enviar (sin sesión, sin tokens, error de red, etc.)
 */
export const enviarPush = async ({ tokens, titulo, cuerpo, url = "/", avatar, imagen, data = {} }) => {
  const listaTokens = (Array.isArray(tokens) ? tokens : [tokens])
    .filter((t) => typeof t === "string" && t)
    .slice(0, MAX_TOKENS_POR_ENVIO);

  if (listaTokens.length === 0) return null;

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
      // `avatar`/`imagen` solo se mandan si vino un valor real — así
      // el body no se llena de claves `undefined` en los envíos que
      // no tienen foto.
      body: JSON.stringify({
        tokens: listaTokens,
        titulo,
        cuerpo,
        url,
        data,
        ...(typeof avatar === "string" && avatar ? { avatar } : {}),
        ...(typeof imagen === "string" && imagen ? { imagen } : {}),
      }),
    });

    if (!respuesta.ok) {
      throw new Error(`El endpoint de push respondió ${respuesta.status}`);
    }

    return await respuesta.json();
  } catch (err) {
    logError("[pushService.enviarPush]", err);
    return null; // fire-and-forget: nunca debe romper el flujo que lo llamó
  }
};