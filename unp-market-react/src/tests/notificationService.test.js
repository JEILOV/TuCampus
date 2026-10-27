// src/tests/notificationService.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  mockAddDoc,
  mockGetDoc,
  mockGetDocs,
  mockSetDoc,
  resetAllMocks,
} from "./__mocks__/firebase";

const { mockSolicitarPush, mockGetToken } = vi.hoisted(() => ({
  mockSolicitarPush: vi.fn(),
  mockGetToken: vi.fn(),
}));

vi.mock("../services/pushService", () => ({
  solicitarPush: mockSolicitarPush,
}));

vi.mock("firebase/messaging", () => ({
  isSupported: vi.fn(async () => true),
  getMessaging: vi.fn(() => ({})),
  getToken: mockGetToken,
  onMessage: vi.fn(),
}));

// logError está mockeado en __mocks__/firebase.js —
// lo importamos aquí para afirmar sobre sus llamadas.
import { logError } from "../utils/errorHandler";
import { auth } from "../services/firebase";

import {
  crearNotificacion,
  solicitarPermisoNotificaciones,
  notificarNuevoMensaje,
  notificarNuevaResena,
  notificarNuevoProductoEnSede,
} from "../services/notificationService";

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

  // ══════════════════════════════════════════════════════════
  describe("orquestación push en servidor (FASE 4 - TAREA 4)", () => {
    it("notificarNuevoMensaje delega a solicitarPush sin leer usuarios en el cliente", async () => {
      await notificarNuevoMensaje({ chatId: "chat-1", mensajeId: "msg-99" });

      expect(mockSolicitarPush).toHaveBeenCalledWith({
        tipo: "mensaje",
        chatId: "chat-1",
        mensajeId: "msg-99",
      });
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("notificarNuevaResena delega a solicitarPush sin leer usuarios en el cliente", async () => {
      await notificarNuevaResena({ vendedorUid: "uid-vendedor-1" });

      expect(mockSolicitarPush).toHaveBeenCalledWith({
        tipo: "resena",
        vendedorUid: "uid-vendedor-1",
      });
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("notificarNuevoProductoEnSede delega a solicitarPush sin consultar usuarios en el cliente", async () => {
      await notificarNuevoProductoEnSede({ productoId: "prod-777" });

      expect(mockSolicitarPush).toHaveBeenCalledWith({
        tipo: "producto",
        productoId: "prod-777",
      });
      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it("no invoca solicitarPush si faltan las referencias obligatorias", async () => {
      await notificarNuevoMensaje({ chatId: "chat-1" });
      await notificarNuevaResena({});
      await notificarNuevoProductoEnSede({});

      expect(mockSolicitarPush).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════
  describe("solicitarPermisoNotificaciones — guarda en usuariosPrivado (FASE 6A - TAREA 4)", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "vapid-test-key");
      const mockNotification = {
        requestPermission: vi.fn(async () => "granted"),
      };
      vi.stubGlobal("window", { Notification: mockNotification });
      vi.stubGlobal("Notification", mockNotification);
      vi.stubGlobal("navigator", {
        serviceWorker: {
          register: vi.fn(async () => ({ scope: "/" })),
        },
      });
      mockGetToken.mockResolvedValue("fcm-token-nuevo");
      mockSetDoc.mockResolvedValue(undefined);
      auth.currentUser = null;
    });

    it("guarda el token en usuariosPrivado/{uid} con universidadId del perfil y merge: true", async () => {
      const token = await solicitarPermisoNotificaciones("uid-10", "unp");

      expect(token).toBe("fcm-token-nuevo");
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc.mock.calls[0]).toEqual([
        { _col: "usuariosPrivado", _id: "uid-10" },
        {
          uid: "uid-10",
          universidadId: "unp",
          fcmToken: { _type: "arrayUnion", args: ["fcm-token-nuevo"] },
        },
        { merge: true },
      ]);
    });

    it("deriva universidadId del correo con detectarUniversidad cuando no se pasa universidadId", async () => {
      auth.currentUser = { email: "alumno@ucvvirtual.edu.pe" };

      const token = await solicitarPermisoNotificaciones("uid-11");

      expect(token).toBe("fcm-token-nuevo");
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc.mock.calls[0][1]).toEqual({
        uid: "uid-11",
        universidadId: "ucv",
        fcmToken: { _type: "arrayUnion", args: ["fcm-token-nuevo"] },
      });
    });

    it("omite solo universidadId y aun así escribe el token si no se conoce la sede", async () => {
      auth.currentUser = null;

      const token = await solicitarPermisoNotificaciones("uid-12");

      expect(token).toBe("fcm-token-nuevo");
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc.mock.calls[0][1]).toEqual({
        uid: "uid-12",
        fcmToken: { _type: "arrayUnion", args: ["fcm-token-nuevo"] },
      });
      expect(mockSetDoc.mock.calls[0][1]).not.toHaveProperty("universidadId");
    });
  });

});
