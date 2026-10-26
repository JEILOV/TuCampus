// src/tests/useObjectUrls.test.js
// ============================================================
//  TESTS UNITARIOS — useObjectUrls.js (H09: liberación de Object URLs)
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  crearUrlPreview,
  revocarUrlPreview,
  revocarTodasUrlsPreview,
} from "../hooks/useObjectUrls";

describe("useObjectUrls helpers puros (H09)", () => {
  let createSpy;
  let revokeSpy;
  let contador;

  beforeEach(() => {
    vi.restoreAllMocks();
    contador = 0;
    createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `blob:mock-url-${++contador}`);
    revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
  });

  it("crear N URLs y revocar una revoca únicamente esa URL y conserva las demás", () => {
    const registro = new Set();
    const url1 = crearUrlPreview(registro, { name: "1.jpg" });
    const url2 = crearUrlPreview(registro, { name: "2.jpg" });
    const url3 = crearUrlPreview(registro, { name: "3.jpg" });

    expect(createSpy).toHaveBeenCalledTimes(3);
    expect(registro.size).toBe(3);

    revocarUrlPreview(registro, url2);

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith(url2);
    expect(registro.has(url1)).toBe(true);
    expect(registro.has(url2)).toBe(false);
    expect(registro.has(url3)).toBe(true);
  });

  it("revocarTodasUrlsPreview revoca todas las URLs pendientes y limpia el registro", () => {
    const registro = new Set();
    const url1 = crearUrlPreview(registro, { name: "1.jpg" });
    const url2 = crearUrlPreview(registro, { name: "2.jpg" });

    revocarTodasUrlsPreview(registro);

    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenNthCalledWith(1, url1);
    expect(revokeSpy).toHaveBeenNthCalledWith(2, url2);
    expect(registro.size).toBe(0);
  });

  it("revocar una URL inexistente o remota no falla ni llama a URL.revokeObjectURL", () => {
    const registro = new Set();
    crearUrlPreview(registro, { name: "1.jpg" });

    expect(() => revocarUrlPreview(registro, "https://i.ibb.co/remota.jpg")).not.toThrow();
    expect(() => revocarUrlPreview(registro, "blob:inexistente")).not.toThrow();
    expect(() => revocarUrlPreview(registro, null)).not.toThrow();
    expect(() => revocarUrlPreview(registro, undefined)).not.toThrow();

    expect(revokeSpy).not.toHaveBeenCalled();
    expect(registro.size).toBe(1);
  });
});
