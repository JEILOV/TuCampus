// src/tests/chatService.test.js
// ============================================================
//  TESTS UNITARIOS — chatService.js (R04: obtenerOCrearChat)
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetAllMocks,
  mockGetDoc,
  mockRunTransaction,
  mockTxGet,
  mockTxSet,
  mockTxUpdate,
} from "./__mocks__/firebase";
import { generarChatId, obtenerOCrearChat, editarMensaje, fusionarMensajes } from "../services/chatService";

describe("generarChatId", () => {
  it("ordena lexicográficamente los UIDs y cumple chatId == participantes[0] + '_' + participantes[1]", () => {
    const id1 = generarChatId("uid_z", "uid_a");
    const id2 = generarChatId("uid_a", "uid_z");
    expect(id1).toBe("uid_a_uid_z");
    expect(id2).toBe("uid_a_uid_z");
  });
});

describe("obtenerOCrearChat (R04)", () => {
  beforeEach(() => {
    resetAllMocks();
    // Lecturas de obtenerInfoPerfilReal (fuera de la transacción)
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref._id === "uid_comprador") {
        return { exists: () => true, data: () => ({ nombre: "Ana Compradora", avatar: "https://img/ana.jpg" }) };
      }
      if (ref._id === "uid_vendedor") {
        return { exists: () => true, data: () => ({ nombre: "Luis Vendedor", avatar: "https://img/luis.jpg" }) };
      }
      return { exists: () => false, data: () => ({}) };
    });
  });

  it("crea un chat nuevo una sola vez dentro de runTransaction con participantes ordenados", async () => {
    mockTxGet.mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    });

    const res = await obtenerOCrearChat("uid_vendedor", "uid_comprador", {
      productoId: "prod-1",
      productoTitulo: "Calculadora Casio",
      productoPrecio: 45,
      productoImagen: "https://img/calc.jpg",
    });

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxGet).toHaveBeenCalledTimes(1);
    expect(mockTxSet).toHaveBeenCalledTimes(1);
    expect(mockTxUpdate).not.toHaveBeenCalled();

    const [, payloadSet] = mockTxSet.mock.calls[0];
    expect(payloadSet.participantes).toEqual(["uid_comprador", "uid_vendedor"]);
    expect(res.id).toBe(`${payloadSet.participantes[0]}_${payloadSet.participantes[1]}`);
    expect(payloadSet.ultimoMensaje).toBe("");
    expect(payloadSet.noLeidoPor).toEqual({ uid_comprador: 0, uid_vendedor: 0 });
    expect(payloadSet.productoReferencia).toEqual({
      id: "prod-1",
      titulo: "Calculadora Casio",
      precio: 45,
      imagenUrl: "https://img/calc.jpg",
    });
  });

  it("NO reinicializa un chat existente (conserva ultimoMensaje y noLeidoPor intactos)", async () => {
    const datosExistentes = {
      participantes: ["uid_comprador", "uid_vendedor"],
      participantesInfo: {
        uid_comprador: { nombre: "Nombre Viejo", avatar: "" },
        uid_vendedor: { nombre: "Luis Vendedor", avatar: "" },
      },
      productoId: "prod-viejo",
      productoTitulo: "Producto Viejo",
      productoImagen: "https://img/viejo.jpg",
      productoReferencia: {
        id: "prod-viejo",
        titulo: "Producto Viejo",
        precio: 20,
        imagenUrl: "https://img/viejo.jpg",
      },
      ultimoMensaje: "Hola, ¿sigue disponible?",
      ultimoMensajeDeUid: "uid_comprador",
      ultimoMensajeLeido: false,
      noLeidoPor: { uid_comprador: 0, uid_vendedor: 3 },
    };

    mockTxGet.mockResolvedValueOnce({
      exists: () => true,
      data: () => datosExistentes,
    });

    const res = await obtenerOCrearChat("uid_comprador", "uid_vendedor", {
      productoId: "prod-nuevo",
      productoTitulo: "Libro de Cálculo",
      productoPrecio: 30,
      productoImagen: "https://img/libro.jpg",
    });

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxSet).not.toHaveBeenCalled();
    expect(mockTxUpdate).toHaveBeenCalledTimes(1);

    const [, payloadUpdate] = mockTxUpdate.mock.calls[0];
    expect(payloadUpdate).not.toHaveProperty("ultimoMensaje");
    expect(payloadUpdate).not.toHaveProperty("noLeidoPor");
    expect(payloadUpdate.productoId).toBe("prod-nuevo");

    // El retorno conserva los datos reales de mensajes y noLeidoPor
    expect(res.ultimoMensaje).toBe("Hola, ¿sigue disponible?");
    expect(res.noLeidoPor).toEqual({ uid_comprador: 0, uid_vendedor: 3 });
    expect(res.productoId).toBe("prod-nuevo");
    expect(res.participantesInfo.uid_comprador.nombre).toBe("Ana Compradora");
  });

  it("si falla el refresco de contexto de un chat existente, NO devuelve campos no guardados", async () => {
    const datosExistentes = {
      participantes: ["uid_comprador", "uid_vendedor"],
      participantesInfo: {
        uid_comprador: { nombre: "Ana Antes", avatar: "" },
        uid_vendedor: { nombre: "Luis Antes", avatar: "" },
      },
      productoId: "prod-original",
      productoTitulo: "Producto Original",
      productoImagen: "https://img/orig.jpg",
      productoReferencia: {
        id: "prod-original",
        titulo: "Producto Original",
        precio: 15,
        imagenUrl: "https://img/orig.jpg",
      },
      ultimoMensaje: "Nos vemos en la biblioteca",
      noLeidoPor: { uid_comprador: 1, uid_vendedor: 0 },
    };

    mockTxGet.mockResolvedValueOnce({
      exists: () => true,
      data: () => datosExistentes,
    });
    mockTxUpdate.mockImplementationOnce(() => {
      throw new Error("Simulated update failure");
    });

    const res = await obtenerOCrearChat("uid_comprador", "uid_vendedor", {
      productoId: "prod-fallido",
      productoTitulo: "Producto No Guardado",
      productoPrecio: 99,
      productoImagen: "https://img/no-guardado.jpg",
    });

    // Devuelve exactamente los datos reales leídos, sin los campos ficticios que fallaron al guardarse
    expect(res.id).toBe("uid_comprador_uid_vendedor");
    expect(res.productoId).toBe("prod-original");
    expect(res.productoTitulo).toBe("Producto Original");
    expect(res.participantesInfo.uid_comprador.nombre).toBe("Ana Antes");
    expect(res.ultimoMensaje).toBe("Nos vemos en la biblioteca");
    expect(res.noLeidoPor).toEqual({ uid_comprador: 1, uid_vendedor: 0 });
  });
});

