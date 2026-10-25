// scripts/restaurarReputacion.mjs
// ============================================================
//  Script de restauración (H03): restaura los valores previos de
//  reputación desde un archivo backup-reputacion-<timestamp>.json
//  generado por scripts/recalcularReputacion.mjs.
//
//  Requisitos:
//    export GOOGLE_APPLICATION_CREDENTIALS="/ruta/a/serviceAccountKey.json"
//
//  Uso:
//    node scripts/restaurarReputacion.mjs <ruta-backup.json>           # Dry-run (por defecto)
//    node scripts/restaurarReputacion.mjs <ruta-backup.json> --apply   # Aplica restauración en Firestore
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const MAX_BATCH_OPS = 400;
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const archivoArg = args.find((a) => !a.startsWith("--"));

if (!archivoArg) {
  console.error(
    "Uso: node scripts/restaurarReputacion.mjs <backup-reputacion-....json> [--apply]"
  );
  process.exit(1);
}

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

const backupFullPath = path.resolve(process.cwd(), archivoArg);
let backupData;
try {
  backupData = JSON.parse(fs.readFileSync(backupFullPath, "utf8"));
} catch (err) {
  console.error(`Error al leer el archivo de respaldo (${backupFullPath}):`, err.message);
  process.exit(1);
}

if (!Array.isArray(backupData.documents)) {
  console.error("Error: Formato de respaldo inválido (falta el arreglo 'documents').");
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId,
});

const db = getFirestore(app);

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`Proyecto Firebase (projectId): ${app.options.projectId}`);
  console.log(`Respaldo origen: ${backupFullPath} (creado: ${backupData.createdAt || "desconocido"})`);
  console.log(`Modo: ${apply ? "APPLY (restauración real)" : "DRY-RUN (solo vista previa)"}`);

  if (backupData.projectId && backupData.projectId !== app.options.projectId) {
    console.error(
      `Error: El respaldo pertenece al proyecto '${backupData.projectId}', pero las credenciales actuales son de '${app.options.projectId}'.`
    );
    process.exit(1);
  }

  if (apply) {
    console.log("Esperando 5 segundos antes de restaurar en Firestore (presiona Ctrl+C para cancelar)...");
    await esperar(5000);
  }

  const operaciones = [];

  for (const item of backupData.documents) {
    if (!item.path || !item.fields) continue;
    const { _existedFields = {}, ...valores } = item.fields;
    const updatePayload = {};
    const descripcion = [];

    for (const [campo, valor] of Object.entries(valores)) {
      const existia = _existedFields[campo] !== false;
      if (!existia && valor === null) {
        updatePayload[campo] = FieldValue.delete();
        descripcion.push(`${campo}: <eliminar campo>`);
      } else {
        updatePayload[campo] = valor;
        descripcion.push(`${campo}: ${valor}`);
      }
    }

    console.log(`${item.path} -> ${descripcion.join(", ")}`);
    operaciones.push({
      ref: db.doc(item.path),
      data: updatePayload,
    });
  }

  console.log(`\nTotal de documentos en el respaldo a restaurar: ${operaciones.length}`);

  if (!apply) {
    console.log("[DRY-RUN] Finalizado sin escribir cambios. Usa --apply para restaurar.");
    return;
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

  console.log(`[APPLY] Restauración completada: ${operaciones.length} documentos restaurados.`);
}

main().catch((err) => {
  console.error("Error en restaurarReputacion:", err);
  process.exit(1);
});
