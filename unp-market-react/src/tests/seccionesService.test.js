// src/tests/seccionesService.test.js
// ============================================================
//  TESTS UNITARIOS — src/services/seccionesService.js (FASE 5 - TAREA 1)
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  mockGetDocs,
  makeQuerySnap,
  resetAllMocks,
} from "./__mocks__/firebase";
import {
  obtenerProductosSeccion,
  limpiarCacheSecciones,
  TTL_CACHE_SECCIONES_MS,
} from "../services/seccionesService";
import {
  debeCargarSeccion,
  debeSolicitarCarga,
} from "../components/SeccionCarrusel";
import { esModoSecciones } from "../pages/Home";
import { FILTROS_AVANZADOS_INICIALES } from "../components/FeedFiltros";

describe("seccionesService (TAREA 1)", () => {
  beforeEach(() => {
    resetAllMocks();
    limpiarCacheSecciones();
  });

  it("arma las constraints correctas sin categoría (universidadId + orderBy fecha desc + limit)", async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeQuerySnap([{ id: "p1", data: { titulo: "Menú universitario", precio: 8 } }])
    );

    const res = await obtenerProductosSeccion({
      universidadId: "unp",
      categoria: null,
      limite: 10,
    });

    expect(res).toEqual({
      productos: [{ id: "p1", titulo: "Menú universitario", precio: 8 }],
      error: null,
    });
    expect(mockGetDocs).toHaveBeenCalledTimes(1);

    const queryArg = mockGetDocs.mock.calls[0][0];
    expect(queryArg._query).toEqual([
      { _col: "productos" },
      { field: "universidadId", op: "==", val: "unp" },
      { field: "fecha", dir: "desc" },
      { limit: 10 },
    ]);
  });

  it("arma las constraints correctas con categoría y respeta el límite indicado", async () => {
    mockGetDocs.mockResolvedValueOnce(
      makeQuerySnap([{ id: "p2", data: { titulo: "Empanadas", categoria: "comida" } }])
    );

    const res = await obtenerProductosSeccion({
      universidadId: "ucv",
      categoria: "comida",
      limite: 6,
    });

    expect(res.error).toBeNull();
    expect(res.productos).toHaveLength(1);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);

    const queryArg = mockGetDocs.mock.calls[0][0];
    expect(queryArg._query).toEqual([
      { _col: "productos" },
      { field: "universidadId", op: "==", val: "ucv" },
      { field: "categoria", op: "==", val: "comida" },
      { field: "fecha", dir: "desc" },
      { limit: 6 },
    ]);
  });

  it("ante error de índice (failed-precondition) devuelve error: 'indice' sin fallback y loguea el enlace en console.error", async () => {
    const spyConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const errIndice = Object.assign(
      new Error(
        "The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/test/firestore/indexes?create_composite=abc"
      ),
      { code: "failed-precondition" }
    );
    mockGetDocs.mockRejectedValueOnce(errIndice);

    const res = await obtenerProductosSeccion({
      universidadId: "unp",
      categoria: "tecnologia",
    });

    expect(res).toEqual({ productos: [], error: "indice" });
    // Sin fallback en memoria: solo 1 llamada a getDocs
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(spyConsoleError).toHaveBeenCalledTimes(1);
    expect(spyConsoleError.mock.calls[0].join(" ")).toContain(
      "https://console.firebase.google.com/v1/r/project/test/firestore/indexes"
    );

    spyConsoleError.mockRestore();
  });

  it("segunda llamada dentro del TTL devuelve desde caché sin consultar Firestore; pasado el TTL vuelve a consultar", async () => {
    let reloj = 1_000_000;
    const now = () => reloj;

    mockGetDocs
      .mockResolvedValueOnce(
        makeQuerySnap([{ id: "p1", data: { titulo: "Versión 1" } }])
      )
      .mockResolvedValueOnce(
        makeQuerySnap([{ id: "p1", data: { titulo: "Versión 2" } }])
      );

    const r1 = await obtenerProductosSeccion({
      universidadId: "unp",
      categoria: "ropa",
      now,
    });
    expect(r1.productos[0].titulo).toBe("Versión 1");
    expect(mockGetDocs).toHaveBeenCalledTimes(1);

    // Avanza 2 minutos (< TTL de 3 minutos)
    reloj += 2 * 60 * 1000;
    const r2 = await obtenerProductosSeccion({
      universidadId: "unp",
      categoria: "ropa",
      now,
    });
    expect(r2.productos[0].titulo).toBe("Versión 1");
    expect(mockGetDocs).toHaveBeenCalledTimes(1);

    // Supera el TTL de 3 minutos
    reloj += TTL_CACHE_SECCIONES_MS;
    const r3 = await obtenerProductosSeccion({
      universidadId: "unp",
      categoria: "ropa",
      now,
    });
    expect(r3.productos[0].titulo).toBe("Versión 2");
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
  });

  it("limpiarCacheSecciones vacía la caché y obliga a consultar nuevamente", async () => {
    mockGetDocs
      .mockResolvedValueOnce(
        makeQuerySnap([{ id: "p1", data: { titulo: "Inicial" } }])
      )
      .mockResolvedValueOnce(
        makeQuerySnap([{ id: "p2", data: { titulo: "Tras limpiar" } }])
      );

    await obtenerProductosSeccion({ universidadId: "unp", categoria: "otros" });
    expect(mockGetDocs).toHaveBeenCalledTimes(1);

    limpiarCacheSecciones();

    const res = await obtenerProductosSeccion({
      universidadId: "unp",
      categoria: "otros",
    });
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(res.productos[0].titulo).toBe("Tras limpiar");
  });
});

