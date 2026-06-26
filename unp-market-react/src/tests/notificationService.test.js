// src/tests/notificationService.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  mockAddDoc,
  resetAllMocks,
} from "./__mocks__/firebase";

// logError está mockeado en __mocks__/firebase.js —
// lo importamos aquí para afirmar sobre sus llamadas.
import { logError } from "../utils/errorHandler";

import { crearNotificacion } from "../services/notificationService";

// ─────────────────────────────────────────────────────────────
// src/tests/notificationService.test.js

describe("notificationService", () => {

  beforeEach(() => {
    resetAllMocks();
    vi.clearAllMocks(); // ← ¡AGREGA ESTA LÍNEA AQUÍ!
  });

  // ... (aquí siguen los demás tests)
  // ══════════════════════════════════════════════════════════
  describe("crearNotificacion — guards de entrada", () => {

    it("no llama addDoc si paraUid es null", async () => {
      await crearNotificacion({
        paraUid: null, deUid: "yo", deNombre: "Yo", tipo: "favorito",
      });
      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it("no llama addDoc si deUid es null", async () => {
      await crearNotificacion({
        paraUid: "otro", deUid: null, deNombre: "Yo", tipo: "favorito",
      });
      expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it("no llama addDoc si paraUid === deUid (nunca notificarse a uno mismo)", async () => {
      await crearNotificacion({
        paraUid: "uid-123", deUid: "uid-123", deNombre: "Yo", tipo: "favorito",
      });
      expect(mockAddDoc).not.toHaveBeenCalled();
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("crearNotificacion — caso exitoso", () => {

    const inputBase = {
      paraUid:        "vendedor-001",
      deUid:          "comprador-002",
      deNombre:       "Valery B.",
      tipo:           "favorito",
      productoId:     "prod-abc",
      productoTitulo: "Galletas de avena",
    };

    it("llama addDoc una sola vez", async () => {
      mockAddDoc.mockResolvedValueOnce({ id: "notif-nueva" });

      await crearNotificacion(inputBase);

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
    });

    it("el documento guardado incluye todos los campos obligatorios", async () => {
      mockAddDoc.mockResolvedValueOnce({ id: "notif-nueva" });

      await crearNotificacion(inputBase);

      const [_col, datos] = mockAddDoc.mock.calls[0];
      expect(datos).toMatchObject({
        paraUid:        "vendedor-001",
        deUid:          "comprador-002",
        deNombre:       "Valery B.",
        tipo:           "favorito",
        productoId:     "prod-abc",
        productoTitulo: "Galletas de avena",
        leido:          false,
      });
      expect(datos.timestamp).toBeDefined();
    });

    it("usa 'Un usuario' como deNombre si no se pasa", async () => {
      mockAddDoc.mockResolvedValueOnce({ id: "notif-nueva" });

      await crearNotificacion({ ...inputBase, deNombre: undefined });

      const [_col, datos] = mockAddDoc.mock.calls[0];
      expect(datos.deNombre).toBe("Un usuario");
    });

    it("usa 'tu perfil' como productoTitulo si no se pasa", async () => {
      mockAddDoc.mockResolvedValueOnce({ id: "notif-nueva" });

      await crearNotificacion({ ...inputBase, productoTitulo: undefined });

      const [_col, datos] = mockAddDoc.mock.calls[0];
      expect(datos.productoTitulo).toBe("tu perfil");
    });

    it("productoId es null por defecto si no se pasa", async () => {
      mockAddDoc.mockResolvedValueOnce({ id: "notif-nueva" });

      await crearNotificacion({ ...inputBase, productoId: undefined });

      const [_col, datos] = mockAddDoc.mock.calls[0];
      expect(datos.productoId).toBeNull();
    });

    it("funciona con tipo 'seguidor' sin productoId", async () => {
      mockAddDoc.mockResolvedValueOnce({ id: "notif-seguidor" });

      await crearNotificacion({
        paraUid:  "vendedor-001",
        deUid:    "comprador-002",
        deNombre: "Valery B.",
        tipo:     "seguidor",
      });

      const [_col, datos] = mockAddDoc.mock.calls[0];
      expect(datos.tipo).toBe("seguidor");
      expect(datos.productoId).toBeNull();
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("crearNotificacion — manejo de errores (fire-and-forget)", () => {

    const inputBase = {
      paraUid:    "vendedor-001",
      deUid:      "comprador-002",
      deNombre:   "Valery B.",
      tipo:       "contacto",
      productoId: "prod-abc",
    };

    it("NO lanza excepción cuando Firestore falla", async () => {
      mockAddDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );

      // fire-and-forget: el caller nunca debe recibir un throw
      await expect(crearNotificacion(inputBase)).resolves.toBeUndefined();
    });

    it("llama logError con el origen correcto cuando Firestore falla", async () => {
      const firestoreError = Object.assign(new Error("Denied"), { code: "permission-denied" });
      mockAddDoc.mockRejectedValueOnce(firestoreError);

      await crearNotificacion(inputBase);

      expect(logError).toHaveBeenCalledWith(
        "[notificationService.crearNotificacion]",
        firestoreError
      );
    });

    it("NO llama logError cuando addDoc tiene éxito", async () => {
      mockAddDoc.mockResolvedValueOnce({ id: "notif-ok" });

      await crearNotificacion(inputBase);

      expect(logError).not.toHaveBeenCalled();
    });

  });

});