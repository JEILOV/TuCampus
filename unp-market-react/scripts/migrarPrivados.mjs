// scripts/migrarPrivados.mjs
// ============================================================
//  Script de migración (FASE 6A): copia datos sensibles legados de
//  /usuarios/{uid} (email, universidadId, favoritos, fcmToken) hacia
//  /usuariosPrivado/{uid} y crea documentos en /bloqueos/{uid}_{bloqueadoUid}
//  a partir del arreglo legado `bloqueados`.
//
//  Compatible hacia atrás: NUNCA modifica ni elimina campos de /usuarios/{uid}
//  (esa limpieza corresponde a la Fase 6B). Es 100% idempotente.
//
//  Requisitos:
//    export GOOGLE_APPLICATION_CREDENTIALS="/ruta/a/serviceAccountKey.json"
//
//  Uso:
//    node scripts/migrarPrivados.mjs           # Dry-run (por defecto, no escribe)
//    node scripts/migrarPrivados.mjs --apply   # Respalda y aplica cambios en batches de <= 400 ops
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const MAX_FAVORITOS = 500;
export const MAX_FCM_TOKENS = 20;
const MAX_BATCH_OPS = 400;

const limpiarArregloStrings = (arr) => {
  if (!Array.isArray(arr)) return [];
  const resultado = [];
  const vistos = new Set();
  for (const item of arr) {
    if (typeof item === "string") {
      const limpio = item.trim();
      if (limpio.length > 0 && !vistos.has(limpio)) {
        vistos.add(limpio);
        resultado.push(limpio);
      }
    }
  }
  return resultado;
};

const arreglosIguales = (a = [], b = []) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/**
 * Función pura que construye el payload para /usuariosPrivado/{uid} y la
 * lista de documentos /bloqueos/{uid}_{bloqueadoUid} por crear a partir
 * de los datos legados de /usuarios/{uid}.
 *
 * - Si `datosPrivadosExistentes` existe: NO sobrescribe `email` ni `universidadId`,
 *   y une (sin duplicados) `favoritos` (máx. 500) y `fcmToken` (últimos 20).
 * - Si no existe: incluye `uid`, `email` (si es string válido), `universidadId`
 *   (si es string válido), `favoritos` (máx. 500) y `fcmToken` (últimos 20).
 * - Para cada UID en `bloqueados` (distinto de `uid` y que no esté en
 *   `bloqueosExistentes`): genera `{ id: "${uid}_${bloqueadoUid}", data: { bloqueadorUid: uid, bloqueadoUid, creadoEn } }`.
 *
 * @param {Object} params
 * @param {string} params.uid
 * @param {Object} [params.datosPublicos={}]
 * @param {Object|null} [params.datosPrivadosExistentes=null]
 * @param {Set<string>} [params.bloqueosExistentes=new Set()]
 * @param {*} [params.creadoEn=null]
 */
