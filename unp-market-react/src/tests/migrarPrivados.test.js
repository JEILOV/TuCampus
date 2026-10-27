// src/tests/migrarPrivados.test.js
// ============================================================
//  TESTS UNITARIOS — scripts/migrarPrivados.mjs (FASE 6A - TAREA 2)
// ============================================================

import { describe, it, expect } from "vitest";
import {
  construirMigracionUsuario,
  MAX_FAVORITOS,
  MAX_FCM_TOKENS,
} from "../../scripts/migrarPrivados.mjs";

describe("scripts/migrarPrivados.mjs — construirMigracionUsuario (TAREA 2)", () => {
  it("caso sin campos legados: no requiere escritura privada ni crea bloqueos", () => {
    const res = construirMigracionUsuario({
      uid: "u-limpio",
      datosPublicos: {
        nombre: "Estudiante",
        bio: "Bio",
      },
      datosPrivadosExistentes: null,
      bloqueosExistentes: new Set(),
      creadoEn: "ts-fijo",
    });

    expect(res.requiereEscrituraPrivada).toBe(false);
    expect(res.bloqueosACrear).toEqual([]);
    expect(res.payloadPrivado).toEqual({
      uid: "u-limpio",
      favoritos: [],
      fcmToken: [],
    });
  });

  it("con arreglos largos: recorta favoritos a 500 y se queda con los últimos 20 fcmToken", () => {
    const favoritos600 = Array.from({ length: 600 }, (_, i) => `prod-${i}`);
    const tokens30 = Array.from({ length: 30 }, (_, i) => `token-${i}`);

    const res = construirMigracionUsuario({
      uid: "u-largo",
      datosPublicos: {
        email: "u@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: favoritos600,
        fcmToken: tokens30,
      },
      datosPrivadosExistentes: null,
      bloqueosExistentes: new Set(),
      creadoEn: "ts-fijo",
    });

    expect(res.requiereEscrituraPrivada).toBe(true);
    expect(res.payloadPrivado.favoritos).toHaveLength(MAX_FAVORITOS);
    expect(res.payloadPrivado.favoritos[0]).toBe("prod-0");
    expect(res.payloadPrivado.favoritos[499]).toBe("prod-499");

    expect(res.payloadPrivado.fcmToken).toHaveLength(MAX_FCM_TOKENS);
    // Últimos 20: token-10 .. token-29
    expect(res.payloadPrivado.fcmToken[0]).toBe("token-10");
    expect(res.payloadPrivado.fcmToken[19]).toBe("token-29");
  });

  it("con strings inválidos: descarta vacíos, no-strings, duplicados y autobloqueo", () => {
    const res = construirMigracionUsuario({
      uid: "u-1",
      datosPublicos: {
        email: "  u1@utp.edu.pe  ",
        universidadId: "utp",
        favoritos: ["p1", "", "   ", null, 123, "p1", "p2"],
        fcmToken: ["", "   ", undefined, "tk-a", "tk-b", "tk-a"],
        bloqueados: ["u-1", "", "   ", null, "u-2", "u-2", "u-3"],
      },
      datosPrivadosExistentes: null,
      bloqueosExistentes: new Set(["u-1_u-2"]),
      creadoEn: "ts-123",
    });

    expect(res.requiereEscrituraPrivada).toBe(true);
    expect(res.payloadPrivado).toEqual({
      uid: "u-1",
      email: "u1@utp.edu.pe",
      universidadId: "utp",
      favoritos: ["p1", "p2"],
      fcmToken: ["tk-a", "tk-b"],
    });

    // u-1 (autobloqueo) y u-1_u-2 (ya existente) se omiten; solo se crea u-1_u-3
    expect(res.bloqueosACrear).toEqual([
      {
        id: "u-1_u-3",
        data: {
          bloqueadorUid: "u-1",
          bloqueadoUid: "u-3",
          creadoEn: "ts-123",
        },
      },
    ]);
  });

  it("con doc privado existente: NO sobrescribe email ni universidadId, une arreglos sin duplicados y es idempotente", () => {
    const res = construirMigracionUsuario({
      uid: "u-existente",
      datosPublicos: {
        email: "viejo@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: ["p2", "p3"],
        fcmToken: ["tk-1", "tk-2"],
      },
      datosPrivadosExistentes: {
        uid: "u-existente",
        email: "actual@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: ["p1", "p2"],
        fcmToken: ["tk-0", "tk-1"],
      },
      bloqueosExistentes: new Set(),
      creadoEn: "ts-fijo",
    });

    expect(res.requiereEscrituraPrivada).toBe(true);
    expect(res.payloadPrivado).not.toHaveProperty("email");
    expect(res.payloadPrivado).not.toHaveProperty("universidadId");
    expect(res.payloadPrivado).toEqual({
      favoritos: ["p1", "p2", "p3"],
      fcmToken: ["tk-0", "tk-1", "tk-2"],
    });

    // Segunda pasada idempotente con los datos ya unidos
    const resSegundaPasada = construirMigracionUsuario({
      uid: "u-existente",
      datosPublicos: {
        email: "viejo@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: ["p2", "p3"],
        fcmToken: ["tk-1", "tk-2"],
      },
      datosPrivadosExistentes: {
        uid: "u-existente",
        email: "actual@alumnos.unp.edu.pe",
        universidadId: "unp",
        favoritos: ["p1", "p2", "p3"],
        fcmToken: ["tk-0", "tk-1", "tk-2"],
      },
      bloqueosExistentes: new Set(),
      creadoEn: "ts-fijo",
    });

    expect(resSegundaPasada.requiereEscrituraPrivada).toBe(false);
    expect(resSegundaPasada.bloqueosACrear).toEqual([]);
  });

  it("con bloqueados vacíos o ausentes devuelve bloqueosACrear vacío", () => {
    const res = construirMigracionUsuario({
      uid: "u-sin-bloq",
      datosPublicos: {
        email: "u@ucvvirtual.edu.pe",
        universidadId: "ucv",
        bloqueados: [],
      },
    });

    expect(res.bloqueosACrear).toEqual([]);
    expect(res.conteos.bloqueos).toBe(0);
  });
});
