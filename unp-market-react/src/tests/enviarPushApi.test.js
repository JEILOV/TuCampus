// src/tests/enviarPushApi.test.js
// ============================================================
//  TESTS UNITARIOS — api/enviar-push.js (FASE 4 - TAREA 3)
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  mockVerifyIdToken,
  mockSendEachForMulticast,
  estadoFirestore,
  mockFirestoreFn,
} = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  const mockSendEachForMulticast = vi.fn();
  const mockServerTimestamp = vi.fn(() => ({ _type: "serverTimestamp" }));
  const mockArrayRemove = vi.fn((...items) => ({ _type: "arrayRemove", items }));
  const estadoFirestore = {
    docs: new Map(), // path -> data
    updates: [], // { path, data }
    creates: [], // { path, data }
    whereCalls: [], // { collection, field, op, val, limit }
  };

  // Helper in-memory para simular colecciones/subcolecciones de Firestore Admin
  const crearDocRef = (path) => ({
    _path: path,
    get: vi.fn(async () => {
      const existe = estadoFirestore.docs.has(path);
      const datos = estadoFirestore.docs.get(path);
      return {
        exists: existe,
        id: path.split("/").pop(),
        data: () => datos,
      };
    }),
    create: vi.fn(async (data) => {
      if (estadoFirestore.docs.has(path)) {
        const err = new Error("ALREADY_EXISTS: Document already exists");
        err.code = 6;
        throw err;
      }
      estadoFirestore.docs.set(path, data);
      estadoFirestore.creates.push({ path, data });
    }),
    update: vi.fn(async (data) => {
      estadoFirestore.updates.push({ path, data });
    }),
    collection: (subcol) => crearCollectionRef(`${path}/${subcol}`),
  });

  const crearCollectionRef = (colPath) => ({
    doc: (id) => crearDocRef(`${colPath}/${id}`),
    where: (field, op, val) => ({
      limit: (max) => ({
        get: vi.fn(async () => {
          estadoFirestore.whereCalls.push({
            collection: colPath,
            field,
            op,
            val,
            limit: max,
          });
          const resultados = [];
          for (const [k, v] of estadoFirestore.docs.entries()) {
            const partes = k.split("/");
            if (
              partes.length === 2 &&
              partes[0] === colPath &&
              v?.[field] === val
            ) {
              resultados.push({
                id: partes[1],
                exists: true,
                data: () => v,
              });
            }
          }
          return { docs: resultados.slice(0, max) };
        }),
      }),
    }),
  });

  const mockFirestoreFn = Object.assign(
    () => ({
      collection: (name) => crearCollectionRef(name),
    }),
    {
      FieldValue: {
        serverTimestamp: mockServerTimestamp,
        arrayRemove: mockArrayRemove,
      },
    }
  );

  return {
    mockVerifyIdToken,
    mockSendEachForMulticast,
    mockServerTimestamp,
    mockArrayRemove,
    estadoFirestore,
    mockFirestoreFn,
  };
});

vi.mock("firebase-admin", () => ({
  default: {
    apps: [{}],
    initializeApp: vi.fn(),
    credential: { cert: vi.fn() },
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
    firestore: mockFirestoreFn,
    messaging: () => ({
      sendEachForMulticast: mockSendEachForMulticast,
    }),
  },
}));

import handler from "../../api/enviar-push.js";

const crearRes = () => ({
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
});

