// src/tests/pushService.test.js
// ============================================================
//  TESTS UNITARIOS — src/services/pushService.js (FASE 4 - TAREA 4)
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { mockAuth, mockLogError } = vi.hoisted(() => ({
  mockAuth: { currentUser: null },
  mockLogError: vi.fn(),
}));

vi.mock("../services/firebase", () => ({
  auth: mockAuth,
  db: {},
  app: {},
}));

vi.mock("../utils/errorHandler", () => ({
  logError: mockLogError,
}));

import { solicitarPush } from "../services/pushService";

describe("pushService.solicitarPush (TAREA 4)", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockAuth.currentUser = {
      uid: "uid-1",
      getIdToken: vi.fn().mockResolvedValue("token-firebase-123"),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve null sin hacer fetch si no se envía tipo", async () => {
    const res = await solicitarPush({});
    expect(res).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("devuelve null sin hacer fetch si no hay sesión activa", async () => {
    mockAuth.currentUser = null;
    const res = await solicitarPush({
      tipo: "mensaje",
      chatId: "c1",
      mensajeId: "m1",
    });
    expect(res).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("envía POST /api/enviar-push con Authorization Bearer y { tipo, ...referencias }", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ successCount: 1, failureCount: 0 }),
    });

    const res = await solicitarPush({
      tipo: "mensaje",
      chatId: "chat-abc",
      mensajeId: "msg-xyz",
    });

    expect(res).toEqual({ successCount: 1, failureCount: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/enviar-push");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token-firebase-123",
    });
    expect(JSON.parse(opts.body)).toEqual({
      tipo: "mensaje",
      chatId: "chat-abc",
      mensajeId: "msg-xyz",
    });
  });

  it("es fire-and-forget: si el endpoint falla devuelve null y registra logError sin lanzar", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const res = await solicitarPush({
      tipo: "producto",
      productoId: "prod-1",
    });

    expect(res).toBeNull();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
