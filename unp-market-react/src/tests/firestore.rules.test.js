// src/tests/firestore.rules.test.js
import { readFileSync } from "node:fs";
import process from "node:process";
import { describe, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  setLogLevel,
} from "firebase/firestore";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

const EMULATOR_ACTIVO = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.runIf(EMULATOR_ACTIVO)("Firestore Security Rules — Fase 1", () => {
  let testEnv;

  const ctxEstudiante = (uid, email = `${uid}@alumnos.unp.edu.pe`, emailVerified = true) =>
    testEnv.authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
    });

  const ctxAdmin = (emailVerified = true) =>
    testEnv.authenticatedContext("admin-uid", {
      email: "0512023070@alumnos.unp.edu.pe",
      email_verified: emailVerified,
    });

  const productoBase = (userUid = "est1") => ({
    titulo: "Calculadora Casio",
    descripcion: "Casi nueva, incluye tapa",
    precio: 45,
    categoria: "tecnologia",
    estado: "disponible",
    keywords: ["cal", "casio"],
    universidadId: "unp",
    userUid,
    condicion: "como_nuevo",
  });

  const anuncioBase = () => ({
    titulo: "Bienvenidos a TuCampus",
    subtitulo: "Compra y vende en tu sede",
    colorFondo: "#0f4c81",
    imagenUrl: "https://i.ibb.co/ejemplo.png",
    enlaceUrl: "https://www.tucampus.net.pe",
    orden: 1,
    activo: true,
    universidadId: "unp",
  });

  beforeAll(async () => {
    setLogLevel("error");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-unp-market",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  // ──────────────────────────────────────────────────────────
  //  1. Correo verificado (S04)
  // ──────────────────────────────────────────────────────────
  describe("Correo verificado (S04)", () => {
    it("usuario con dominio válido y email_verified: false NO puede crear un producto ni enviar un mensaje", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "chats", "noVerif_otro"), {
          participantes: ["noVerif", "otro"],
        });
      });

      const dbNoVerif = ctxEstudiante("noVerif", "noVerif@utp.edu.pe", false).firestore();

      await assertFails(
        setDoc(doc(dbNoVerif, "productos", "prod-1"), productoBase("noVerif"))
      );

      await assertFails(
        setDoc(doc(dbNoVerif, "chats", "noVerif_otro", "mensajes", "msg-1"), {
          deUid: "noVerif",
          tipo: "texto",
          texto: "Hola, ¿sigue disponible?",
        })
      );
    });

    it("usuario con dominio válido y email_verified: true SÍ puede crear un producto", async () => {
      const dbVerif = ctxEstudiante("verif1", "verif1@alumnos.unp.edu.pe", true).firestore();

      await assertSucceeds(
        setDoc(doc(dbVerif, "productos", "prod-ok"), productoBase("verif1"))
      );
    });

    it("admin con email_verified: false NO puede crear un anuncio; con true SÍ", async () => {
      const dbAdminNoVerif = ctxAdmin(false).firestore();
      const dbAdminVerif = ctxAdmin(true).firestore();

      await assertFails(
        setDoc(doc(dbAdminNoVerif, "anuncios", "anuncio-1"), anuncioBase())
      );

      await assertSucceeds(
        setDoc(doc(dbAdminVerif, "anuncios", "anuncio-1"), anuncioBase())
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  //  2. Seguidores (S05)
  // ──────────────────────────────────────────────────────────
  describe("Seguidores (S05) — usuario 'yo' sobre el documento del vendedor 'V'", () => {
    const sembrarVendedor = async (seguidoresIniciales) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "V"), {
          nombre: "Vendedor V",
          seguidores: seguidoresIniciales,
        });
      });
    };

    it("seguidores: ['x'] → ['x', 'yo'] PERMITIDO", async () => {
      await sembrarVendedor(["x"]);
      const dbYo = ctxEstudiante("yo").firestore();

      await assertSucceeds(
        updateDoc(doc(dbYo, "usuarios", "V"), { seguidores: ["x", "yo"] })
      );
    });

    it("seguidores: ['x', 'yo'] → ['x'] PERMITIDO", async () => {
      await sembrarVendedor(["x", "yo"]);
      const dbYo = ctxEstudiante("yo").firestore();

      await assertSucceeds(
        updateDoc(doc(dbYo, "usuarios", "V"), { seguidores: ["x"] })
      );
    });

    it("seguidores: [] → ['yo'] PERMITIDO", async () => {
      await sembrarVendedor([]);
      const dbYo = ctxEstudiante("yo").firestore();

      await assertSucceeds(
        updateDoc(doc(dbYo, "usuarios", "V"), { seguidores: ["yo"] })
      );
    });

    it("['yo'] → ['yo', 'otro'] DENEGADO", async () => {
      await sembrarVendedor(["yo"]);
      const dbYo = ctxEstudiante("yo").firestore();

      await assertFails(
        updateDoc(doc(dbYo, "usuarios", "V"), { seguidores: ["yo", "otro"] })
      );
    });

    it("['yo', 'otro'] → ['yo'] DENEGADO", async () => {
      await sembrarVendedor(["yo", "otro"]);
      const dbYo = ctxEstudiante("yo").firestore();

      await assertFails(
        updateDoc(doc(dbYo, "usuarios", "V"), { seguidores: ["yo"] })
      );
    });

    it("['x'] → ['x', 'otro'] DENEGADO", async () => {
      await sembrarVendedor(["x"]);
      const dbYo = ctxEstudiante("yo").firestore();

      await assertFails(
        updateDoc(doc(dbYo, "usuarios", "V"), { seguidores: ["x", "otro"] })
      );
    });

    it("['yo'] → ['yo', 'yo'] DENEGADO", async () => {
      await sembrarVendedor(["yo"]);
      const dbYo = ctxEstudiante("yo").firestore();

      await assertFails(
        updateDoc(doc(dbYo, "usuarios", "V"), { seguidores: ["yo", "yo"] })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  //  3. Chat (ID canónico)
  // ──────────────────────────────────────────────────────────
  describe("Chat (ID canónico)", () => {
    it("crear chats/A_B con participantes: ['A', 'B'] siendo A el usuario autenticado: PERMITIDO", async () => {
      const dbA = ctxEstudiante("A").firestore();

      await assertSucceeds(
        setDoc(doc(dbA, "chats", "A_B"), {
          participantes: ["A", "B"],
        })
      );
    });

    it("crear chats/A_B con participantes: ['atacante', 'A']: DENEGADO", async () => {
      const dbAtacante = ctxEstudiante("atacante").firestore();

      await assertFails(
        setDoc(doc(dbAtacante, "chats", "A_B"), {
          participantes: ["atacante", "A"],
        })
      );
    });

    it("crear un chat con participantes: ['A', 'A']: DENEGADO", async () => {
      const dbA = ctxEstudiante("A").firestore();

      await assertFails(
        setDoc(doc(dbA, "chats", "A_A"), {
          participantes: ["A", "A"],
        })
      );
    });

    it("un tercero no participante NO puede leer ni escribir mensajes del chat", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "chats", "A_B"), {
          participantes: ["A", "B"],
        });
        await setDoc(doc(ctx.firestore(), "chats", "A_B", "mensajes", "msg-1"), {
          deUid: "A",
          tipo: "texto",
          texto: "Mensaje privado",
          leido: false,
        });
      });

      const dbTercero = ctxEstudiante("tercero").firestore();

      await assertFails(
        getDoc(doc(dbTercero, "chats", "A_B", "mensajes", "msg-1"))
      );

      await assertFails(
        setDoc(doc(dbTercero, "chats", "A_B", "mensajes", "msg-2"), {
          deUid: "tercero",
          tipo: "texto",
          texto: "Intruso",
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  //  4. Reseñas
  // ──────────────────────────────────────────────────────────
  describe("Reseñas", () => {
    const dbAutor = () => ctxEstudiante("autor1").firestore();
    const resenaDoc = (estrellas) => ({
      autorUid: "autor1",
      vendedorUid: "vendedor1",
      estrellas,
      comentario: "Buen servicio",
    });

    it("reseña con estrellas: 4 PERMITIDA", async () => {
      await assertSucceeds(
        setDoc(doc(dbAutor(), "resenas", "autor1_vendedor1"), resenaDoc(4))
      );
    });

    it("reseña con estrellas: 4.5 DENEGADA", async () => {
      await assertFails(
        setDoc(doc(dbAutor(), "resenas", "autor1_vendedor1"), resenaDoc(4.5))
      );
    });

    it("reseña con estrellas: 0 o 6 DENEGADA", async () => {
      await assertFails(
        setDoc(doc(dbAutor(), "resenas", "autor1_vendedor1"), resenaDoc(0))
      );
      await assertFails(
        setDoc(doc(dbAutor(), "resenas", "autor1_vendedor1"), resenaDoc(6))
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  //  5. Regresiones
  // ──────────────────────────────────────────────────────────
  describe("Regresiones", () => {
    it("dueño edita su propio producto; no puede editar el de otro", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "productos", "prod-duenio"), productoBase("duenio1"));
      });

      const dbDuenio = ctxEstudiante("duenio1").firestore();
      const dbOtro = ctxEstudiante("otro1").firestore();

      await assertSucceeds(
        updateDoc(doc(dbDuenio, "productos", "prod-duenio"), {
          precio: 40,
        })
      );

      await assertFails(
        updateDoc(doc(dbOtro, "productos", "prod-duenio"), {
          precio: 1,
        })
      );
    });

    it("edición de texto de un mensaje propio; marcar como leído un mensaje ajeno (false → true)", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "chats", "A_B"), {
          participantes: ["A", "B"],
        });
        await setDoc(doc(ctx.firestore(), "chats", "A_B", "mensajes", "msg-a"), {
          deUid: "A",
          tipo: "texto",
          texto: "Texto original",
          leido: false,
        });
      });

      const dbA = ctxEstudiante("A").firestore();
      const dbB = ctxEstudiante("B").firestore();

      await assertSucceeds(
        updateDoc(doc(dbA, "chats", "A_B", "mensajes", "msg-a"), {
          texto: "Texto editado",
          editado: true,
          fechaEdicion: serverTimestamp(),
        })
      );

      await assertSucceeds(
        updateDoc(doc(dbB, "chats", "A_B", "mensajes", "msg-a"), {
          leido: true,
        })
      );
    });

    it("un usuario no puede borrar mensajes", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "chats", "A_B"), {
          participantes: ["A", "B"],
        });
        await setDoc(doc(ctx.firestore(), "chats", "A_B", "mensajes", "msg-a"), {
          deUid: "A",
          tipo: "texto",
          texto: "No borrable",
          leido: false,
        });
      });

      const dbA = ctxEstudiante("A").firestore();
      await assertFails(
        deleteDoc(doc(dbA, "chats", "A_B", "mensajes", "msg-a"))
      );
    });

    it("lectura pública de productos, anuncios y reseñas sigue permitida", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "productos", "p1"), productoBase("u1"));
        await setDoc(doc(ctx.firestore(), "anuncios", "a1"), anuncioBase());
        await setDoc(doc(ctx.firestore(), "resenas", "u1_u2"), {
          autorUid: "u1",
          vendedorUid: "u2",
          estrellas: 5,
          comentario: "Excelente",
        });
      });

      const dbAnon = testEnv.unauthenticatedContext().firestore();

      await assertSucceeds(getDoc(doc(dbAnon, "productos", "p1")));
      await assertSucceeds(getDoc(doc(dbAnon, "anuncios", "a1")));
      await assertSucceeds(getDoc(doc(dbAnon, "resenas", "u1_u2")));
    });
  });

  // ── 7. H03: sumaEstrellas en /usuarios/{userId} ─────────────────────────
  describe("H03: sumaEstrellas en /usuarios/{userId}", () => {
    it("actualizar ['calificacionPromedio', 'totalResenas', 'sumaEstrellas'] con sumaEstrellas entero pasa", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "vendedor"), {
          nombre: "Vendedor",
          calificacionPromedio: 0,
          totalResenas: 0,
          sumaEstrellas: 0,
        });
      });

      const dbAutor = ctxEstudiante("autor").firestore();
      await assertSucceeds(
        updateDoc(doc(dbAutor, "usuarios", "vendedor"), {
          calificacionPromedio: 4.5,
          totalResenas: 2,
          sumaEstrellas: 9,
        })
      );
    });

    it("actualizar reputación de otro usuario incluyendo un campo extra falla", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "vendedor"), {
          nombre: "Vendedor",
          calificacionPromedio: 0,
          totalResenas: 0,
          sumaEstrellas: 0,
        });
      });

      const dbAutor = ctxEstudiante("autor").firestore();
      await assertFails(
        updateDoc(doc(dbAutor, "usuarios", "vendedor"), {
          calificacionPromedio: 4.5,
          totalResenas: 2,
          sumaEstrellas: 9,
          nombre: "Hackeado",
        })
      );
    });

    it("actualizar reputación con sumaEstrellas decimal (4.5) falla", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "vendedor"), {
          nombre: "Vendedor",
          calificacionPromedio: 0,
          totalResenas: 0,
          sumaEstrellas: 0,
        });
      });

      const dbAutor = ctxEstudiante("autor").firestore();
      await assertFails(
        updateDoc(doc(dbAutor, "usuarios", "vendedor"), {
          calificacionPromedio: 4.5,
          totalResenas: 1,
          sumaEstrellas: 4.5,
        })
      );
    });
  });
});
