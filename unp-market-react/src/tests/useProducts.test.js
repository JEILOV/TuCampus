// src/tests/useProducts.test.js
// ============================================================
//  TESTS UNITARIOS — useProducts.js (H01: texto + categoría)
// ============================================================

import { describe, it, expect, vi } from "vitest";
import { recolectarPaginaProductos } from "../hooks/useProducts";

describe("recolectarPaginaProductos (H01)", () => {
  it("combina texto y categoría: filtra por categoría en cliente y pide más páginas hasta completar pageSize o agotar", async () => {
    const paginas = [
      [
        { id: "p1", titulo: "Audífonos Sony", categoria: "tecnologia" },
        { id: "p2", titulo: "Polera Audífonos", categoria: "ropa" },
        { id: "p3", titulo: "Audífonos JBL", categoria: "tecnologia" },
      ],
      [
        { id: "p4", titulo: "Gorro Audífonos", categoria: "ropa" },
        { id: "p5", titulo: "Casaca Audífonos", categoria: "ropa" },
      ],
    ];

    let idx = 0;
    const fetchPagina = vi.fn(async () => {
      const lote = paginas[idx++] || [];
      return { docs: lote, rawDocs: lote };
    });

    const res = await recolectarPaginaProductos({
      fetchPagina,
      busqueda: "audifonos",
      categoriaActiva: "ropa",
      pageSize: 3,
      maxPaginas: 3,
    });

    expect(res.modoFiltro).toBe("texto+categoria");
    expect(fetchPagina).toHaveBeenCalledTimes(2);
    expect(res.items.map((p) => p.id)).toEqual(["p2", "p4", "p5"]);
    expect(res.todoCargado).toBe(true); // la 2da página trajo 2 (< pageSize=3)
  });

  it("solo texto (categoriaActiva = 'todos'): hace una sola llamada y no filtra por categoría en cliente", async () => {
    const lote = [
      { id: "p1", categoria: "tecnologia" },
      { id: "p2", categoria: "ropa" },
      { id: "p3", categoria: "comida" },
    ];
    const fetchPagina = vi.fn(async () => ({ docs: lote, rawDocs: lote }));

    const res = await recolectarPaginaProductos({
      fetchPagina,
      busqueda: "oferta",
      categoriaActiva: "todos",
      pageSize: 3,
      maxPaginas: 3,
    });

    expect(res.modoFiltro).toBe("texto");
    expect(fetchPagina).toHaveBeenCalledTimes(1);
    expect(res.items).toEqual(lote);
    expect(res.todoCargado).toBe(false);
  });

  it("solo categoría (sin texto): hace una sola llamada (Firestore ya filtró por categoría)", async () => {
    const lote = [
      { id: "p1", categoria: "ropa" },
      { id: "p2", categoria: "ropa" },
    ];
    const fetchPagina = vi.fn(async () => ({ docs: lote, rawDocs: lote }));

    const res = await recolectarPaginaProductos({
      fetchPagina,
      busqueda: "",
      categoriaActiva: "ropa",
      pageSize: 3,
      maxPaginas: 3,
    });

    expect(res.modoFiltro).toBe("categoria");
    expect(fetchPagina).toHaveBeenCalledTimes(1);
    expect(res.items).toEqual(lote);
    expect(res.todoCargado).toBe(true);
  });

  it("ninguno (sin texto y categoría 'todos'): hace una sola llamada y devuelve el lote tal cual", async () => {
    const lote = [
      { id: "p1", categoria: "comida" },
      { id: "p2", categoria: "materiales" },
      { id: "p3", categoria: "otros" },
    ];
    const fetchPagina = vi.fn(async () => ({ docs: lote, rawDocs: lote }));

    const res = await recolectarPaginaProductos({
      fetchPagina,
      busqueda: "   ",
      categoriaActiva: "todos",
      pageSize: 3,
      maxPaginas: 3,
    });

    expect(res.modoFiltro).toBe("ninguno");
    expect(fetchPagina).toHaveBeenCalledTimes(1);
    expect(res.items).toEqual(lote);
    expect(res.todoCargado).toBe(false);
  });

  it("resultados vacíos: marca todoCargado = true en la primera lectura y devuelve items = []", async () => {
    const fetchPagina = vi.fn(async () => ({ docs: [], rawDocs: [] }));

    const res = await recolectarPaginaProductos({
      fetchPagina,
      busqueda: "inexistente",
      categoriaActiva: "ropa",
      pageSize: 12,
      maxPaginas: 3,
    });

    expect(fetchPagina).toHaveBeenCalledTimes(1);
    expect(res.items).toEqual([]);
    expect(res.todoCargado).toBe(true);
  });

  it("respeta el tope de páginas (maxPaginas) cuando ninguna coincidencia llena pageSize", async () => {
    // Cada página trae 3 productos de 'tecnologia', pero buscamos categoría 'ropa'
    const fetchPagina = vi.fn(async (cursor) => {
      const base = cursor ? cursor.n : 0;
      const lote = [
        { id: `p-${base + 1}`, categoria: "tecnologia", n: base + 1 },
        { id: `p-${base + 2}`, categoria: "tecnologia", n: base + 2 },
        { id: `p-${base + 3}`, categoria: "tecnologia", n: base + 3 },
      ];
      return { docs: lote, rawDocs: lote };
    });

    const res = await recolectarPaginaProductos({
      fetchPagina,
      busqueda: "audifonos",
      categoriaActiva: "ropa",
      pageSize: 3,
      maxPaginas: 3,
    });

    expect(fetchPagina).toHaveBeenCalledTimes(3);
    expect(res.paginasLeidas).toBe(3);
    expect(res.items).toEqual([]);
    expect(res.todoCargado).toBe(false);
    expect(res.ultimoCursor).toEqual({ id: "p-9", categoria: "tecnologia", n: 9 });
  });
});
