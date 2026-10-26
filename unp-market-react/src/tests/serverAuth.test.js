// src/tests/serverAuth.test.js
// ============================================================
//  TESTS UNITARIOS — lib/serverAuth.js (FASE 4 - TAREA 0)
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockVerifyIdToken, mockInitializeApp, mockCert, mockApps } = vi.hoisted(
  () => ({
    mockVerifyIdToken: vi.fn(),
    mockInitializeApp: vi.fn(),
    mockCert: vi.fn((cfg) => cfg),
    mockApps: [],
  })
);

vi.mock("firebase-admin", () => ({
  default: {
    get apps() {
      return mockApps;
    },
    initializeApp: (...args) => {
      mockApps.push({});
      return mockInitializeApp(...args);
    },
    credential: {
      cert: mockCert,
    },
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

import {
  obtenerAdmin,
  DOMINIOS_PERMITIDOS,
  esEmailInstitucional,
  autenticarEstudiante,
} from "../../lib/serverAuth";

describe("lib/serverAuth.js", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApps.length = 0;
  });

  describe("DOMINIOS_PERMITIDOS y esEmailInstitucional", () => {
    it("incluye los tres dominios institucionales configurados", () => {
      expect(DOMINIOS_PERMITIDOS).toEqual([
        "alumnos.unp.edu.pe",
        "ucvvirtual.edu.pe",
        "utp.edu.pe",
      ]);
    });

    it("acepta correos válidos y rechaza dominios externos o malformados", () => {
      expect(esEmailInstitucional("0512023070@alumnos.unp.edu.pe")).toBe(true);
      expect(esEmailInstitucional("ALUMNO@UCVVIRTUAL.EDU.PE")).toBe(true);
      expect(esEmailInstitucional("u12345@utp.edu.pe")).toBe(true);
      expect(esEmailInstitucional("usuario@gmail.com")).toBe(false);
      expect(esEmailInstitucional("falso@malicioso-alumnos.unp.edu.pe")).toBe(false);
      expect(esEmailInstitucional("@alumnos.unp.edu.pe")).toBe(false);
      expect(esEmailInstitucional("")).toBe(false);
      expect(esEmailInstitucional(null)).toBe(false);
    });
  });

  describe("obtenerAdmin", () => {
    it("inicializa firebase-admin una sola vez", () => {
      obtenerAdmin();
      obtenerAdmin();
      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    });
  });

  describe("autenticarEstudiante", () => {
    it("sin header Authorization devuelve 401", async () => {
      const res = await autenticarEstudiante({ headers: {} });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
      expect(typeof res.error).toBe("string");
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it("con token inválido o expirado devuelve 401 sin filtrar detalles internos", async () => {
      mockVerifyIdToken.mockRejectedValueOnce(
        new Error("Firebase ID token has expired at 123456")
      );

      const res = await autenticarEstudiante({
        headers: { authorization: "Bearer token-invalido" },
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
      expect(res.error).not.toContain("123456");
    });

    it("con email_verified: false devuelve 403", async () => {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: "uid-1",
        email: "0512023070@alumnos.unp.edu.pe",
        email_verified: false,
      });

      const res = await autenticarEstudiante({
        headers: { authorization: "Bearer token-sin-verificar" },
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(403);
    });

    it("con dominio no permitido devuelve 403", async () => {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: "uid-atacante",
        email: "atacante@gmail.com",
        email_verified: true,
      });

      const res = await autenticarEstudiante({
        headers: { authorization: "Bearer token-gmail" },
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(403);
    });

    it("con dominio permitido en mayúsculas devuelve ok: true y email normalizado", async () => {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: "uid-ucv",
        email: "Estudiante@UCVVIRTUAL.EDU.PE",
        email_verified: true,
      });

      const res = await autenticarEstudiante({
        headers: { authorization: "Bearer token-ucv" },
      });

      expect(res).toEqual({
        ok: true,
        uid: "uid-ucv",
        email: "estudiante@ucvvirtual.edu.pe",
      });
    });

    it("con token válido devuelve ok: true con uid y email", async () => {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: "uid-unp-123",
        email: "0512023070@alumnos.unp.edu.pe",
        email_verified: true,
      });

      const res = await autenticarEstudiante({
        headers: { authorization: "Bearer token-valido" },
      });

      expect(res).toEqual({
        ok: true,
        uid: "uid-unp-123",
        email: "0512023070@alumnos.unp.edu.pe",
      });
    });
  });
});