describe("editarMensaje (H08)", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("editar el último mensaje actualiza el mensaje y también ultimoMensaje del chat", async () => {
    const tsComun = { seconds: 1700000100, nanoseconds: 500000 };
    mockTxGet
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ deUid: "uid_yo", tipo: "texto", texto: "Texto viejo", fecha: tsComun }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ultimoMensaje: "Texto viejo",
          ultimoMensajeDeUid: "uid_yo",
          ultimoMensajeFecha: { seconds: 1700000100, nanoseconds: 500000 },
        }),
      });

    await editarMensaje("uid_otro_uid_yo", "msg-1", "uid_yo", "Texto corregido");

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxUpdate).toHaveBeenCalledTimes(2);

    const [refMsg, payloadMsg] = mockTxUpdate.mock.calls[0];
    expect(refMsg).toEqual({ _col: "chats", _id: "uid_otro_uid_yo", _subpath: ["mensajes", "msg-1"] });
    expect(payloadMsg).toEqual({
      texto: "Texto corregido",
      editado: true,
      fechaEdicion: { _type: "serverTimestamp" },
    });

    const [refChat, payloadChat] = mockTxUpdate.mock.calls[1];
    expect(refChat).toEqual({ _col: "chats", _id: "uid_otro_uid_yo" });
    expect(payloadChat).toEqual({ ultimoMensaje: "Texto corregido" });
  });

  it("editar un mensaje anterior NO toca el documento del chat", async () => {
    mockTxGet
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          deUid: "uid_yo",
          tipo: "texto",
          texto: "Mensaje antiguo",
          fecha: { seconds: 1700000000, nanoseconds: 0 },
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ultimoMensaje: "Mensaje más reciente",
          ultimoMensajeDeUid: "uid_yo",
          ultimoMensajeFecha: { seconds: 1700000200, nanoseconds: 0 },
        }),
      });

    await editarMensaje("uid_otro_uid_yo", "msg-antiguo", "uid_yo", "Mensaje antiguo editado");

    expect(mockTxUpdate).toHaveBeenCalledTimes(1);
    const [refMsg] = mockTxUpdate.mock.calls[0];
    expect(refMsg).toEqual({
      _col: "chats",
      _id: "uid_otro_uid_yo",
      _subpath: ["mensajes", "msg-antiguo"],
    });
  });

  it("trunca el preview de ultimoMensaje a 120 caracteres terminando en '...' cuando el texto supera 120", async () => {
    const tsComun = {
      isEqual: (otro) => otro?.id === "ts-1",
      id: "ts-1",
    };
    mockTxGet
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ deUid: "uid_yo", tipo: "texto", texto: "Corto", fecha: tsComun }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          ultimoMensaje: "Corto",
          ultimoMensajeDeUid: "uid_yo",
          ultimoMensajeFecha: tsComun,
        }),
      });

    const textoLargo = "x".repeat(150);
    await editarMensaje("uid_otro_uid_yo", "msg-largo", "uid_yo", textoLargo);

    expect(mockTxUpdate).toHaveBeenCalledTimes(2);
    const [, payloadChat] = mockTxUpdate.mock.calls[1];
    expect(payloadChat.ultimoMensaje.length).toBe(120);
    expect(payloadChat.ultimoMensaje).toBe("x".repeat(117) + "...");
  });

  it("lanza error sin escribir si el texto está vacío o supera 1000 caracteres", async () => {
    await expect(editarMensaje("chat-1", "msg-1", "uid_yo", "   ")).rejects.toThrow(
      "El mensaje no puede quedar vacío."
    );
    await expect(editarMensaje("chat-1", "msg-1", "uid_yo", "a".repeat(1001))).rejects.toThrow(
      "El mensaje es demasiado largo."
    );
    expect(mockRunTransaction).not.toHaveBeenCalled();
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });
});

