// src/tests/userService.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  mockGetDoc, mockSetDoc, mockUpdateDoc, mockGetDocs,
  makeSnap, makeEmptySnap, makeQuerySnap,
  resetAllMocks,
} from "./__mocks__/firebase";

import {
  obtenerPerfilVendedor,
  obtenerProductosPorVendedor,
  seguirVendedor,
  dejarDeSeguirVendedor,
  obtenerOCrearPerfilUsuario,
  sincronizarFavoritos,
} from "../services/userService";

// ─────────────────────────────────────────────────────────────
describe("userService", () => {

  beforeEach(() => {
    resetAllMocks();
  });

  // ══════════════════════════════════════════════════════════
  describe("obtenerPerfilVendedor", () => {

    it("devuelve null si no se pasa uid", async () => {
      const result = await obtenerPerfilVendedor(null);
      expect(result).toBeNull();
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it("devuelve los datos del perfil si el doc existe", async () => {
      const perfil = { nombre: "Valery B.", telefono: "987654321" };
      mockGetDoc.mockResolvedValueOnce(makeSnap("uid-001", perfil));

      const result = await obtenerPerfilVendedor("uid-001");

      expect(result).toEqual(perfil);
    });

    it("devuelve null si el documento no existe", async () => {
      mockGetDoc.mockResolvedValueOnce(makeEmptySnap());

      const result = await obtenerPerfilVendedor("uid-inexistente");

      expect(result).toBeNull();
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("obtenerProductosPorVendedor", () => {

    it("devuelve array vacío si no se pasa uid", async () => {
      const result = await obtenerProductosPorVendedor(undefined);
      expect(result).toEqual([]);
      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it("devuelve los productos del vendedor con su id", async () => {
      mockGetDocs.mockResolvedValueOnce(
        makeQuerySnap([
          { id: "p1", data: { titulo: "Dulce 1", precio: 3 } },
          { id: "p2", data: { titulo: "Dulce 2", precio: 5 } },
        ])
      );

      const result = await obtenerProductosPorVendedor("uid-001");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "p1", titulo: "Dulce 1", precio: 3 });
      expect(result[1]).toEqual({ id: "p2", titulo: "Dulce 2", precio: 5 });
    });

    it("devuelve array vacío si el vendedor no tiene productos", async () => {
      mockGetDocs.mockResolvedValueOnce(makeQuerySnap([]));

      const result = await obtenerProductosPorVendedor("uid-sin-productos");

      expect(result).toEqual([]);
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("seguirVendedor", () => {

    it("llama updateDoc con arrayUnion del miUid", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await seguirVendedor("vendedor-001", "yo-uid");

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const [_ref, datos] = mockUpdateDoc.mock.calls[0];
      // arrayUnion está mockeado como { _type: "arrayUnion", args: ["yo-uid"] }
      expect(datos.seguidores).toMatchObject({ _type: "arrayUnion", args: ["yo-uid"] });
    });

    it("lanza Error traducido cuando Firestore falla", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );

      await expect(seguirVendedor("vendedor-001", "yo-uid"))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("dejarDeSeguirVendedor", () => {

    it("llama updateDoc con arrayRemove del miUid", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await dejarDeSeguirVendedor("vendedor-001", "yo-uid");

      const [_ref, datos] = mockUpdateDoc.mock.calls[0];
      expect(datos.seguidores).toMatchObject({ _type: "arrayRemove", args: ["yo-uid"] });
    });

    it("lanza Error traducido cuando Firestore falla", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Unavailable"), { code: "unavailable" })
      );

      await expect(dejarDeSeguirVendedor("vendedor-001", "yo-uid"))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("obtenerOCrearPerfilUsuario", () => {

    const userFake = {
      uid:         "user-nuevo",
      displayName: "Valery Bedregal",
      email:       "vbedregal@alumnos.unp.edu.pe",
      photoURL:    "https://foto.test/avatar.jpg",
    };

    it("crea el documento con setDoc si el usuario es nuevo", async () => {
      mockGetDoc.mockResolvedValueOnce(makeEmptySnap());
      mockSetDoc.mockResolvedValueOnce(undefined);

      const { perfil, favoritosGuardados } = await obtenerOCrearPerfilUsuario(userFake);

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(perfil.uid).toBe("user-nuevo");
      expect(perfil.nombre).toBe("Valery Bedregal");
      expect(perfil.email).toBe("vbedregal@alumnos.unp.edu.pe");
      expect(favoritosGuardados).toEqual([]);
    });

    it("devuelve los datos guardados si el usuario ya existe", async () => {
      const datosGuardados = {
        uid:       "user-nuevo",
        nombre:    "Valery B. (editado)",
        email:     "vbedregal@alumnos.unp.edu.pe",
        avatar:    "https://foto.test/nueva.jpg",
        telefono:  "987654321",
        favoritos: ["prod-1", "prod-2"],
      };
      mockGetDoc.mockResolvedValueOnce(makeSnap("user-nuevo", datosGuardados));

      const { perfil, favoritosGuardados } = await obtenerOCrearPerfilUsuario(userFake);

      // No debe llamar setDoc para un usuario existente
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(perfil.nombre).toBe("Valery B. (editado)");
      expect(perfil.telefono).toBe("987654321");
      expect(favoritosGuardados).toEqual(["prod-1", "prod-2"]);
    });

    it("devuelve favoritosGuardados vacío si el campo no existe", async () => {
      // Perfil existente pero sin campo 'favoritos'
      mockGetDoc.mockResolvedValueOnce(
        makeSnap("user-nuevo", { nombre: "Sin favs", email: "a@b.com" })
      );

      const { favoritosGuardados } = await obtenerOCrearPerfilUsuario(userFake);

      expect(favoritosGuardados).toEqual([]);
    });

    it("usa string vacío para avatar si photoURL es null", async () => {
      mockGetDoc.mockResolvedValueOnce(makeEmptySnap());
      mockSetDoc.mockResolvedValueOnce(undefined);

      const { perfil } = await obtenerOCrearPerfilUsuario({ ...userFake, photoURL: null });

      expect(perfil.avatar).toBe("");
    });

    it("lanza Error traducido cuando Firestore falla", async () => {
      mockGetDoc.mockRejectedValueOnce(
        Object.assign(new Error("Unavailable"), { code: "unavailable" })
      );

      await expect(obtenerOCrearPerfilUsuario(userFake))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("sincronizarFavoritos", () => {

    it("llama setDoc con merge:true y el array de favoritos", async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);

      await sincronizarFavoritos("uid-001", ["prod-1", "prod-2", "prod-3"]);

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const [_ref, datos, opciones] = mockSetDoc.mock.calls[0];
      expect(datos).toEqual({ favoritos: ["prod-1", "prod-2", "prod-3"] });
      expect(opciones).toEqual({ merge: true }); // no sobreescribe otros campos
    });

    it("puede sincronizar un array vacío (el usuario quitó todos sus favs)", async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);

      await sincronizarFavoritos("uid-001", []);

      const [_ref, datos] = mockSetDoc.mock.calls[0];
      expect(datos).toEqual({ favoritos: [] });
    });

  });

});
