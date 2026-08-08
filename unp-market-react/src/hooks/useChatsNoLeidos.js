// src/hooks/useChatsNoLeidos.js
// ============================================================
//  TuCampus — Contador global de mensajes no leídos
//
//  Reutiliza suscribirMisChats() de chatService.js (mismo listener
//  que usa Chat.jsx en modo lista) y suma noLeidoPor[uid] de todas
//  las conversaciones. Un solo onSnapshot, igual patrón que
//  useNotifications.js.
// ============================================================

import { useState, useEffect } from "react";
import { suscribirMisChats }   from "../services/chatService";

/**
 * Total de mensajes no leídos del usuario autenticado, en tiempo real.
 *
 * @param {string|null} uid
 * @returns {number} suma de noLeidoPor[uid] en todos sus chats
 *
 * @example
 *   const { user } = useAuth();
 *   const mensajesNoLeidos = useChatsNoLeidos(user?.uid);
 */
export const useChatsNoLeidos = (uid) => {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!uid) {
      setTotal(0);
      return;
    }

    const unsub = suscribirMisChats(uid, (chats) => {
      const suma = chats.reduce((acc, chat) => acc + (chat.noLeidoPor?.[uid] || 0), 0);
      setTotal(suma);
    });

    return () => unsub();
  }, [uid]);

  return total;
};