describe("fusionarMensajes (H07)", () => {
  it("(a) maneja listas vacías devolviendo arreglo vacío", () => {
    expect(fusionarMensajes([], [])).toEqual([]);
    expect(fusionarMensajes([], [{ id: "m1", texto: "Hola", fecha: { seconds: 10, nanoseconds: 0 } }])).toEqual([
      { id: "m1", texto: "Hola", fecha: { seconds: 10, nanoseconds: 0 } },
    ]);
  });

  it("(b) en IDs repetidos gana el mensaje nuevo (ej. edición o marcado como leído)", () => {
    const previos = [
      { id: "m1", texto: "Original", leido: false, fecha: { seconds: 10, nanoseconds: 0 } },
      { id: "m2", texto: "Segundo", leido: false, fecha: { seconds: 20, nanoseconds: 0 } },
    ];
    const nuevos = [
      { id: "m1", texto: "Editado", editado: true, leido: true, fecha: { seconds: 10, nanoseconds: 0 } },
    ];

    const res = fusionarMensajes(previos, nuevos);
    expect(res).toHaveLength(2);
    expect(res[0]).toEqual({
      id: "m1",
      texto: "Editado",
      editado: true,
      leido: true,
      fecha: { seconds: 10, nanoseconds: 0 },
    });
  });

  it("(c) ventana deslizante de 40 + llegada del mensaje 41 conserva el primer mensaje (total 41)", () => {
    const primeros40 = Array.from({ length: 40 }, (_, i) => ({
      id: `msg-${i + 1}`,
      texto: `Mensaje ${i + 1}`,
      fecha: { seconds: 1000 + i, nanoseconds: 0 },
    }));
    // El nuevo snapshot de limitToLast(40) trae del 2 al 41
    const ventana2a41 = Array.from({ length: 40 }, (_, i) => ({
      id: `msg-${i + 2}`,
      texto: `Mensaje ${i + 2}`,
      fecha: { seconds: 1001 + i, nanoseconds: 0 },
    }));

    const res = fusionarMensajes(primeros40, ventana2a41);
    expect(res).toHaveLength(41);
    expect(res[0].id).toBe("msg-1");
    expect(res[40].id).toBe("msg-41");
  });

  it("(d) trata los mensajes con fecha null (serverTimestamp pendiente) como los más recientes al final", () => {
    const previos = [
      { id: "m2", texto: "Dos", fecha: { seconds: 200, nanoseconds: 0 } },
      { id: "m1", texto: "Uno", fecha: { seconds: 100, nanoseconds: 0 } },
    ];
    const nuevos = [
      { id: "m3", texto: "Pendiente", fecha: null },
    ];

    const res = fusionarMensajes(previos, nuevos);
    expect(res.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("(e) no muta los arreglos de entrada", () => {
    const previos = [
      { id: "m2", texto: "B", fecha: { seconds: 20, nanoseconds: 0 } },
      { id: "m1", texto: "A", fecha: { seconds: 10, nanoseconds: 0 } },
    ];
    const nuevos = [
      { id: "m3", texto: "C", fecha: { seconds: 30, nanoseconds: 0 } },
    ];
    const copiaPrevios = [...previos];
    const copiaNuevos  = [...nuevos];

    const res = fusionarMensajes(previos, nuevos);
    expect(previos).toEqual(copiaPrevios);
    expect(nuevos).toEqual(copiaNuevos);
    expect(res).not.toBe(previos);
    expect(res).not.toBe(nuevos);
  });
});
