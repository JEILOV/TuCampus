// src/tests/chatRespondiendoA.test.js
import { describe, it, expect } from "vitest";
import { construirRespondiendoA } from "../utils/chatUtils";

describe("construirRespondiendoA (S08 — truncado de citas)", () => {
  it("devuelve null cuando no hay mensajeRespondiendo", () => {
    expect(construirRespondiendoA(null, "uid-yo", "Carlos")).toBeNull();
  });

  it("conserva intacta una cita de exactamente 200 caracteres (sin '…')", () => {
    const texto200 = "a".repeat(200);
    const resultado = construirRespondiendoA(
      { id: "msg-200", texto: texto200, deUid: "uid-otro" },
      "uid-yo",
      "Valery"
    );

    expect(resultado).toEqual({
      id: "msg-200",
      texto: texto200,
      autorNombre: "Valery",
    });
    expect(resultado.texto.length).toBe(200);
    expect(resultado.texto.endsWith("…")).toBe(false);
  });

  it("trunca una cita de 201 caracteres a 200 caracteres en total terminando en '…'", () => {
    const texto201 = "b".repeat(201);
    const resultado = construirRespondiendoA(
      { id: "msg-201", texto: texto201, deUid: "uid-otro" },
      "uid-yo",
      "Valery"
    );

    expect(resultado.texto.length).toBe(200);
    expect(resultado.texto).toBe(`${"b".repeat(199)}…`);
  });

  it("trunca una cita de 1000 caracteres a 200 caracteres en total terminando en '…'", () => {
    const texto1000 = "c".repeat(1000);
    const resultado = construirRespondiendoA(
      { id: "msg-1000", texto: texto1000, deUid: "uid-otro" },
      "uid-yo",
      "Valery"
    );

    expect(resultado.texto.length).toBe(200);
    expect(resultado.texto).toBe(`${"c".repeat(199)}…`);
  });

  it("trunca un autorNombre de 150 caracteres a 100 caracteres", () => {
    const nombre150 = "N".repeat(150);
    const resultado = construirRespondiendoA(
      { id: "msg-autor", texto: "Hola", deUid: "uid-otro" },
      "uid-yo",
      nombre150
    );

    expect(resultado.autorNombre.length).toBe(100);
    expect(resultado.autorNombre).toBe("N".repeat(100));
  });
});