describe("debeCargarSeccion — carga diferida (TAREA 2)", () => {
  it("primeras dos secciones (índices 0 y 1) cargan de inmediato aunque no sean visibles", () => {
    expect(
      debeCargarSeccion({ indice: 0, esVisible: false, soportaObserver: true })
    ).toBe(true);
    expect(
      debeCargarSeccion({ indice: 1, esVisible: false, soportaObserver: true })
    ).toBe(true);
  });

  it("las demás secciones (índice >= 2) solo cargan al hacerse visibles", () => {
    expect(
      debeCargarSeccion({ indice: 2, esVisible: false, soportaObserver: true })
    ).toBe(false);
    expect(
      debeCargarSeccion({ indice: 5, esVisible: false, soportaObserver: true })
    ).toBe(false);
    expect(
      debeCargarSeccion({ indice: 2, esVisible: true, soportaObserver: true })
    ).toBe(true);
  });

  it("sin IntersectionObserver cargan todas de inmediato", () => {
    for (let i = 0; i < 7; i++) {
      expect(
        debeCargarSeccion({ indice: i, esVisible: false, soportaObserver: false })
      ).toBe(true);
    }
  });
});

describe("debeSolicitarCarga — disparo idempotente y autorreparable (TAREA 2)", () => {
  it("pendiente y habilitada devuelve true", () => {
    expect(
      debeSolicitarCarga({
        habilitada: true,
        pendienteCarga: true,
        cargando: false,
      })
    ).toBe(true);
  });

  it("ya cargando devuelve false", () => {
    expect(
      debeSolicitarCarga({
        habilitada: true,
        pendienteCarga: true,
        cargando: true,
      })
    ).toBe(false);
    expect(
      debeSolicitarCarga({
        habilitada: true,
        pendienteCarga: false,
        cargando: true,
      })
    ).toBe(false);
  });

  it("ya terminada (pendienteCarga: false, cargando: false) devuelve false", () => {
    expect(
      debeSolicitarCarga({
        habilitada: true,
        pendienteCarga: false,
        cargando: false,
      })
    ).toBe(false);
  });

  it("no habilitada devuelve false aunque esté pendiente", () => {
    expect(
      debeSolicitarCarga({
        habilitada: false,
        pendienteCarga: true,
        cargando: false,
      })
    ).toBe(false);
  });
});

describe("esModoSecciones (TAREA 3)", () => {
  it("sin filtros activos devuelve true", () => {
    expect(
      esModoSecciones({
        busqueda: "",
        categoriaActiva: "todos",
        filtrosAvanzados: FILTROS_AVANZADOS_INICIALES,
      })
    ).toBe(true);
  });

  it("con texto de búsqueda devuelve false", () => {
    expect(
      esModoSecciones({
        busqueda: "galletas",
        categoriaActiva: "todos",
        filtrosAvanzados: FILTROS_AVANZADOS_INICIALES,
      })
    ).toBe(false);
  });

  it("con categoría seleccionada distinta de 'todos' devuelve false", () => {
    expect(
      esModoSecciones({
        busqueda: "",
        categoriaActiva: "comida",
        filtrosAvanzados: FILTROS_AVANZADOS_INICIALES,
      })
    ).toBe(false);
  });

  it("con condición, precioMin o precioMax activos devuelve false", () => {
    expect(
      esModoSecciones({
        busqueda: "",
        categoriaActiva: "todos",
        filtrosAvanzados: { ...FILTROS_AVANZADOS_INICIALES, condicion: "nuevo" },
      })
    ).toBe(false);

    expect(
      esModoSecciones({
        busqueda: "",
        categoriaActiva: "todos",
        filtrosAvanzados: { ...FILTROS_AVANZADOS_INICIALES, precioMin: "10" },
      })
    ).toBe(false);

    expect(
      esModoSecciones({
        busqueda: "",
        categoriaActiva: "todos",
        filtrosAvanzados: { ...FILTROS_AVANZADOS_INICIALES, precioMax: "50" },
      })
    ).toBe(false);
  });
});
