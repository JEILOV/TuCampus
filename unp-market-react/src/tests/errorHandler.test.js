// src/tests/errorHandler.test.js
// ============================================================
//  Tests del errorHandler y generarPrefijos
//  Estos NO necesitan mocks de Firebase — son funciones puras.
// ============================================================
import { describe, it, expect } from "vitest";
import { traducirError, logError } from "../utils/errorHandler";
import { generarPrefijos }         from "../utils/imageUtils";

// ─────────────────────────────────────────────────────────────
describe("traducirError", () => {

  it("traduce permission-denied al mensaje correcto", () => {
    const err = Object.assign(new Error(), { code: "permission-denied" });
    expect(traducirError(err, "firestore"))
      .toBe("No tienes permiso para realizar esta acción.");
  });

  it("traduce unavailable al mensaje de conexión", () => {
    const err = Object.assign(new Error(), { code: "unavailable" });
    expect(traducirError(err, "firestore"))
      .toBe("Sin conexión con el servidor. Intenta de nuevo.");
  });

  it("traduce auth/popup-closed-by-user a null (silencioso)", () => {
    const err = Object.assign(new Error(), { code: "auth/popup-closed-by-user" });
    expect(traducirError(err, "auth")).toBeNull();
  });

  it("traduce auth/network-request-failed al mensaje de red", () => {
    const err = Object.assign(new Error(), { code: "auth/network-request-failed" });
    expect(traducirError(err, "auth"))
      .toBe("Sin conexión. Revisa tu internet e intenta de nuevo.");
  });

  it("usa fallback de firestore para código desconocido", () => {
    const err = Object.assign(new Error("oops"), { code: "algún-código-raro" });
    expect(traducirError(err, "firestore"))
      .toBe("Error al conectar con la base de datos.");
  });

  it("usa fallback de auth para código desconocido con contexto auth", () => {
    const err = Object.assign(new Error("oops"), { code: "auth/codigo-raro" });
    expect(traducirError(err, "auth"))
      .toBe("Error de autenticación. Intenta de nuevo.");
  });

  it("usa fallback default cuando contexto no existe", () => {
    const err = new Error("sin código");
    expect(traducirError(err)).toBe("Algo salió mal. Intenta de nuevo.");
  });

  it("traduce el error de ImgBB por mensaje exacto", () => {
    const err = new Error("ImgBB rechazó la imagen");
    expect(traducirError(err, "imgbb"))
      .toBe("No se pudo subir la imagen. Intenta de nuevo.");
  });

  it("maneja error sin código ni mensaje conocido", () => {
    expect(traducirError(null, "firestore"))
      .toBe("Error al conectar con la base de datos.");
  });

});

// ─────────────────────────────────────────────────────────────
describe("logError", () => {

  it("no lanza excepciones al llamarlo", () => {
    expect(() => logError("[test]", new Error("boom"))).not.toThrow();
  });

  // logError solo imprime en DEV — en el entorno de test
  // import.meta.env.DEV puede ser true o false según vitest.
  // Lo importante es que no rompa la app.

});

// ─────────────────────────────────────────────────────────────
describe("generarPrefijos", () => {

  it("genera prefijos para una sola palabra", () => {
    const result = generarPrefijos("galleta");
    expect(result).toEqual(["g", "ga", "gal", "gall", "galle", "gallet", "galleta"]);
  });

  it("genera prefijos para múltiples palabras sin duplicados", () => {
    const result = generarPrefijos("pan dulce");
    expect(result).toContain("p");
    expect(result).toContain("pa");
    expect(result).toContain("pan");
    expect(result).toContain("d");
    expect(result).toContain("du");
    expect(result).toContain("dul");
    expect(result).toContain("dulc");
    expect(result).toContain("dulce");
    // sin duplicados
    expect(new Set(result).size).toBe(result.length);
  });

  it("convierte a minúsculas", () => {
    const result = generarPrefijos("Anticucho");
    expect(result).toContain("a");
    expect(result).toContain("an");
    expect(result).not.toContain("A");
  });

  it("ignora espacios múltiples", () => {
    const result = generarPrefijos("  torta   de  miel  ");
    expect(result).toContain("torta");
    expect(result).toContain("de");
    expect(result).toContain("miel");
  });

  it("devuelve array vacío para string vacío", () => {
    expect(generarPrefijos("")).toEqual([]);
  });

  it("devuelve array vacío para null/undefined", () => {
    expect(generarPrefijos(null)).toEqual([]);
    expect(generarPrefijos(undefined)).toEqual([]);
  });

  it("las palabras compartidas no duplican prefijos", () => {
    // "pan pan" tiene la misma palabra dos veces
    const result = generarPrefijos("pan pan");
    const ocurrencias = result.filter((p) => p === "pan").length;
    expect(ocurrencias).toBe(1);
  });

});
