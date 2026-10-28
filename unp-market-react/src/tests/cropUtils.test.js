// src/tests/cropUtils.test.js
import { describe, it, expect } from "vitest";
import {
  calcularDimensionesAjustadas,
  escalarAreaRecorte,
  calcularCajaRotada,
} from "../utils/cropUtils";

describe("cropUtils (FASE 7D.2 — recorte y cálculo de dimensiones)", () => {
  describe("calcularDimensionesAjustadas", () => {
    it("mantiene las dimensiones intactas si la imagen es menor o igual a 2048px", () => {
      const r1 = calcularDimensionesAjustadas(1920, 1080, 2048);
      expect(r1).toEqual({ ancho: 1920, alto: 1080, escala: 1 });

      const r2 = calcularDimensionesAjustadas(2048, 1536, 2048);
      expect(r2).toEqual({ ancho: 2048, alto: 1536, escala: 1 });
    });

    it("escala proporcionalmente si el ancho supera 2048px", () => {
      const r = calcularDimensionesAjustadas(4096, 2048, 2048);
      expect(r.escala).toBe(0.5);
      expect(r.ancho).toBe(2048);
      expect(r.alto).toBe(1024);
    });

    it("escala proporcionalmente si el alto supera 2048px", () => {
      const r = calcularDimensionesAjustadas(3000, 6000, 2048);
      expect(r.escala).toBeCloseTo(2048 / 6000, 4);
      expect(r.alto).toBe(2048);
      expect(r.ancho).toBe(Math.round(3000 * (2048 / 6000)));
    });

    it("maneja dimensiones mínimas válidas sin devolver ceros", () => {
      const r = calcularDimensionesAjustadas(0, 0, 2048);
      expect(r.ancho).toBeGreaterThanOrEqual(1);
      expect(r.alto).toBeGreaterThanOrEqual(1);
    });
  });

  describe("escalarAreaRecorte", () => {
    it("multiplica coordenadas y dimensiones por la escala", () => {
      const crop = { x: 100, y: 200, width: 800, height: 800 };
      const r = escalarAreaRecorte(crop, 0.5);
      expect(r).toEqual({ x: 50, y: 100, width: 400, height: 400 });
    });

    it("garantiza dimensiones mínimas de 1px", () => {
      const crop = { x: 0, y: 0, width: 0, height: 0 };
      const r = escalarAreaRecorte(crop, 0.5);
      expect(r.width).toBe(1);
      expect(r.height).toBe(1);
    });
  });

  describe("calcularCajaRotada", () => {
    it("mantiene width y height en 0° y 180°", () => {
      expect(calcularCajaRotada(1000, 600, 0)).toEqual({ width: 1000, height: 600 });
      expect(calcularCajaRotada(1000, 600, 180)).toEqual({ width: 1000, height: 600 });
      expect(calcularCajaRotada(1000, 600, 360)).toEqual({ width: 1000, height: 600 });
    });

    it("invierte width y height en 90° y 270°", () => {
      expect(calcularCajaRotada(1000, 600, 90)).toEqual({ width: 600, height: 1000 });
      expect(calcularCajaRotada(1000, 600, 270)).toEqual({ width: 600, height: 1000 });
    });

    it("soporta ángulos negativos o mayores a 360°", () => {
      expect(calcularCajaRotada(1000, 600, -90)).toEqual({ width: 600, height: 1000 });
      expect(calcularCajaRotada(1000, 600, 450)).toEqual({ width: 600, height: 1000 });
    });
  });
});
