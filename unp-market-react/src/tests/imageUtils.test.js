// src/tests/imageUtils.test.js
// ============================================================
//  TESTS UNITARIOS — src/utils/imageUtils.js (FASE 4 - TAREA 1)
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { currentUser: null },
}));

vi.mock("../services/firebase", () => ({
  auth: mockAuth,
  db: {},
  app: {},
}));

import {
  construirHeadersSubida,
  mapearErrorSubida,
  subirImagenImgBB,
} from "../utils/imageUtils";

describe("imageUtils — autenticación y manejo de errores en subida (TAREA 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = null;
  });

  describe("construirHeadersSubida", () => {
    it("arma Content-Type y Authorization Bearer con el token", () => {
      const headers = construirHeadersSubida("mi-id-token-123");
      expect(headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer mi-id-token-123",
      });
    });

    it("lanza error AUTH_REQUIRED si el token está vacío", () => {
      expect(() => construirHeadersSubida("")).toThrow(
        "Inicia sesión para subir imágenes"
      );
      expect(() => construirHeadersSubida(null)).toThrow(
        "Inicia sesión para subir imágenes"
      );
    });
  });

  describe("mapearErrorSubida", () => {
    it("distingue 401 (sesión expirada/requerida) de timeout", () => {
      const err = mapearErrorSubida(
        401,
        JSON.stringify({ error: "Tu sesión expiró." })
      );
      expect(err.code).toBe("AUTH_REQUIRED");
      expect(err.message).toBe("Tu sesión expiró.");
      expect(err.code).not.toBe("UPLOAD_TIMEOUT");
    });

    it("distingue 403 (permisos/dominio institucional) de timeout", () => {
      const err = mapearErrorSubida(
        403,
        JSON.stringify({
          error: "Solo se permiten cuentas con correo institucional autorizado.",
        })
      );
      expect(err.code).toBe("FORBIDDEN");
      expect(err.message).toContain("institucional");
      expect(err.code).not.toBe("UPLOAD_TIMEOUT");
    });

    it("mapea 413 a PAYLOAD_TOO_LARGE y 429 a RATE_LIMITED", () => {
      const err413 = mapearErrorSubida(413, "Payload Too Large");
      expect(err413.code).toBe("PAYLOAD_TOO_LARGE");

      const err429 = mapearErrorSubida(
        429,
        JSON.stringify({ error: "Límite por hora alcanzado." })
      );
      expect(err429.code).toBe("RATE_LIMITED");
      expect(err429.message).toBe("Límite por hora alcanzado.");
    });

    it("mapea 502/504 a UPLOAD_TIMEOUT", () => {
      expect(mapearErrorSubida(502, "").code).toBe("UPLOAD_TIMEOUT");
      expect(mapearErrorSubida(504, "").code).toBe("UPLOAD_TIMEOUT");
    });
  });

  describe("subirImagenImgBB", () => {
    it("devuelve string vacío si no recibe archivo", async () => {
      const url = await subirImagenImgBB(null);
      expect(url).toBe("");
    });

    it("rechaza con 'Inicia sesión para subir imágenes' si no hay usuario autenticado", async () => {
      mockAuth.currentUser = null;
      const fakeBlob = new Blob(["abc"], { type: "image/png" });
      await expect(subirImagenImgBB(fakeBlob)).rejects.toThrow(
        "Inicia sesión para subir imágenes"
      );
    });
  });
});
