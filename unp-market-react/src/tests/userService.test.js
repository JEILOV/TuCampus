// src/tests/userService.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  mockGetDoc, mockSetDoc, mockUpdateDoc, mockDeleteDoc, mockGetDocs,
  mockWriteBatch, mockBatchSet, mockBatchUpdate, mockBatchCommit,
  makeSnap, makeEmptySnap, makeQuerySnap,
  resetAllMocks,
} from "./__mocks__/firebase";

import {
  obtenerPerfilVendedor,
  guardarContactoPrivado,
  obtenerProductosPorVendedor,
  seguirVendedor,
  dejarDeSeguirVendedor,
  obtenerOCrearPerfilUsuario,
  sincronizarFavoritos,
  bloquearUsuario,
  desbloquearUsuario,
  obtenerMisBloqueos,
  existeBloqueo,
} from "../services/userService";
import { propagarPerfilAProductos } from "../pages/Perfil";

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
  describe("seguirVendedor (H04)", () => {

    it("llama a updateDoc con arrayUnion(miUid) sin hacer getDoc previo", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await seguirVendedor("vendedor-001", "yo-uid");

      expect(mockGetDoc).not.toHaveBeenCalled();
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const [ref, datos] = mockUpdateDoc.mock.calls[0];
      expect(ref).toEqual({ _col: "usuarios", _id: "vendedor-001" });
      expect(datos).toEqual({
        seguidores: { _type: "arrayUnion", args: ["yo-uid"] },
      });
    });

    it("si recibe permission-denied pero el usuario ya figura en seguidores, retorna sin error", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );
      mockGetDoc.mockResolvedValueOnce(
        makeSnap("vendedor-001", { seguidores: ["otro-uid", "yo-uid"] })
      );

      await expect(seguirVendedor("vendedor-001", "yo-uid")).resolves.toBeUndefined();
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it("si recibe permission-denied y el usuario NO figura en seguidores, relanza el error", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );
      mockGetDoc.mockResolvedValueOnce(
        makeSnap("vendedor-001", { seguidores: ["otro-uid"] })
      );

      await expect(seguirVendedor("vendedor-001", "yo-uid"))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("dejarDeSeguirVendedor (H04)", () => {

    it("llama a updateDoc con arrayRemove(miUid) sin hacer getDoc previo", async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      await dejarDeSeguirVendedor("vendedor-001", "yo-uid");

      expect(mockGetDoc).not.toHaveBeenCalled();
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const [ref, datos] = mockUpdateDoc.mock.calls[0];
      expect(ref).toEqual({ _col: "usuarios", _id: "vendedor-001" });
      expect(datos).toEqual({
        seguidores: { _type: "arrayRemove", args: ["yo-uid"] },
      });
    });

    it("si recibe permission-denied pero el usuario ya NO figura en seguidores, retorna sin error", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );
      mockGetDoc.mockResolvedValueOnce(
        makeSnap("vendedor-001", { seguidores: ["otro-uid"] })
      );

      await expect(dejarDeSeguirVendedor("vendedor-001", "yo-uid")).resolves.toBeUndefined();
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it("si recibe permission-denied y el usuario aún figura en seguidores, relanza el error", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );
      mockGetDoc.mockResolvedValueOnce(
        makeSnap("vendedor-001", { seguidores: ["otro-uid", "yo-uid"] })
      );

      await expect(dejarDeSeguirVendedor("vendedor-001", "yo-uid"))
        .rejects.toThrow("Error simulado (firestore)");
    });

    it("lanza Error traducido cuando Firestore falla con otro código", async () => {
      mockUpdateDoc.mockRejectedValueOnce(
        Object.assign(new Error("Unavailable"), { code: "unavailable" })
      );

      await expect(dejarDeSeguirVendedor("vendedor-001", "yo-uid"))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("guardarContactoPrivado (H05 + H10)", () => {

    it("usa un único writeBatch con batch.set en contacto privado y batch.update solo con campos permitidos + deleteField() en telefono", async () => {
      const metodosPago = {
        yape: { activo: true, numero: "999888777" },
        plin: { activo: false, numero: "" },
      };

      await guardarContactoPrivado("uid-001", {
        telefono: "999888777",
        metodosPago,
        nombre: "Valery",
        bio: "",
        acercaDe: "",
        ubicacion: "",
        avatar: "https://img.test/a.jpg",
        portada: "",
        aceptaYape: true,
        aceptaPlin: false,
      });

      expect(mockWriteBatch).toHaveBeenCalledTimes(1);
      expect(mockBatchSet).toHaveBeenCalledTimes(1);
      expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);

      const [contactoRef, contactoDatos, contactoOpts] = mockBatchSet.mock.calls[0];
      expect(contactoRef).toEqual({
        _col: "usuarios",
        _id: "uid-001",
        _subpath: ["privado", "contacto"],
      });
      expect(contactoDatos).toEqual({ telefono: "999888777", metodosPago });
      expect(contactoOpts).toEqual({ merge: true });

      const [userRef, userDatos] = mockBatchUpdate.mock.calls[0];
      expect(userRef).toEqual({ _col: "usuarios", _id: "uid-001" });
      expect(Object.keys(userDatos).sort()).toEqual([
        "aceptaPlin",
        "aceptaYape",
        "acercaDe",
        "avatar",
        "bio",
        "nombre",
        "portada",
        "telefono",
        "ubicacion",
      ]);
      expect(userDatos.telefono).toEqual({ _type: "deleteField" });
    });

    it("nunca envía reputación, seguidores, favoritos, bloqueados, fcmToken ni email y permite vaciar bio/acercaDe/ubicacion", async () => {
      await guardarContactoPrivado("uid-001", {
        telefono: "987654321",
        metodosPago: { yape: { activo: false, numero: "" }, plin: { activo: false, numero: "" } },
        nombre: "Valery",
        bio: "",
        acercaDe: "",
        ubicacion: "",
        avatar: "",
        portada: "",
        aceptaYape: false,
        aceptaPlin: false,
        // Campos prohibidos que jamás deben enviarse en el update de perfil:
        calificacionPromedio: 5,
        totalResenas: 99,
        seguidores: ["otro"],
        favoritos: ["p1"],
        bloqueados: ["u2"],
        fcmToken: "token-secreto",
        email: "hacker@otro.com",
      });

      const [, userDatos] = mockBatchUpdate.mock.calls[0];
      expect(userDatos.bio).toBe("");
      expect(userDatos.acercaDe).toBe("");
      expect(userDatos.ubicacion).toBe("");
      expect(userDatos).not.toHaveProperty("calificacionPromedio");
      expect(userDatos).not.toHaveProperty("totalResenas");
      expect(userDatos).not.toHaveProperty("seguidores");
      expect(userDatos).not.toHaveProperty("favoritos");
      expect(userDatos).not.toHaveProperty("bloqueados");
      expect(userDatos).not.toHaveProperty("fcmToken");
      expect(userDatos).not.toHaveProperty("email");
    });

    it("un fallo parcial en la propagación a productos con Promise.allSettled NO lanza error general y advierte el conteo", async () => {
      mockGetDocs.mockResolvedValueOnce(
        makeQuerySnap([
          { id: "prod-1", data: { titulo: "P1" } },
          { id: "prod-2", data: { titulo: "P2" } },
          { id: "prod-3", data: { titulo: "P3" } },
        ])
      );
      mockUpdateDoc
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Fallo en prod-2"))
        .mockResolvedValueOnce(undefined);

      const mostrarToast = vi.fn();
      const setProductos = vi.fn();

      const res = await propagarPerfilAProductos(
        "uid-001",
        {
          avatarVendedor: "https://img/a.jpg",
          vendedorNombre: "Valery",
          vendedor: "Valery",
          aceptaYape: true,
          aceptaPlin: false,
        },
        mostrarToast,
        setProductos
      );

      expect(res).toEqual({ total: 3, fallidos: 1 });
      expect(mockUpdateDoc).toHaveBeenCalledTimes(3);
      expect(mostrarToast).toHaveBeenCalledWith(
        expect.stringContaining("1 publicación"),
        "warning"
      );
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

    it("usuario nuevo: crea doc público SIN email y doc en usuariosPrivado con email, universidadId, favoritos: [] y fcmToken: []", async () => {
      mockGetDoc
        .mockResolvedValueOnce(makeEmptySnap())
        .mockResolvedValueOnce(makeEmptySnap());
      mockSetDoc.mockResolvedValue(undefined);

      const { perfil, favoritosGuardados } = await obtenerOCrearPerfilUsuario(userFake);

      expect(mockSetDoc).toHaveBeenCalledTimes(2);
      const [refPub, datosPub] = mockSetDoc.mock.calls[0];
      expect(refPub).toEqual({ _col: "usuarios", _id: "user-nuevo" });
      expect(datosPub).not.toHaveProperty("email");

      const [refPriv, datosPriv] = mockSetDoc.mock.calls[1];
      expect(refPriv).toEqual({ _col: "usuariosPrivado", _id: "user-nuevo" });
      expect(datosPriv).toEqual({
        uid: "user-nuevo",
        email: "vbedregal@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: [],
        fcmToken: [],
      });

      expect(perfil.uid).toBe("user-nuevo");
      expect(perfil.nombre).toBe("Valery Bedregal");
      expect(perfil).not.toHaveProperty("email");
      expect(favoritosGuardados).toEqual([]);
    });

    it("usuario existente CON doc privado: devuelve favoritos de usuariosPrivado y limpia campos sensibles del perfil en memoria", async () => {
      const datosPublicos = {
        uid:       "user-nuevo",
        nombre:    "Valery B. (editado)",
        email:     "vbedregal@alumnos.unp.edu.pe",
        avatar:    "https://foto.test/nueva.jpg",
        favoritos: ["prod-legado"],
        bloqueados: ["uid-bloq-1"],
        fcmToken:  ["tk-legado"],
      };
      const datosPrivados = {
        uid:           "user-nuevo",
        email:         "vbedregal@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos:     ["prod-priv-1", "prod-priv-2"],
        fcmToken:      ["tk-priv"],
      };
      mockGetDoc
        .mockResolvedValueOnce(makeSnap("user-nuevo", datosPublicos))
        .mockResolvedValueOnce(makeSnap("user-nuevo", datosPrivados));

      const { perfil, favoritosGuardados } =
        await obtenerOCrearPerfilUsuario(userFake);

      // Como ya tiene doc privado, no escribe nada
      expect(mockSetDoc).not.toHaveBeenCalled();
      expect(perfil.nombre).toBe("Valery B. (editado)");
      expect(perfil).not.toHaveProperty("email");
      expect(perfil).not.toHaveProperty("favoritos");
      expect(perfil).not.toHaveProperty("bloqueados");
      expect(perfil).not.toHaveProperty("fcmToken");
      expect(favoritosGuardados).toEqual(["prod-priv-1", "prod-priv-2"]);
    });

    it("usuario existente SIN doc privado: autorrepara creando usuariosPrivado vacío con sede detectada y devuelve favoritosGuardados vacío", async () => {
      const datosPublicos = {
        uid:       "user-nuevo",
        nombre:    "Valery B.",
        email:     "vbedregal@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: ["prod-1", "prod-2"],
        fcmToken:  ["tk-1"],
      };
      mockGetDoc
        .mockResolvedValueOnce(makeSnap("user-nuevo", datosPublicos))
        .mockResolvedValueOnce(makeEmptySnap());
      mockSetDoc.mockResolvedValueOnce(undefined);

      const { perfil, favoritosGuardados } = await obtenerOCrearPerfilUsuario(userFake);

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const [refPriv, datosPriv] = mockSetDoc.mock.calls[0];
      expect(refPriv).toEqual({ _col: "usuariosPrivado", _id: "user-nuevo" });
      expect(datosPriv).toEqual({
        uid: "user-nuevo",
        email: "vbedregal@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: [],
        fcmToken: [],
      });
      expect(favoritosGuardados).toEqual([]);
      expect(perfil).not.toHaveProperty("email");
      expect(perfil).not.toHaveProperty("favoritos");
      expect(perfil).not.toHaveProperty("fcmToken");
    });

    it("tolera fallo en la lectura o escritura de usuariosPrivado sin romper el inicio de sesión", async () => {
      mockGetDoc
        .mockResolvedValueOnce(
          makeSnap("user-nuevo", { nombre: "Valery", favoritos: ["p-legado"] })
        )
        .mockRejectedValueOnce(
          Object.assign(new Error("Denied"), { code: "permission-denied" })
        );
      mockSetDoc.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { code: "permission-denied" })
      );

      const { perfil, favoritosGuardados } = await obtenerOCrearPerfilUsuario(userFake);

      expect(perfil.nombre).toBe("Valery");
      expect(favoritosGuardados).toEqual([]);
    });

    it("usa string vacío para avatar si photoURL es null", async () => {
      mockGetDoc
        .mockResolvedValueOnce(makeEmptySnap())
        .mockResolvedValueOnce(makeEmptySnap());
      mockSetDoc.mockResolvedValue(undefined);

      const { perfil } = await obtenerOCrearPerfilUsuario({ ...userFake, photoURL: null });

      expect(perfil.avatar).toBe("");
    });

    it("lanza Error traducido cuando la lectura del doc público de Firestore falla", async () => {
      mockGetDoc
        .mockRejectedValueOnce(
          Object.assign(new Error("Unavailable"), { code: "unavailable" })
        )
        .mockResolvedValueOnce(makeEmptySnap());

      await expect(obtenerOCrearPerfilUsuario(userFake))
        .rejects.toThrow("Error simulado (firestore)");
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("sincronizarFavoritos", () => {

    it("llama setDoc sobre usuariosPrivado/{uid} con merge:true y máximo 500 favoritos", async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);

      await sincronizarFavoritos("uid-001", ["prod-1", "prod-2", "prod-3"]);

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const [ref, datos, opciones] = mockSetDoc.mock.calls[0];
      expect(ref).toEqual({ _col: "usuariosPrivado", _id: "uid-001" });
      expect(datos).toEqual({ favoritos: ["prod-1", "prod-2", "prod-3"] });
      expect(opciones).toEqual({ merge: true });
    });

    it("recorta la lista a 500 favoritos y puede sincronizar un array vacío", async () => {
      mockSetDoc.mockResolvedValue(undefined);

      const favs600 = Array.from({ length: 600 }, (_, i) => `p-${i}`);
      await sincronizarFavoritos("uid-001", favs600);
      expect(mockSetDoc.mock.calls[0][1].favoritos).toHaveLength(500);

      await sincronizarFavoritos("uid-001", []);
      expect(mockSetDoc.mock.calls[1][1]).toEqual({ favoritos: [] });
    });

  });

  // ══════════════════════════════════════════════════════════
  describe("bloqueos en /bloqueos/{miUid}_{otroUid} (FASE 6A/6B - TAREA 3)", () => {

    it("bloquearUsuario crea /bloqueos/{miUid}_{otroUid} con serverTimestamp y desbloquearUsuario lo elimina (sin tocar /usuarios)", async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      mockDeleteDoc.mockResolvedValueOnce(undefined);

      await bloquearUsuario("yo", "otro");

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc.mock.calls[0]).toEqual([
        { _col: "bloqueos", _id: "yo_otro" },
        {
          bloqueadorUid: "yo",
          bloqueadoUid: "otro",
          creadoEn: { _type: "serverTimestamp" },
        },
      ]);
      expect(mockUpdateDoc).not.toHaveBeenCalled();

      await desbloquearUsuario("yo", "otro");

      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      expect(mockDeleteDoc.mock.calls[0][0]).toEqual({
        _col: "bloqueos",
        _id: "yo_otro",
      });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it("obtenerMisBloqueos devuelve los bloqueadoUid y ante error devuelve []", async () => {
      mockGetDocs.mockResolvedValueOnce(
        makeQuerySnap([
          { id: "yo_u1", data: { bloqueadorUid: "yo", bloqueadoUid: "u1" } },
          { id: "yo_u2", data: { bloqueadorUid: "yo", bloqueadoUid: "u2" } },
        ])
      );

      const res = await obtenerMisBloqueos("yo");
      expect(res).toEqual(["u1", "u2"]);

      mockGetDocs.mockRejectedValueOnce(new Error("Denied"));
      const resErr = await obtenerMisBloqueos("yo");
      expect(resErr).toEqual([]);
    });

    it("existeBloqueo devuelve true/false según getDoc y false en error", async () => {
      mockGetDoc
        .mockResolvedValueOnce(makeSnap("otro_yo", { bloqueadorUid: "otro", bloqueadoUid: "yo" }))
        .mockResolvedValueOnce(makeEmptySnap())
        .mockRejectedValueOnce(new Error("Denied"));

      await expect(existeBloqueo("otro", "yo")).resolves.toBe(true);
      await expect(existeBloqueo("otro", "yo")).resolves.toBe(false);
      await expect(existeBloqueo("otro", "yo")).resolves.toBe(false);
    });

  });

});
