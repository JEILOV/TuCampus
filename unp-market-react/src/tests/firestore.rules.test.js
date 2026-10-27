// src/tests/firestore.rules.test.js
import { readFileSync } from "node:fs";
import process from "node:process";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  deleteField,
  increment,
  arrayUnion,
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

  // ──────────────────────────────────────────────────────────
  //  8. FASE 6A: /usuariosPrivado/{userId}
  // ──────────────────────────────────────────────────────────
  describe("FASE 6A: /usuariosPrivado/{userId}", () => {
    it("el dueño verificado crea y lee su doc; otro usuario y sin sesión NO lo leen", async () => {
      const dbDuenio = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      const dbOtro = ctxEstudiante("u2", "u2@alumnos.unp.edu.pe", true).firestore();
      const dbAnon = testEnv.unauthenticatedContext().firestore();

      await assertSucceeds(
        setDoc(doc(dbDuenio, "usuariosPrivado", "u1"), {
          uid: "u1",
          email: "u1@alumnos.unp.edu.pe",
          universidadId: "unp",
          favoritos: ["p1", "p2"],
          fcmToken: ["tk-1"],
        })
      );

      await assertSucceeds(getDoc(doc(dbDuenio, "usuariosPrivado", "u1")));
      await assertFails(getDoc(doc(dbOtro, "usuariosPrivado", "u1")));
      await assertFails(getDoc(doc(dbAnon, "usuariosPrivado", "u1")));
    });

    it("una clave extra (por ejemplo 'rol') se DENIEGA", async () => {
      const dbDuenio = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();

      await assertFails(
        setDoc(doc(dbDuenio, "usuariosPrivado", "u1"), {
          uid: "u1",
          email: "u1@alumnos.unp.edu.pe",
          universidadId: "unp",
          favoritos: [],
          fcmToken: [],
          rol: "admin",
        })
      );
    });

    it("email de otra persona se DENIEGA", async () => {
      const dbDuenio = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();

      await assertFails(
        setDoc(doc(dbDuenio, "usuariosPrivado", "u1"), {
          uid: "u1",
          email: "otro@alumnos.unp.edu.pe",
          universidadId: "unp",
          favoritos: [],
          fcmToken: [],
        })
      );
    });

    it("universidadId que no corresponde a su correo se DENIEGA", async () => {
      const dbDuenio = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();

      await assertFails(
        setDoc(doc(dbDuenio, "usuariosPrivado", "u1"), {
          uid: "u1",
          email: "u1@alumnos.unp.edu.pe",
          universidadId: "ucv",
          favoritos: [],
          fcmToken: [],
        })
      );
    });

    it("fcmToken con 21 elementos y favoritos con 501 elementos se DENIEGAN", async () => {
      const dbDuenio = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();

      const tokens21 = Array.from({ length: 21 }, (_, i) => `tk-${i}`);
      await assertFails(
        setDoc(doc(dbDuenio, "usuariosPrivado", "u1"), {
          uid: "u1",
          email: "u1@alumnos.unp.edu.pe",
          universidadId: "unp",
          favoritos: [],
          fcmToken: tokens21,
        })
      );

      const favs501 = Array.from({ length: 501 }, (_, i) => `prod-${i}`);
      await assertFails(
        setDoc(doc(dbDuenio, "usuariosPrivado", "u1"), {
          uid: "u1",
          email: "u1@alumnos.unp.edu.pe",
          universidadId: "unp",
          favoritos: favs501,
          fcmToken: [],
        })
      );
    });

    it("cuenta sin verificar se DENIEGA al crear y leer usuariosPrivado", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuariosPrivado", "noVerif"), {
          uid: "noVerif",
          email: "noVerif@alumnos.unp.edu.pe",
          universidadId: "unp",
          favoritos: [],
          fcmToken: [],
        });
      });

      const dbNoVerif = ctxEstudiante("noVerif", "noVerif@alumnos.unp.edu.pe", false).firestore();

      await assertFails(getDoc(doc(dbNoVerif, "usuariosPrivado", "noVerif")));
      await assertFails(
        setDoc(doc(dbNoVerif, "usuariosPrivado", "noVerif"), {
          uid: "noVerif",
          email: "noVerif@alumnos.unp.edu.pe",
          universidadId: "unp",
          favoritos: ["p1"],
          fcmToken: [],
        })
      );
    });
  });

  // ──────────────────────────────────────────────────────────
  //  9. FASE 6A: /bloqueos/{bloqueoId}
  // ──────────────────────────────────────────────────────────
  describe("FASE 6A: /bloqueos/{bloqueoId}", () => {
    it("A crea A_B con serverTimestamp → PERMITIDO; B NO puede crear A_B; A no puede bloquearse a sí mismo; ID inválido se DENIEGA", async () => {
      const dbA = ctxEstudiante("A").firestore();
      const dbB = ctxEstudiante("B").firestore();

      await assertSucceeds(
        setDoc(doc(dbA, "bloqueos", "A_B"), {
          bloqueadorUid: "A",
          bloqueadoUid: "B",
          creadoEn: serverTimestamp(),
        })
      );

      // B no puede crear A_B
      await assertFails(
        setDoc(doc(dbB, "bloqueos", "A_B"), {
          bloqueadorUid: "A",
          bloqueadoUid: "B",
          creadoEn: serverTimestamp(),
        })
      );

      // A no puede bloquearse a sí mismo
      await assertFails(
        setDoc(doc(dbA, "bloqueos", "A_A"), {
          bloqueadorUid: "A",
          bloqueadoUid: "A",
          creadoEn: serverTimestamp(),
        })
      );

      // ID que no coincide con {auth.uid}_{bloqueadoUid} se DENIEGA
      await assertFails(
        setDoc(doc(dbA, "bloqueos", "id_arbitrario"), {
          bloqueadorUid: "A",
          bloqueadoUid: "B",
          creadoEn: serverTimestamp(),
        })
      );
    });

    it("A y B pueden hacer get de A_B (exista o no); un tercero NO puede", async () => {
      const dbA = ctxEstudiante("A").firestore();
      const dbB = ctxEstudiante("B").firestore();
      const dbTercero = ctxEstudiante("C").firestore();

      // Doc inexistente A_B: A y B pueden hacer get y reciben exists() === false
      const snapInexistenteA = await assertSucceeds(getDoc(doc(dbA, "bloqueos", "A_B")));
      expect(snapInexistenteA.exists()).toBe(false);
      const snapInexistenteB = await assertSucceeds(getDoc(doc(dbB, "bloqueos", "A_B")));
      expect(snapInexistenteB.exists()).toBe(false);
      await assertFails(getDoc(doc(dbTercero, "bloqueos", "A_B")));

      // Sembrar A_B
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "bloqueos", "A_B"), {
          bloqueadorUid: "A",
          bloqueadoUid: "B",
          creadoEn: new Date(),
        });
      });

      const snapExistenteA = await assertSucceeds(getDoc(doc(dbA, "bloqueos", "A_B")));
      expect(snapExistenteA.exists()).toBe(true);
      const snapExistenteB = await assertSucceeds(getDoc(doc(dbB, "bloqueos", "A_B")));
      expect(snapExistenteB.exists()).toBe(true);
      await assertFails(getDoc(doc(dbTercero, "bloqueos", "A_B")));
    });

    it("A lista sus bloqueos (where bloqueadorUid == A) y NO puede listar los de otro; nadie actualiza; solo A borra A_B", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "bloqueos", "A_B"), {
          bloqueadorUid: "A",
          bloqueadoUid: "B",
          creadoEn: new Date(),
        });
        await setDoc(doc(ctx.firestore(), "bloqueos", "B_C"), {
          bloqueadorUid: "B",
          bloqueadoUid: "C",
          creadoEn: new Date(),
        });
      });

      const dbA = ctxEstudiante("A").firestore();
      const dbB = ctxEstudiante("B").firestore();

      // A lista sus propios bloqueos
      const qPropios = query(
        collection(dbA, "bloqueos"),
        where("bloqueadorUid", "==", "A")
      );
      const snapPropios = await assertSucceeds(getDocs(qPropios));
      expect(snapPropios.docs.map((d) => d.id)).toEqual(["A_B"]);

      // A NO puede listar los bloqueos de B
      const qAjenos = query(
        collection(dbA, "bloqueos"),
        where("bloqueadorUid", "==", "B")
      );
      await assertFails(getDocs(qAjenos));

      // Nadie puede actualizar A_B
      await assertFails(
        updateDoc(doc(dbA, "bloqueos", "A_B"), { bloqueadoUid: "C" })
      );

      // B NO puede borrar A_B; solo A puede borrar A_B
      await assertFails(deleteDoc(doc(dbB, "bloqueos", "A_B")));
      await assertSucceeds(deleteDoc(doc(dbA, "bloqueos", "A_B")));
    });
  });

  // ──────────────────────────────────────────────────────────
  //  10. FASE 6B: /usuarios/{userId} endurecido (crear y editar)
  // ──────────────────────────────────────────────────────────
  describe("FASE 6B: /usuarios/{userId} — creación y edición de perfil público", () => {
    const perfilInicial6A = (uid = "est1", universidadId = "unp") => ({
      uid,
      nombre: "Estudiante UNP",
      avatar: "https://lh3.googleusercontent.com/a/default",
      ubicacion: "Piura",
      bio: "Estudiante UNP",
      acercaDe: "¡Hola! Bienvenido a mi tienda en el campus.",
      universidadId,
      aceptaYape: false,
      aceptaPlin: false,
      calificacionPromedio: 0,
      totalResenas: 0,
    });

    const perfilConCamposLegados = (uid = "u1", universidadId = "unp") => ({
      ...perfilInicial6A(uid, universidadId),
      email: `${uid}@alumnos.unp.edu.pe`,
      favoritos: ["p1"],
      bloqueados: ["u2"],
      fcmToken: ["tk-1"],
      telefono: "987654321",
    });

    // ── Creación de perfil (/usuarios/{userId}) ───────────────
    it("crear perfil válido (exactamente lo que crea el cliente 6A) → PERMITIDO", async () => {
      const dbEst1 = ctxEstudiante("est1", "est1@alumnos.unp.edu.pe", true).firestore();
      await assertSucceeds(
        setDoc(doc(dbEst1, "usuarios", "est1"), perfilInicial6A("est1", "unp"))
      );
    });

    it("crear perfil con email → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          email: "e2@alumnos.unp.edu.pe",
        })
      );
    });

    it("crear perfil con calificacionPromedio: 5 → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          calificacionPromedio: 5,
        })
      );
    });

    it("crear perfil con totalResenas: 3 → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          totalResenas: 3,
        })
      );
    });

    it("crear perfil con sumaEstrellas → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          sumaEstrellas: 0,
        })
      );
    });

    it("crear perfil con una clave extra → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          rol: "admin",
        })
      );
    });

    it("crear perfil con universidadId que no corresponde a su correo → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2", "e2@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2", "ucv"),
        })
      );
    });

    it("crear perfil con uid distinto del auth → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("otro-uid", "unp"),
        })
      );
    });

    it("crear el perfil de otro usuario → DENEGADO", async () => {
      const dbOtro = ctxEstudiante("otro", "otro@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        setDoc(doc(dbOtro, "usuarios", "e2"), perfilInicial6A("e2", "unp"))
      );
    });

    it("crear perfil desde cuenta sin verificar → DENEGADO", async () => {
      const dbNoVerif = ctxEstudiante("noverif", "noverif@alumnos.unp.edu.pe", false).firestore();
      await assertFails(
        setDoc(doc(dbNoVerif, "usuarios", "noverif"), perfilInicial6A("noverif", "unp"))
      );
    });

    it("crear perfil con aceptaYape: true al crear → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          aceptaYape: true,
        })
      );
    });

    it("crear perfil con nombre vacío → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          nombre: "",
        })
      );
    });

    it("crear perfil con nombre de 101 caracteres → DENEGADO", async () => {
      const dbE2 = ctxEstudiante("e2").firestore();
      await assertFails(
        setDoc(doc(dbE2, "usuarios", "e2"), {
          ...perfilInicial6A("e2"),
          nombre: "A".repeat(101),
        })
      );
    });

    // ── Edición de perfil sobre doc CON campos legados (email, favoritos, bloqueados, fcmToken, telefono) ──
    it("dueño con doc que conserva campos legados: edita solo nombre → PERMITIDO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilConCamposLegados("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertSucceeds(
        updateDoc(doc(dbU1, "usuarios", "u1"), { nombre: "Valery Nuevo Nombre" })
      );
    });

    it("dueño con doc que conserva campos legados: el batch.update exacto de guardarContactoPrivado (con telefono: deleteField()) → PERMITIDO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilConCamposLegados("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      const batch = writeBatch(dbU1);
      batch.set(
        doc(dbU1, "usuarios", "u1", "privado", "contacto"),
        {
          telefono: "999888777",
          metodosPago: {
            yape: { activo: true, numero: "999888777" },
            plin: { activo: false, numero: "" },
          },
        },
        { merge: true }
      );
      batch.update(doc(dbU1, "usuarios", "u1"), {
        nombre: "Valery Editada",
        bio: "Ing. Informática",
        acercaDe: "Vendo libros y calculadoras",
        ubicacion: "Campus UNP",
        avatar: "https://i.ibb.co/avatar.webp",
        portada: "https://i.ibb.co/portada.webp",
        aceptaYape: true,
        aceptaPlin: false,
        telefono: deleteField(),
      });
      await assertSucceeds(batch.commit());
    });

    it("dueño con doc que conserva campos legados: totalPublicaciones +1 → PERMITIDO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilConCamposLegados("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertSucceeds(
        updateDoc(doc(dbU1, "usuarios", "u1"), { totalPublicaciones: increment(1) })
      );
    });

    it("dueño con doc que conserva campos legados: cambia el valor de email → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilConCamposLegados("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { email: "otro@alumnos.unp.edu.pe" })
      );
    });

    it("dueño con doc que conserva campos legados: agrega un elemento a favoritos → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilConCamposLegados("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { favoritos: arrayUnion("p2") })
      );
    });

    it("dueño con doc que conserva campos legados: borra email → PERMITIDO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilConCamposLegados("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertSucceeds(
        updateDoc(doc(dbU1, "usuarios", "u1"), { email: deleteField() })
      );
    });

    it("dueño con doc que conserva campos legados: borra todos los campos legados (email, favoritos, bloqueados, fcmToken, telefono) → PERMITIDO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilConCamposLegados("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertSucceeds(
        updateDoc(doc(dbU1, "usuarios", "u1"), {
          email: deleteField(),
          favoritos: deleteField(),
          bloqueados: deleteField(),
          fcmToken: deleteField(),
          telefono: deleteField(),
        })
      );
    });

    // ── Edición de perfil sobre doc SIN campos legados ────────
    it("doc sin campos legados: agregar email → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { email: "u1@alumnos.unp.edu.pe" })
      );
    });

    it("doc sin campos legados: agregar favoritos → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { favoritos: ["p1"] })
      );
    });

    it("doc sin campos legados: agregar bloqueados → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { bloqueados: ["u2"] })
      );
    });

    it("doc sin campos legados: agregar fcmToken → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { fcmToken: ["tk-1"] })
      );
    });

    it("doc sin campos legados: agregar telefono → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { telefono: "987654321" })
      );
    });

    it("doc sin campos legados: editar los 8 campos de guardarContactoPrivado cuando ya no hay telefono → PERMITIDO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertSucceeds(
        updateDoc(doc(dbU1, "usuarios", "u1"), {
          nombre: "Valery Editada 2",
          bio: "Ing. Informática",
          acercaDe: "Vendo apuntes",
          ubicacion: "Piura",
          avatar: "https://i.ibb.co/avatar2.webp",
          portada: "https://i.ibb.co/portada2.webp",
          aceptaYape: false,
          aceptaPlin: true,
        })
      );
    });

    it("editar perfil (dueño): cambiar uid → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(updateDoc(doc(dbU1, "usuarios", "u1"), { uid: "otro" }));
    });

    it("editar perfil (dueño): cambiar universidadId → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(updateDoc(doc(dbU1, "usuarios", "u1"), { universidadId: "ucv" }));
    });

    it("editar perfil (dueño): totalPublicaciones +1 (desde no existir → 1, y de 1 → 2) → PERMITIDO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertSucceeds(
        updateDoc(doc(dbU1, "usuarios", "u1"), { totalPublicaciones: increment(1) })
      );
      await assertSucceeds(
        updateDoc(doc(dbU1, "usuarios", "u1"), { totalPublicaciones: increment(1) })
      );
    });

    it("editar perfil (dueño): totalPublicaciones +5 → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), {
          ...perfilInicial6A("u1", "unp"),
          totalPublicaciones: 2,
        });
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { totalPublicaciones: increment(5) })
      );
    });

    it("editar perfil (dueño): totalPublicaciones -1 → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), {
          ...perfilInicial6A("u1", "unp"),
          totalPublicaciones: 2,
        });
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { totalPublicaciones: increment(-1) })
      );
    });

    it("editar perfil (dueño): nombre vacío → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(updateDoc(doc(dbU1, "usuarios", "u1"), { nombre: "" }));
    });

    it("editar perfil (dueño): nombre de 101 caracteres → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), { nombre: "X".repeat(101) })
      );
    });

    it("editar perfil (dueño): aceptaYape no booleano → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(updateDoc(doc(dbU1, "usuarios", "u1"), { aceptaYape: "si" }));
    });

    it("editar perfil (dueño): update que mezcle nombre + calificacionPromedio → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbU1 = ctxEstudiante("u1", "u1@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbU1, "usuarios", "u1"), {
          nombre: "Nombre Valido",
          calificacionPromedio: 5,
        })
      );
    });

    it("editar perfil: otro usuario editando nombre del perfil ajeno → DENEGADO", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "usuarios", "u1"), perfilInicial6A("u1", "unp"));
      });
      const dbOtro = ctxEstudiante("otro", "otro@alumnos.unp.edu.pe", true).firestore();
      await assertFails(
        updateDoc(doc(dbOtro, "usuarios", "u1"), { nombre: "Intruso" })
      );
    });
  });
});
