// src/tests/reviewService.test.js
// ============================================================
//  TESTS UNITARIOS — reviewService.js (H03: sumaEstrellas sin deriva)
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetAllMocks,
  mockGetDocs,
  mockRunTransaction,
  mockTxGet,
  mockTxSet,
  mockTxUpdate,
  makeQuerySnap,
} from "./__mocks__/firebase";

vi.mock("../services/notificationService", () => ({
  notificarNuevaResena: vi.fn(),
}));

import {
  calcularAgregadoResena,
  guardarOActualizarResena,
} from "../services/reviewService";

describe("calcularAgregadoResena (H03)", () => {
  it("la secuencia [1, 1, 2, 1] produce sumaEstrellas = 5, totalResenas = 4 y calificacionPromedio = 1.3 (no 1.2)", () => {
    const secuencia = [1, 1, 2, 1];
    let estado = { sumaEstrellas: 0, totalResenas: 0, calificacionPromedio: 0 };

    for (const puntaje of secuencia) {
      estado = calcularAgregadoResena({
        sumaPrev: estado.sumaEstrellas,
        totalPrev: estado.totalResenas,
        esNueva: true,
        puntaje,
      });
    }

    expect(estado).toEqual({
      sumaEstrellas: 5,
      totalResenas: 4,
      calificacionPromedio: 1.3,
    });
  });

  it("edición de reseña de 1 -> 5 estrellas mantiene totalResenas y suma +4 a sumaEstrellas", () => {
    const resultado = calcularAgregadoResena({
      sumaPrev: 5,
      totalPrev: 4,
      esNueva: false,
      estrellasPrevias: 1,
      puntaje: 5,
    });

    expect(resultado).toEqual({
      sumaEstrellas: 9,
      totalResenas: 4,
      calificacionPromedio: 2.3,
    });
  });

  it("primera reseña cuando totalPrev es 0 inicializa sumaEstrellas y totalResenas = 1", () => {
    const resultado = calcularAgregadoResena({
      sumaPrev: 0,
      totalPrev: 0,
      esNueva: true,
      puntaje: 4,
    });

    expect(resultado).toEqual({
      sumaEstrellas: 4,
      totalResenas: 1,
      calificacionPromedio: 4,
    });
  });

  it("nunca usa el promedio redondeado para reconstruir la suma (usa exclusivamente sumaPrev)", () => {
    // Tras [1, 1, 2], suma real = 4, total = 3, promedio redondeado = 1.3.
    // Si se reconstruyera con 1.3 * 3 = 3.9, al sumar 1 daría 4.9 / 4 = 1.225 -> 1.2.
    // Con sumaPrev = 4, da (4 + 1) / 4 = 1.25 -> 1.3.
    const trasTres = calcularAgregadoResena({
      sumaPrev: 2,
      totalPrev: 2,
      esNueva: true,
      puntaje: 2,
    });
    expect(trasTres).toEqual({
      sumaEstrellas: 4,
      totalResenas: 3,
      calificacionPromedio: 1.3,
    });

    const trasCuatro = calcularAgregadoResena({
      sumaPrev: trasTres.sumaEstrellas,
      totalPrev: trasTres.totalResenas,
      esNueva: true,
      puntaje: 1,
    });
    expect(trasCuatro).toEqual({
      sumaEstrellas: 5,
      totalResenas: 4,
      calificacionPromedio: 1.3,
    });
  });
});

describe("guardarOActualizarResena — transacción con mocks (H03)", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("escribe sumaEstrellas (entero), totalResenas y calificacionPromedio en el doc del vendedor y actualiza sus productos", async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeQuerySnap([{ id: "prod-1", data: { titulo: "Libro" } }])
    );

    // 1ra llamada a tx.get: resenaRef (no existe -> nueva)
    // 2da llamada a tx.get: vendedorRef (tiene sumaEstrellas: 4, totalResenas: 3, calificacionPromedio: 1.3)
    mockTxGet
      .mockResolvedValueOnce({ exists: () => false, data: () => null })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          sumaEstrellas: 4,
          totalResenas: 3,
          calificacionPromedio: 1.3,
        }),
      });

    const res = await guardarOActualizarResena({
      vendedorUid: "uid-vendedor",
      autorUid: "uid-autor",
      autorNombre: "Ana",
      autorAvatar: "",
      estrellas: 1,
      comentario: "Todo bien",
    });

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({
      esNueva: true,
      nuevoTotal: 4,
      nuevoPromedio: 1.3,
    });

    // Verificar escritura en /usuarios/{vendedorUid}
    const llamadaVendedor = mockTxSet.mock.calls.find(
      ([ref]) => ref._col === "usuarios" && ref._id === "uid-vendedor"
    );
    expect(llamadaVendedor).toBeDefined();
    expect(llamadaVendedor[1]).toEqual({
      sumaEstrellas: 5,
      totalResenas: 4,
      calificacionPromedio: 1.3,
    });
    expect(Number.isInteger(llamadaVendedor[1].sumaEstrellas)).toBe(true);
    expect(llamadaVendedor[2]).toEqual({ merge: true });

    // Verificar actualización de copia en productos
    expect(mockTxUpdate).toHaveBeenCalledWith(
      { _id: "prod-1" },
      { calificacionVendedor: 1.3, totalResenasVendedor: 4 }
    );
  });

  it("caso legado sin sumaEstrellas usa Math.round(promedio * total) como fallback y guarda sumaEstrellas entero", async () => {
    mockGetDocs.mockResolvedValueOnce(makeQuerySnap([]));

    // Vendedor legado sin campo sumaEstrellas: promedio 4.3 * 3 = 12.9 -> Math.round = 13
    mockTxGet
      .mockResolvedValueOnce({ exists: () => false, data: () => null })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          totalResenas: 3,
          calificacionPromedio: 4.3,
        }),
      });

    await guardarOActualizarResena({
      vendedorUid: "uid-vendedor",
      autorUid: "uid-autor",
      autorNombre: "Ana",
      estrellas: 5,
    });

    const llamadaVendedor = mockTxSet.mock.calls.find(
      ([ref]) => ref._col === "usuarios" && ref._id === "uid-vendedor"
    );
    expect(llamadaVendedor[1]).toEqual({
      sumaEstrellas: 18, // 13 + 5
      totalResenas: 4,
      calificacionPromedio: 4.5, // 18 / 4
    });
    expect(Number.isInteger(llamadaVendedor[1].sumaEstrellas)).toBe(true);
  });
});
