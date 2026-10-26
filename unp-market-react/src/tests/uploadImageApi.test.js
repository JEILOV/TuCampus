// src/tests/uploadImageApi.test.js
// ============================================================
//  TESTS UNITARIOS — api/upload-image.js (FASE 4 - TAREA 2)
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  mockVerifyIdToken,
  mockRunTransaction,
  mockTxGet,
  mockTxSet,
  mockDoc,
  mockCollection,
} = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockRunTransaction: vi.fn(),
  mockTxGet: vi.fn(),
  mockTxSet: vi.fn(),
  mockDoc: vi.fn((id) => ({ _id: id })),
  mockCollection: vi.fn(() => ({ doc: (id) => mockDoc(id) })),
}));

vi.mock("firebase-admin", () => ({
  default: {
    apps: [{}],
    initializeApp: vi.fn(),
    credential: { cert: vi.fn() },
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
    firestore: () => ({
      collection: mockCollection,
      runTransaction: mockRunTransaction,
    }),
  },
}));

import handler, {
  MAX_BASE64_CHARS,
  MAX_SUBIDAS_POR_HORA,
} from "../../api/upload-image.js";

// Helper para crear un objeto `res` estilo Vercel/Express
const crearRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

// Base64 válido con firma mágica PNG (89 50 4E 47 0D 0A 1A 0A + bytes extra)
const PNG_VALIDO_BASE64 = globalThis.Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]).toString("base64");

describe("api/upload-image.js (TAREA 2)", () => {
  const originalEnv = globalThis.process.env.IMGBB_API_KEY;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.process.env.IMGBB_API_KEY = "clave-secreta-imgbb-test";
    vi.stubGlobal("fetch", mockFetch);

    // Por defecto: usuario UNP autenticado y verificado
    mockVerifyIdToken.mockResolvedValue({
      uid: "uid-estudiante-1",
      email: "0512023070@alumnos.unp.edu.pe",
      email_verified: true,
    });

    // Por defecto: transacción de rate limit debajo del tope
    mockTxGet.mockResolvedValue({
      exists: false,
      data: () => null,
    });
    mockRunTransaction.mockImplementation(async (cb) =>
      cb({ get: mockTxGet, set: mockTxSet })
    );

    // Por defecto: ImgBB responde 200 con url
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { url: "https://i.ibb.co/test/foto.png" },
      }),
    });
  });

  afterEach(() => {
    globalThis.process.env.IMGBB_API_KEY = originalEnv;
    vi.unstubAllGlobals();
  });

  it("sin token devuelve 401 y no llama a ImgBB", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { imageBase64: PNG_VALIDO_BASE64 },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("con token sin verificar devuelve 403", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "uid-estudiante-1",
      email: "0512023070@alumnos.unp.edu.pe",
      email_verified: false,
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-no-verificado" },
      body: { imageBase64: PNG_VALIDO_BASE64 },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("con PNG válido devuelve 200 con url y envía la API key en el body (no en la URL)", async () => {
    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { imageBase64: `data:image/png;base64,${PNG_VALIDO_BASE64}` },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: "https://i.ibb.co/test/foto.png" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [urlLlamada, opciones] = mockFetch.mock.calls[0];
    expect(urlLlamada).toBe("https://api.imgbb.com/1/upload");
    expect(urlLlamada).not.toContain("key=");
    expect(urlLlamada).not.toContain("clave-secreta-imgbb-test");

    const params = new URLSearchParams(opciones.body);
    expect(params.get("key")).toBe("clave-secreta-imgbb-test");
    expect(params.get("image")).toBe(PNG_VALIDO_BASE64);
  });

  it("con firma mágica inválida (texto plano en base64) devuelve 400", async () => {
    const textoEnBase64 = globalThis.Buffer.from(
      "Hola mundo esto es un script o texto plano no una imagen"
    ).toString("base64");

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { imageBase64: textoEnBase64 },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "El archivo no es una imagen válida" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("con imagen demasiado grande (> 3_500_000 chars) devuelve 413 PAYLOAD_TOO_LARGE", async () => {
    expect(MAX_BASE64_CHARS).toBe(3_500_000);
    const gigante = "A".repeat(3_500_004);
    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { imageBase64: gigante },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("con límite por hora excedido (>= 60 en la última hora) devuelve 429", async () => {
    mockTxGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        inicio: Date.now() - 10 * 60 * 1000, // hace 10 min
        conteo: MAX_SUBIDAS_POR_HORA,
      }),
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { imageBase64: PNG_VALIDO_BASE64 },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe("RATE_LIMITED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("si Firestore falla al verificar el rate limit (fail open), permite subir igual (200)", async () => {
    const spyError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRunTransaction.mockRejectedValueOnce(
      new Error("Firestore temporalmente caído")
    );

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { imageBase64: PNG_VALIDO_BASE64 },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: "https://i.ibb.co/test/foto.png" });
    spyError.mockRestore();
  });

  it("ante un error 500 inesperado NO expone err.message ni campo detalle", async () => {
    const spyError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(
      new Error("ECONNRESET detalle interno sensible del socket")
    );

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { imageBase64: PNG_VALIDO_BASE64 },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.detalle).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("ECONNRESET");
    spyError.mockRestore();
  });
});
