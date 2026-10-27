// src/tests/useMediaQuery.test.js
// ============================================================
//  TESTS UNITARIOS — src/hooks/useMediaQuery.js (FASE 7A - TAREA 1)
// ============================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  useMediaQuery,
  useEsAncho,
  useEsEscritorio,
} from "../hooks/useMediaQuery";

describe("useMediaQuery (FASE 7A - TAREA 1)", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it("sin window o sin matchMedia devuelve false sin lanzar error", () => {
    delete globalThis.window;
    let resultado = null;
    function Comp() {
      resultado = useMediaQuery("(min-width: 768px)");
      return React.createElement("span", null, String(resultado));
    }
    renderToString(React.createElement(Comp));
    expect(resultado).toBe(false);

    globalThis.window = {};
    let resultadoSinMatchMedia = null;
    function Comp2() {
      resultadoSinMatchMedia = useEsAncho();
      return React.createElement("span", null, String(resultadoSinMatchMedia));
    }
    renderToString(React.createElement(Comp2));
    expect(resultadoSinMatchMedia).toBe(false);
  });

  it("lee el valor inicial síncrono desde window.matchMedia para useEsAncho y useEsEscritorio", () => {
    globalThis.window = {
      matchMedia: vi.fn((query) => ({
        matches: query === "(min-width: 768px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    };

    let ancho = null;
    let escritorio = null;
    function Comp() {
      ancho = useEsAncho();
      escritorio = useEsEscritorio();
      return React.createElement("div", null, `${ancho}-${escritorio}`);
    }

    renderToString(React.createElement(Comp));
    expect(ancho).toBe(true);
    expect(escritorio).toBe(false);
    expect(globalThis.window.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
    expect(globalThis.window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  });
});