describe("api/enviar-push.js (TAREA 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estadoFirestore.docs.clear();
    estadoFirestore.updates.length = 0;
    estadoFirestore.creates.length = 0;
    estadoFirestore.whereCalls.length = 0;

    // Por defecto: remitente autenticado UNP
    mockVerifyIdToken.mockResolvedValue({
      uid: "uid-remitente",
      email: "0512023070@alumnos.unp.edu.pe",
      email_verified: true,
    });

    // Perfil del remitente en servidor
    estadoFirestore.docs.set("usuarios/uid-remitente", {
      nombre: "Carlos Remitente",
      avatar: "https://i.ibb.co/avatar-carlos.png",
      universidadId: "unp",
    });

    // Perfil de un destinatario con token
    estadoFirestore.docs.set("usuarios/uid-destinatario", {
      nombre: "Ana Destinataria",
      fcmToken: ["token-ana-1"],
      bloqueados: [],
      universidadId: "unp",
    });

    // Respuesta FCM por defecto: éxito
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
  });

  it("sin token devuelve 401", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-1" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("con correo externo (@gmail.com) devuelve 403", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "uid-externo",
      email: "intruso@gmail.com",
      email_verified: true,
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-gmail" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-1" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("body con formato viejo (tokens, titulo, cuerpo) devuelve 400", async () => {
    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: {
        tokens: ["token-ajeno"],
        titulo: "Falso",
        cuerpo: "Spam",
      },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("con tipo desconocido devuelve 400", async () => {
    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "sorteo_falso", id: "123" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("mensaje válido propio → 200, envía con título del perfil del servidor al token del otro participante", async () => {
    estadoFirestore.docs.set("chats/chat-1", {
      participantes: ["uid-remitente", "uid-destinatario"],
    });
    estadoFirestore.docs.set("chats/chat-1/mensajes/msg-1", {
      deUid: "uid-remitente",
      texto: "Hola Ana, ¿sigue disponible la calculadora?",
      tipo: "texto",
      fecha: { toMillis: () => Date.now() - 5000 },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-1" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ successCount: 1, failureCount: 0 });

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const llamada = mockSendEachForMulticast.mock.calls[0][0];
    expect(llamada.tokens).toEqual(["token-ana-1"]);
    expect(llamada.data).toEqual({
      url: "/chat?id=chat-1",
      title: "Carlos Remitente",
      body: "Hola Ana, ¿sigue disponible la calculadora?",
      icon: "https://i.ibb.co/avatar-carlos.png",
    });
  });

  it("mensaje ajeno (deUid !== uid) devuelve 403", async () => {
    estadoFirestore.docs.set("chats/chat-1", {
      participantes: ["uid-remitente", "uid-destinatario"],
    });
    estadoFirestore.docs.set("chats/chat-1/mensajes/msg-ajeno", {
      deUid: "uid-destinatario",
      texto: "Mensaje escrito por Ana",
      tipo: "texto",
      fecha: { toMillis: () => Date.now() - 2000 },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-ajeno" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("chat donde el llamador no participa devuelve 403", async () => {
    estadoFirestore.docs.set("chats/chat-privado", {
      participantes: ["uid-otro-1", "uid-destinatario"],
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-privado", mensajeId: "msg-1" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("mensaje viejo (> 2 minutos) devuelve 400", async () => {
    estadoFirestore.docs.set("chats/chat-1", {
      participantes: ["uid-remitente", "uid-destinatario"],
    });
    estadoFirestore.docs.set("chats/chat-1/mensajes/msg-viejo", {
      deUid: "uid-remitente",
      texto: "Mensaje de hace 10 minutos",
      tipo: "texto",
      fecha: { toMillis: () => Date.now() - 10 * 60 * 1000 },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-viejo" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("destinatario que bloqueó al remitente → no envía a ese usuario (200 con omitido: true)", async () => {
    estadoFirestore.docs.set("usuarios/uid-destinatario", {
      nombre: "Ana Destinataria",
      fcmToken: ["token-ana-1"],
      bloqueados: ["uid-remitente"],
    });
    estadoFirestore.docs.set("chats/chat-1", {
      participantes: ["uid-remitente", "uid-destinatario"],
    });
    estadoFirestore.docs.set("chats/chat-1/mensajes/msg-1", {
      deUid: "uid-remitente",
      texto: "Hola",
      tipo: "texto",
      fecha: { toMillis: () => Date.now() - 1000 },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-1" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ omitido: true });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("segunda llamada con el mismo mensajeId → 200 { duplicado: true } sin volver a llamar a FCM", async () => {
    estadoFirestore.docs.set("chats/chat-1", {
      participantes: ["uid-remitente", "uid-destinatario"],
    });
    estadoFirestore.docs.set("chats/chat-1/mensajes/msg-dup", {
      deUid: "uid-remitente",
      texto: "Hola una vez",
      tipo: "texto",
      fecha: { toMillis: () => Date.now() - 1000 },
    });

    const req1 = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-dup" },
    };
    const res1 = crearRes();
    await handler(req1, res1);
    expect(res1.statusCode).toBe(200);
    expect(res1.body).toEqual({ successCount: 1, failureCount: 0 });
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);

    // Segunda llamada idéntica
    const req2 = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-dup" },
    };
    const res2 = crearRes();
    await handler(req2, res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toEqual({ duplicado: true });
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
  });

  it("reseña válida → 200 y envía al vendedor con el puntaje leído de Firestore", async () => {
    estadoFirestore.docs.set("resenas/uid-remitente_uid-destinatario", {
      autorUid: "uid-remitente",
      vendedorUid: "uid-destinatario",
      estrellas: 5,
      fecha: { toMillis: () => Date.now() - 3000 },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "resena", vendedorUid: "uid-destinatario" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ successCount: 1, failureCount: 0 });
    const llamada = mockSendEachForMulticast.mock.calls[0][0];
    expect(llamada.tokens).toEqual(["token-ana-1"]);
    expect(llamada.data).toEqual({
      url: "/vendedor?uid=uid-destinatario",
      title: "⭐ Nueva calificación",
      body: "Carlos Remitente te calificó con 5 ⭐",
      icon: "https://i.ibb.co/avatar-carlos.png",
    });
  });

  it("producto válido → consulta por universidadId con limit(300), excluye al dueño y a quienes lo bloquearon", async () => {
    estadoFirestore.docs.set("productos/prod-100", {
      userUid: "uid-remitente",
      universidadId: "unp",
      titulo: "Laptop Lenovo IdeaPad",
      imagenes: ["https://i.ibb.co/laptop.webp"],
      fecha: { toMillis: () => Date.now() - 10000 },
    });

    // Otro estudiante de la misma sede que bloqueó al remitente
    estadoFirestore.docs.set("usuarios/uid-bloqueador", {
      nombre: "Luis",
      universidadId: "unp",
      fcmToken: ["token-luis-bloqueador"],
      bloqueados: ["uid-remitente"],
    });

    // Estudiante de otra sede (no debe entrar en el where)
    estadoFirestore.docs.set("usuarios/uid-ucv", {
      nombre: "Lucía UCV",
      universidadId: "ucv",
      fcmToken: ["token-lucia-ucv"],
      bloqueados: [],
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "producto", productoId: "prod-100" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(estadoFirestore.whereCalls).toEqual([
      {
        collection: "usuarios",
        field: "universidadId",
        op: "==",
        val: "unp",
        limit: 300,
      },
    ]);

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    const llamada = mockSendEachForMulticast.mock.calls[0][0];
    // Solo llega a uid-destinatario (excluye uid-remitente y uid-bloqueador)
    expect(llamada.tokens).toEqual(["token-ana-1"]);
    expect(llamada.data).toEqual({
      url: "/producto?id=prod-100",
      title: "🛍️ Nuevo producto en tu campus",
      body: "Laptop Lenovo IdeaPad",
      image: "https://i.ibb.co/laptop.webp",
    });
  });

  it("tokens inválidos devueltos por FCM se limpian en el servidor con arrayRemove y NO aparecen en la respuesta JSON", async () => {
    estadoFirestore.docs.set("usuarios/uid-destinatario", {
      nombre: "Ana Destinataria",
      fcmToken: ["token-valido", "token-vencido"],
      bloqueados: [],
    });
    estadoFirestore.docs.set("chats/chat-1", {
      participantes: ["uid-remitente", "uid-destinatario"],
    });
    estadoFirestore.docs.set("chats/chat-1/mensajes/msg-clean", {
      deUid: "uid-remitente",
      texto: "Probando limpieza de tokens",
      tipo: "texto",
      fecha: { toMillis: () => Date.now() - 1000 },
    });

    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
      ],
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer token-ok" },
      body: { tipo: "mensaje", chatId: "chat-1", mensajeId: "msg-clean" },
    };
    const res = crearRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      successCount: 1,
      failureCount: 1,
    });
    expect(res.body.tokensInvalidos).toBeUndefined();

    expect(estadoFirestore.updates).toHaveLength(1);
    expect(estadoFirestore.updates[0]).toEqual({
      path: "usuarios/uid-destinatario",
      data: {
        fcmToken: {
          _type: "arrayRemove",
          items: ["token-vencido"],
        },
      },
    });
  });
});
