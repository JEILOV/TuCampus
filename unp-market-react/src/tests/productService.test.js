// src/tests/productService.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Importar mocks ANTES que el servicio ─────────────────────
import {
  mockGetDoc, mockUpdateDoc, mockDeleteDoc,
  mockWriteBatch, mockBatchSet, mockBatchUpdate, mockBatchCommit,
  makeSnap, makeEmptySnap, fakeBatch,
  resetAllMocks,
} from "./__mocks__/firebase";

// ── Importar el servicio real ─────────────────────────────────
import {
  obtenerProductoPorId,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  cambiarEstadoProducto,
} from "../services/productService";

// ── Mock de generarPrefijos ───────────────────────────────────
// No testamos la lógica de prefijos aquí; eso va en imageUtils.test.js
vi.mock("../utils/imageUtils", () => ({
  generarPrefijos: vi.fn((texto) => [texto.toLowerCase()]),
}));

// ─────────────────────────────────────────────────────────────
describe("productService", () => {

  beforeEach(() => {
    resetAllMocks();
  });

  // ══════════════════════════════════════════════════════════
  describe("obtenerProductoPorId", () => {

    it("devuelve null si no se pasa productoId", async () => {
      const result = await obtenerProductoPorId(null);
      expect(result).toBeNull();
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("devuelve los datos del producto si el doc existe", async () => {
      const datosEsperados = { titulo: "Galletas de avena", precio: 5 };
      mockGetDoc.mockResolvedValueOnce(makeSnap("prod-123", datosEsperados));

      const result = await obtenerProductoPorId("prod-123");

      expect(result).toEqual({ id: "prod-123", ...datosEsperados });
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it("devuelve null si el doc no existe en Firestore", async () => {
      mockGetDoc.mockResolvedValueOnce(makeEmptySnap());

      const result = await obtenerProductoPorId("prod-inexistente");

      expect(result).toBeNull();
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("crearProducto", () => {

    const userFake = { uid: "user-001", displayName: "Valery" };
    const perfilFake = { nombre: "Valery B.", avatar: "", telefono: "987654321" };
    const inputBase = {
      titulo:      "Anticuchos de pollo",
      precio:      "8.50",
      categoria:   "salados",
      descripcion: "Bien sazonados",
      imagen:      "https://img.test/foto.jpg",
      user:        userFake,
      perfil:      perfilFake,
    };

    it("usa writeBatch: llama a batch.set + batch.update + batch.commit", async () => {
      // El usuario YA tiene documento en Firestore (perfil existente)
      mockGetDoc.mockResolvedValueOnce(
        makeSnap("user-001", { totalPublicaciones: 3 })
      );

      await crearProducto(inputBase);

      expect(mockWriteBatch).toHaveBeenCalledTimes(1);
      expect(mockBatchSet).toHaveBeenCalledTimes(1);
      expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it("el documento del producto incluye los campos obligatorios", async () => {
      mockGetDoc.mockResolvedValueOnce(makeEmptySnap()); // usuario sin doc previo

      await crearProducto(inputBase);

      const [_ref, datosGuardados] = mockBatchSet.mock.calls[0];
      expect(datosGuardados).toMatchObject({
        titulo:      "Anticuchos de pollo",
        precio:      8.50,             // parseFloat aplicado
        categoria:   "salados",
        estado:      "disponible",     // siempre "disponible" al crear
        userUid:     "user-001",
        vendedorNombre: "Valery B.",   // del perfil, no de user.displayName
        telefono:    "987654321",
      });
    });

    it("incrementa totalPublicaciones si el usuario ya tiene documento", async () => {
      mockGetDoc.mockResolvedValueOnce(
        makeSnap("user-001", { totalPublicaciones: 5 })
      );

      await crearProducto(inputBase);

      const [_ref, datosActualizados] = mockBatchUpdate.mock.calls[0];
      expect(datosActualizados).toEqual({ totalPublicaciones: 6 });
    });

    it("NO llama batch.update si el usuario no tiene documento en Firestore", async () => {
      mockGetDoc.mockResolvedValueOnce(makeEmptySnap());

      await crearProducto(inputBase);

      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });

    it("lanza Error traducido cuando Firestore falla", async () => {
      const firestoreError = Object.assign(new Error("Forbidden"), { code: "permission-denied" });
      mockGetDoc.mockRejectedValueOnce(firestoreError);

      await expect(crearProducto(inputBase)).rejects.toThrow("Error simulado (firestore)");
    });

    it("usa imagen vacía si no se pasa imagen", async () => {
      mockGetDoc.mockResolvedValueOnce(makeEmptySnap());
      await crearProducto({ ...inputBase, imagen: null });

      const [_ref, datos] = mockBatchSet.mock.calls[0];
      expect(datos.imagen).toBe("");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("actualizarProducto", () => {

    const inputBase = {
      titulo:        "Galletas nuevas",
      precio:        "12",
      categoria:     "dulces",
      descripcion:   "Ahora con chispas",
      imagen:        "https://img.test/nueva.jpg",
      imagenOriginal: "https://img.test/vieja.jpg",
    };

    it("llama updateDoc con los campos correctos", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await actualizarProducto("prod-456", inputBase);

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const [_ref, datos] = mockUpdateDoc.mock.calls[0];
      expect(datos).toMatchObject({
        titulo:      "Galletas nuevas",
        precio:      12,
        categoria:   "dulces",
        descripcion: "Ahora con chispas",
        imagen:      "https://img.test/nueva.jpg",
      });
      expect(datos.fechaEdicion).toBeDefined();
    });

    it("usa imagenOriginal si no se pasa imagen nueva", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await actualizarProducto("prod-456", { ...inputBase, imagen: "" });

      const [_ref, datos] = mockUpdateDoc.mock.calls[0];
      expect(datos.imagen).toBe("https://img.test/vieja.jpg");
    });

    it("lanza Error traducido cuando Firestore falla", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Not found"), { code: "not-found" })
      );

      await expect(actualizarProducto("prod-xxx", inputBase))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("eliminarProducto", () => {

    it("llama deleteDoc una sola vez", async () => {
      mockDeleteDoc.mockResolvedValueOnce(undefined);

      await eliminarProducto("prod-789");

      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });

    it("lanza Error traducido cuando Firestore falla", async () => {
      mockDeleteDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );

      await expect(eliminarProducto("prod-789"))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("cambiarEstadoProducto", () => {

    it("actualiza solo el campo estado", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await cambiarEstadoProducto("prod-001", "agotado");

      const [_ref, datos] = mockUpdateDoc.mock.calls[0];
      expect(datos).toEqual({ estado: "agotado" });
    });

    it("puede cambiar estado a 'disponible'", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await cambiarEstadoProducto("prod-001", "disponible");

      const [_ref, datos] = mockUpdateDoc.mock.calls[0];
      expect(datos).toEqual({ estado: "disponible" });
    });

    it("lanza Error traducido cuando Firestore falla", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Unavailable"), { code: "unavailable" })
      );

      await expect(cambiarEstadoProducto("prod-001", "agotado"))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

});