export const construirMigracionUsuario = ({
  uid,
  datosPublicos = {},
  datosPrivadosExistentes = null,
  bloqueosExistentes = new Set(),
  creadoEn = null,
} = {}) => {
  const pub = datosPublicos || {};

  const emailLegado =
    typeof pub.email === "string" && pub.email.trim().length > 0
      ? pub.email.trim()
      : null;
  const universidadLegada =
    typeof pub.universidadId === "string" && pub.universidadId.trim().length > 0
      ? pub.universidadId.trim()
      : null;

  const favoritosLegados = limpiarArregloStrings(pub.favoritos).slice(
    0,
    MAX_FAVORITOS
  );
  const fcmTokensLegados = limpiarArregloStrings(pub.fcmToken).slice(
    -MAX_FCM_TOKENS
  );
  const bloqueadosLegados = limpiarArregloStrings(pub.bloqueados).filter(
    (b) => b !== uid
  );

  let payloadPrivado = null;
  let requiereEscrituraPrivada = false;

  if (datosPrivadosExistentes) {
    const favPrevios = limpiarArregloStrings(datosPrivadosExistentes.favoritos);
    const tokensPrevios = limpiarArregloStrings(datosPrivadosExistentes.fcmToken);

    const favoritosUnidos = [
      ...new Set([...favPrevios, ...favoritosLegados]),
    ].slice(0, MAX_FAVORITOS);
    const fcmTokensUnidos = [
      ...new Set([...tokensPrevios, ...fcmTokensLegados]),
    ].slice(-MAX_FCM_TOKENS);

    payloadPrivado = {
      favoritos: favoritosUnidos,
      fcmToken: fcmTokensUnidos,
    };
    if (!("uid" in datosPrivadosExistentes) && uid) {
      payloadPrivado.uid = uid;
    }

    const cambioFavs = !arreglosIguales(
      Array.isArray(datosPrivadosExistentes.favoritos)
        ? datosPrivadosExistentes.favoritos
        : [],
      favoritosUnidos
    );
    const cambioTokens = !arreglosIguales(
      Array.isArray(datosPrivadosExistentes.fcmToken)
        ? datosPrivadosExistentes.fcmToken
        : [],
      fcmTokensUnidos
    );
    const faltaUid = !("uid" in datosPrivadosExistentes) && Boolean(uid);

    requiereEscrituraPrivada = cambioFavs || cambioTokens || faltaUid;
  } else {
    const tieneDatosLegados =
      Boolean(emailLegado) ||
      Boolean(universidadLegada) ||
      favoritosLegados.length > 0 ||
      fcmTokensLegados.length > 0;

    payloadPrivado = {
      uid,
      ...(emailLegado ? { email: emailLegado } : {}),
      ...(universidadLegada ? { universidadId: universidadLegada } : {}),
      favoritos: favoritosLegados,
      fcmToken: fcmTokensLegados,
    };

    requiereEscrituraPrivada = tieneDatosLegados;
  }

  const bloqueosACrear = [];
  for (const bloqueadoUid of bloqueadosLegados) {
    const bloqueoId = `${uid}_${bloqueadoUid}`;
    if (!bloqueosExistentes.has(bloqueoId)) {
      bloqueosACrear.push({
        id: bloqueoId,
        data: {
          bloqueadorUid: uid,
          bloqueadoUid,
          creadoEn,
        },
      });
    }
  }

  return {
    payloadPrivado,
    requiereEscrituraPrivada,
    bloqueosACrear,
    conteos: {
      favoritos: payloadPrivado.favoritos.length,
      fcmToken: payloadPrivado.fcmToken.length,
      bloqueos: bloqueosACrear.length,
    },
  };
};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
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
    console.error(
      `Error al leer GOOGLE_APPLICATION_CREDENTIALS (${credPath}):`,
      err.message
    );
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

  console.log(`Proyecto Firebase (projectId): ${app.options.projectId}`);
  console.log(
    `Modo: ${apply ? "APPLY (escritura real)" : "DRY-RUN (solo lectura)"}`
  );

  if (apply) {
    console.log(
      "Esperando 5 segundos antes de iniciar lecturas/escrituras (presiona Ctrl+C para cancelar)..."
    );
    await esperar(5000);
  }

  const [usuariosSnap, privadosSnap, bloqueosSnap] = await Promise.all([
    db.collection("usuarios").get(),
    db.collection("usuariosPrivado").get(),
    db.collection("bloqueos").get(),
  ]);

  const privadosMap = new Map();
  for (const docSnap of privadosSnap.docs) {
    privadosMap.set(docSnap.id, docSnap.data());
  }

  const bloqueosExistentes = new Set();
  for (const docSnap of bloqueosSnap.docs) {
    bloqueosExistentes.add(docSnap.id);
  }

  const ahoraTimestamp = Timestamp.now();
  const operaciones = [];
  let usuariosConMigracion = 0;
  let usuariosSinCambios = 0;
  let totalDocsPrivados = 0;
  let totalDocsBloqueos = 0;

  for (const userDoc of usuariosSnap.docs) {
    const uid = userDoc.id;
    const datosPublicos = userDoc.data() || {};
    const datosPrivadosExistentes = privadosMap.get(uid) || null;

    const resultado = construirMigracionUsuario({
      uid,
      datosPublicos,
      datosPrivadosExistentes,
      bloqueosExistentes,
      creadoEn: ahoraTimestamp,
    });

    if (
      !resultado.requiereEscrituraPrivada &&
      resultado.bloqueosACrear.length === 0
    ) {
      usuariosSinCambios += 1;
      continue;
    }

    usuariosConMigracion += 1;
    console.log(
      `usuario/${uid}: favoritos ${resultado.conteos.favoritos}, fcmToken ${resultado.conteos.fcmToken}, bloqueos ${resultado.conteos.bloqueos}`
    );

    if (resultado.requiereEscrituraPrivada) {
      totalDocsPrivados += 1;
      const refPrivado = db.collection("usuariosPrivado").doc(uid);
      operaciones.push({
        tipo: datosPrivadosExistentes ? "mergePrivado" : "crearPrivado",
        ref: refPrivado,
        path: `usuariosPrivado/${uid}`,
        existed: Boolean(datosPrivadosExistentes),
        before: datosPrivadosExistentes || null,
        data: resultado.payloadPrivado,
      });
    }

    for (const b of resultado.bloqueosACrear) {
      totalDocsBloqueos += 1;
      const refBloqueo = db.collection("bloqueos").doc(b.id);
      operaciones.push({
        tipo: "crearBloqueo",
        ref: refBloqueo,
        path: `bloqueos/${b.id}`,
        existed: false,
        before: null,
        data: b.data,
      });
    }
  }

  console.log("\n─── Resumen ───");
  console.log(
    `Usuarios con datos por migrar: ${usuariosConMigracion} (${usuariosSinCambios} ya al día o sin datos legados).`
  );
  console.log(`Documentos en /usuariosPrivado a escribir: ${totalDocsPrivados}`);
  console.log(`Documentos en /bloqueos a crear:           ${totalDocsBloqueos}`);

  if (!apply) {
    console.log(
      "\n[DRY-RUN] Finalizado sin escribir cambios. Usa --apply para ejecutar."
    );
    return;
  }

  if (operaciones.length === 0) {
    console.log(
      "\n[APPLY] Todos los documentos ya están migrados. No hay nada que escribir."
    );
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilename = `backup-privados-${timestamp}.json`;
  const backupPath = path.resolve(process.cwd(), backupFilename);

  const backupPayload = {
    createdAt: new Date().toISOString(),
    projectId: app.options.projectId,
    totalOperations: operaciones.length,
    createdPaths: operaciones.filter((op) => !op.existed).map((op) => op.path),
    previousPrivateDocs: operaciones
      .filter((op) => op.existed)
      .map((op) => ({
        path: op.path,
        before: op.before,
      })),
  };

  try {
    fs.writeFileSync(
      backupPath,
      JSON.stringify(backupPayload, null, 2),
      "utf8"
    );
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
      batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
    lotesConfirmados += 1;
    console.log(
      `[APPLY] Lote ${lotesConfirmados} confirmado (${chunk.length} operaciones).`
    );
  }

  console.log(
    `[APPLY] Migración completada: ${operaciones.length} documentos escritos.`
  );
}

const esEjecucionDirecta =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("Error en migrarPrivados:", err);
    process.exit(1);
  });
}
