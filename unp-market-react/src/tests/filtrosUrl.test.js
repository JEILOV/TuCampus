// src/tests/filtrosUrl.test.js
// ============================================================
//  TESTS UNITARIOS — src/utils/filtrosUrl.js (FASE 7A - TAREA 1)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  leerFiltrosDeUrl,
  construirUrlFiltros,
  MAX_LARGO_BUSQUEDA,
} from "../utils/filtrosUrl";

describe("filtrosUrl (FASE 7A - TAREA 1)", () => {
  it("devuelve valores por defecto cuando no hay parámetros", () => {
    expect(leerFiltrosDeUrl("")).toEqual({
      q: "",
      cat: "todos",
      tab: "inicio",
    });
    expect(leerFiltrosDeUrl(new URLSearchParams())).toEqual({
      q: "",
      cat: "todos",
      tab: "inicio",
    });
    expect(leerFiltrosDeUrl(null)).toEqual({
      q: "",
      cat: "todos",
      tab: "inicio",
    });
  });

  it("categoría inválida cae en 'todos'", () => {
    expect(leerFiltrosDeUrl("?cat=inexistente").cat).toBe("todos");
    expect(leerFiltrosDeUrl("?cat=autos").cat).toBe("todos");
    expect(leerFiltrosDeUrl("?cat=materiales").cat).toBe("materiales");
  });

  it("q largo se recorta a 80 caracteres y se eliminan espacios extremos", () => {
    const largo = `   ${"a".repeat(120)}   `;
    const leido = leerFiltrosDeUrl(new URLSearchParams({ q: largo }));
    expect(leido.q).toHaveLength(MAX_LARGO_BUSQUEDA);
    expect(leido.q).toBe("a".repeat(MAX_LARGO_BUSQUEDA));
  });

  it("construirUrlFiltros omite valores por defecto y codifica con URLSearchParams", () => {
    expect(construirUrlFiltros()).toBe("/");
    expect(
      construirUrlFiltros({ q: "", cat: "todos", tab: "inicio" })
    ).toBe("/");
    expect(
      construirUrlFiltros({ q: "libros", cat: "materiales" })
    ).toBe("/?q=libros&cat=materiales");
    expect(
      construirUrlFiltros({ tab: "favoritos" })
    ).toBe("/?tab=favoritos");
  });

  it("ida y vuelta: leerFiltrosDeUrl(construirUrlFiltros(x)) === x", () => {
    const casos = [
      { q: "", cat: "todos", tab: "inicio" },
      { q: "calculadora casio", cat: "tecnologia", tab: "inicio" },
      { q: "empanadas", cat: "comida", tab: "inicio" },
      { q: "", cat: "todos", tab: "favoritos" },
      { q: "apuntes cálculo & álgebra", cat: "materiales", tab: "inicio" },
    ];

    for (const x of casos) {
      const url = construirUrlFiltros(x);
      expect(leerFiltrosDeUrl(url)).toEqual(x);
    }
  });
});
