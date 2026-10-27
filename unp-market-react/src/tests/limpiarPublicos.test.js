// src/tests/limpiarPublicos.test.js
import { describe, it, expect, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(),
  FieldValue: { delete: vi.fn(() => ({ _type: "deleteField" })) },
}));

import { construirLimpieza } from "../../scripts/limpiarPublicos.mjs";

describe("scripts/limpiarPublicos.mjs — construirLimpieza (FASE 6B - TAREA 2)", () => {
  it("sin campos legados: devuelve camposABorrar y omitidos vacíos", () => {
    const res = construirLimpieza({
      uid: "u1",
      datosPublicos: {
        uid: "u1",
        nombre: "Valery",
        universidadId: "unp",
      },
      datosPrivados: null,
      bloqueosExistentes: new Set(),
      contactoPrivado: null,
    });

    expect(res).toEqual({
      camposABorrar: [],
      omitidos: [],
    });
  });

  it("todo seguro: marca para borrar email, favoritos, fcmToken, bloqueados y telefono cuando están respaldados en sus destinos", () => {
    const res = construirLimpieza({
      uid: "u1",
      datosPublicos: {
        uid: "u1",
        email: "u1@alumnos.unp.edu.pe",
        favoritos: ["p1", "p2"],
        fcmToken: ["tk-1", "tk-viejo-invalido"],
        bloqueados: ["u2", "u3"],
        telefono: "987654321",
      },
      datosPrivados: {
        uid: "u1",
        email: "u1@alumnos.unp.edu.pe",
        favoritos: ["p1", "p2", "p3"],
        // Solo conserva tk-1 (tk-viejo-invalido ya fue limpiado del privado, no bloquea el borrado)
        fcmToken: ["tk-1"],
      },
      bloqueosExistentes: new Set(["u1_u2", "u1_u3"]),
      contactoPrivado: { telefono: "987654321" },
    });

    expect(res.camposABorrar).toEqual([
      "email",
      "favoritos",
      "fcmToken",
      "bloqueados",
      "telefono",
    ]);
    expect(res.omitidos).toEqual([]);
  });

  it("favoritos que NO están a salvo en el doc privado se omiten con motivo", () => {
    const res = construirLimpieza({
      uid: "u1",
      datosPublicos: {
        favoritos: ["p1", "p2"],
      },
      datosPrivados: {
        favoritos: ["p1"],
      },
    });

    expect(res.camposABorrar).toEqual([]);
    expect(res.omitidos).toEqual([
      { campo: "favoritos", motivo: "faltan 1 favoritos en doc privado" },
    ]);
  });

  it("tokens solo en el documento público (y privado vacío) se omiten con motivo", () => {
    const res = construirLimpieza({
      uid: "u1",
      datosPublicos: {
        fcmToken: ["tk-activo"],
      },
      datosPrivados: {
        fcmToken: [],
      },
    });

    expect(res.camposABorrar).toEqual([]);
    expect(res.omitidos).toEqual([
      { campo: "fcmToken", motivo: "tokens solo en doc público" },
    ]);
  });

  it("bloqueado sin doc de bloqueo en /bloqueos se omite con motivo", () => {
    const res = construirLimpieza({
      uid: "u1",
      datosPublicos: {
        bloqueados: ["u2", "u3"],
      },
      datosPrivados: { uid: "u1" },
      bloqueosExistentes: new Set(["u1_u2"]),
    });

    expect(res.camposABorrar).toEqual([]);
    expect(res.omitidos).toEqual([
      { campo: "bloqueados", motivo: "faltan 1 docs en /bloqueos" },
    ]);
  });

  it("telefono: se borra si tiene copia en privado/contacto o si está vacío en el público; se omite si no hay copia privada", () => {
    const sinCopia = construirLimpieza({
      uid: "u1",
      datosPublicos: { telefono: "987654321" },
      contactoPrivado: null,
    });
    expect(sinCopia.camposABorrar).toEqual([]);
    expect(sinCopia.omitidos).toEqual([
      { campo: "telefono", motivo: "sin copia privada" },
    ]);

    const conCopia = construirLimpieza({
      uid: "u1",
      datosPublicos: { telefono: "987654321" },
      contactoPrivado: { telefono: "987654321" },
    });
    expect(conCopia.camposABorrar).toEqual(["telefono"]);
    expect(conCopia.omitidos).toEqual([]);

    const vacioEnPublico = construirLimpieza({
      uid: "u1",
      datosPublicos: { telefono: "   " },
      contactoPrivado: null,
    });
    expect(vacioEnPublico.camposABorrar).toEqual(["telefono"]);
    expect(vacioEnPublico.omitidos).toEqual([]);
  });

  it("sin doc privado: omite email, favoritos y fcmToken con motivo 'sin doc privado'", () => {
    const res = construirLimpieza({
      uid: "u1",
      datosPublicos: {
        email: "u1@alumnos.unp.edu.pe",
        favoritos: [],
        fcmToken: [],
      },
      datosPrivados: null,
    });

    expect(res.camposABorrar).toEqual([]);
    expect(res.omitidos).toEqual([
      { campo: "email", motivo: "sin doc privado" },
      { campo: "favoritos", motivo: "sin doc privado" },
      { campo: "fcmToken", motivo: "sin doc privado" },
    ]);
  });
});
