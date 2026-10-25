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
import { generarChatId, obtenerOCrearChat } from "../services/chatService";

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
