// scripts/recalcularReputacion.mjs
// ============================================================
//  Script de migración (H03): recalcula sumaEstrellas, totalResenas
//  y calificacionPromedio en /usuarios y sincroniza calificacionVendedor
//  y totalResenasVendedor en /productos a partir de /resenas.
//
//  Requisitos:
//    export GOOGLE_APPLICATION_CREDENTIALS="/ruta/a/serviceAccountKey.json"
//
//  Uso:
//    node scripts/recalcularReputacion.mjs           # Dry-run (por defecto, no escribe)
//    node scripts/recalcularReputacion.mjs --apply   # Respalda y aplica cambios en batches de <= 400 ops
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const MAX_BATCH_OPS = 400;
const apply = process.argv.includes("--apply");

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error(
    "Error: Debes definir la variable de entorno GOOGLE_APPLICATION_CREDENTIALS con la ruta a las credenciales de servicio."
  );
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf8"));
} catch (err) {
  console.error(`Error al leer GOOGLE_APPLICATION_CREDENTIALS (${credPath}):`, err.message);
  process.exit(1);
}

const projectId = serviceAccount.project_id;
if (!projectId) {
  console.error("Error: Las credenciales no contienen un project_id válido.");
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId,
});

const db = getFirestore(app);

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatearValor = (val) => (val === undefined ? "undefined" : String(val));

async function main() {
  console.log(`Proyecto Firebase (projectId): ${app.options.projectId}`);
  console.log(`Modo: ${apply ? "APPLY (escritura real)" : "DRY-RUN (solo lectura)"}`);

  if (apply) {
    console.log("Esperando 5 segundos antes de iniciar lecturas/escrituras (presiona Ctrl+C para cancelar)...");
    await esperar(5000);
  }

  const [usuariosSnap, resenasSnap, productosSnap] = await Promise.all([
    db.collection("usuarios").get(),
    db.collection("resenas").get(),
    db.collection("productos").get(),
  ]);

  // 5. Agrupar reseñas válidas y descartar las que no tengan estrellas entero 1..5 o les falte vendedorUid
  const agregadosPorVendedor = new Map();
  const resenasDescartadas = [];

  for (const docSnap of resenasSnap.docs) {
    const data = docSnap.data();
    const vendedorUid =
      typeof data.vendedorUid === "string" ? data.vendedorUid.trim() : "";
    const estrellas = data.estrellas;
    const estrellasValidas =
      typeof estrellas === "number" &&
      Number.isInteger(estrellas) &&
      estrellas >= 1 &&
      estrellas <= 5;

    if (!vendedorUid || !estrellasValidas) {
      resenasDescartadas.push(docSnap.id);
      continue;
    }

    const actual = agregadosPorVendedor.get(vendedorUid) || {
      sumaEstrellas: 0,
      totalResenas: 0,
    };

    actual.sumaEstrellas += estrellas;
    actual.totalResenas += 1;
    agregadosPorVendedor.set(vendedorUid, actual);
  }

  const reputacionFinalPorVendedor = new Map();

  // Calcular reputación para todos los usuarios (sin reseñas -> 0)
  for (const userDoc of usuariosSnap.docs) {
    const uid = userDoc.id;
    const agg = agregadosPorVendedor.get(uid) || { sumaEstrellas: 0, totalResenas: 0 };
    const sumaEstrellas = agg.sumaEstrellas;
    const totalResenas = agg.totalResenas;
    const calificacionPromedio =
      totalResenas > 0 ? Math.round((sumaEstrellas / totalResenas) * 10) / 10 : 0;

    reputacionFinalPorVendedor.set(uid, {
      sumaEstrellas,
      totalResenas,
      calificacionPromedio,
    });
  }

  for (const [uid, agg] of agregadosPorVendedor.entries()) {
    if (!reputacionFinalPorVendedor.has(uid)) {
      const sumaEstrellas = agg.sumaEstrellas;
      const totalResenas = agg.totalResenas;
      const calificacionPromedio =
        totalResenas > 0 ? Math.round((sumaEstrellas / totalResenas) * 10) / 10 : 0;
      reputacionFinalPorVendedor.set(uid, {
        sumaEstrellas,
        totalResenas,
        calificacionPromedio,
      });
    }
  }

  const operaciones = [];
  let usuariosCambian = 0;
  let usuariosCorrectos = 0;
  let productosCambian = 0;
  let productosCorrectos = 0;

  for (const userDoc of usuariosSnap.docs) {
    const actual = userDoc.data();
    const rep = reputacionFinalPorVendedor.get(userDoc.id) || {
      sumaEstrellas: 0,
      totalResenas: 0,
      calificacionPromedio: 0,
    };

    const difiere =
      actual.sumaEstrellas !== rep.sumaEstrellas ||
      actual.totalResenas !== rep.totalResenas ||
      actual.calificacionPromedio !== rep.calificacionPromedio;

    if (!difiere) {
      usuariosCorrectos += 1;
      continue;
    }

    usuariosCambian += 1;
    console.log(
      `usuario/${userDoc.id}: sumaEstrellas ${formatearValor(actual.sumaEstrellas)}→${rep.sumaEstrellas}, totalResenas ${formatearValor(actual.totalResenas)}→${rep.totalResenas}, calificacionPromedio ${formatearValor(actual.calificacionPromedio)}→${rep.calificacionPromedio}`
    );

    operaciones.push({
      ref: userDoc.ref,
      path: userDoc.ref.path,
      before: {
        sumaEstrellas: actual.sumaEstrellas !== undefined ? actual.sumaEstrellas : null,
        totalResenas: actual.totalResenas !== undefined ? actual.totalResenas : null,
        calificacionPromedio:
          actual.calificacionPromedio !== undefined ? actual.calificacionPromedio : null,
        _existedFields: {
          sumaEstrellas: "sumaEstrellas" in actual,
          totalResenas: "totalResenas" in actual,
          calificacionPromedio: "calificacionPromedio" in actual,
        },
      },
      data: {
        sumaEstrellas: rep.sumaEstrellas,
        totalResenas: rep.totalResenas,
        calificacionPromedio: rep.calificacionPromedio,
      },
    });
  }

  for (const prodDoc of productosSnap.docs) {
    const actual = prodDoc.data();
    const vendedorUid = actual.userUid;
    const rep = (vendedorUid && reputacionFinalPorVendedor.get(vendedorUid)) || {
      sumaEstrellas: 0,
      totalResenas: 0,
      calificacionPromedio: 0,
    };

    const difiere =
      actual.calificacionVendedor !== rep.calificacionPromedio ||
      actual.totalResenasVendedor !== rep.totalResenas;

    if (!difiere) {
      productosCorrectos += 1;
      continue;
    }

    productosCambian += 1;
    console.log(
      `producto/${prodDoc.id}: calificacionVendedor ${formatearValor(actual.calificacionVendedor)}→${rep.calificacionPromedio}, totalResenasVendedor ${formatearValor(actual.totalResenasVendedor)}→${rep.totalResenas}`
    );

    operaciones.push({
      ref: prodDoc.ref,
      path: prodDoc.ref.path,
      before: {
        calificacionVendedor:
          actual.calificacionVendedor !== undefined ? actual.calificacionVendedor : null,
        totalResenasVendedor:
          actual.totalResenasVendedor !== undefined ? actual.totalResenasVendedor : null,
        _existedFields: {
          calificacionVendedor: "calificacionVendedor" in actual,
          totalResenasVendedor: "totalResenasVendedor" in actual,
        },
      },
      data: {
        calificacionVendedor: rep.calificacionPromedio,
        totalResenasVendedor: rep.totalResenas,
      },
    });
  }

  console.log("\n─── Resumen ───");
  console.log(
    `Usuarios:  ${usuariosCambian} cambiarían, ${usuariosCorrectos} ya estaban correctos.`
  );
  console.log(
    `Productos: ${productosCambian} cambiarían, ${productosCorrectos} ya estaban correctos.`
  );
  console.log(
    `Reseñas descartadas: ${resenasDescartadas.length}${
      resenasDescartadas.length > 0 ? ` (IDs: ${resenasDescartadas.join(", ")})` : ""
    }`
  );

  if (!apply) {
    console.log("\n[DRY-RUN] Finalizado sin escribir cambios. Usa --apply para ejecutar.");
    return;
  }

  if (operaciones.length === 0) {
    console.log("\n[APPLY] Todos los documentos ya coinciden. No hay nada que escribir.");
    return;
  }

  // 3. Guardar respaldo antes de tocar Firestore
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilename = `backup-reputacion-${timestamp}.json`;
  const backupPath = path.resolve(process.cwd(), backupFilename);

  const backupPayload = {
    createdAt: new Date().toISOString(),
    projectId: app.options.projectId,
    totalDocuments: operaciones.length,
    documents: operaciones.map((op) => ({
      path: op.path,
      fields: op.before,
    })),
  };

  try {
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), "utf8");
    console.log(`\n[BACKUP] Respaldo guardado en: ${backupPath}`);
  } catch (err) {
    console.error(
      `\n[ERROR] No se pudo escribir el archivo de respaldo (${backupPath}). Abortando sin modificar Firestore:`,
      err.message
    );
    process.exit(1);
  }

  let lotesConfirmados = 0;
  for (let i = 0; i < operaciones.length; i += MAX_BATCH_OPS) {
    const chunk = operaciones.slice(i, i + MAX_BATCH_OPS);
    const batch = db.batch();
    for (const op of chunk) {
      batch.update(op.ref, op.data);
    }
    await batch.commit();
    lotesConfirmados += 1;
    console.log(
      `[APPLY] Lote ${lotesConfirmados} confirmado (${chunk.length} operaciones).`
    );
  }

  console.log(`[APPLY] Migración completada: ${operaciones.length} documentos actualizados.`);
}

main().catch((err) => {
  console.error("Error en recalcularReputacion:", err);
  process.exit(1);
});
