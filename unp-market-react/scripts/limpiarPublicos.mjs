// scripts/limpiarPublicos.mjs
// ============================================================
//  Script de limpieza (FASE 6B): elimina los campos sensibles legados
//  (email, favoritos, bloqueados, fcmToken, telefono) de /usuarios/{uid}
//  ÚNICAMENTE cuando cada campo ya está a salvo en su destino privado
//  (/usuariosPrivado/{uid}, /bloqueos/{uid}_{otro} o
//  /usuarios/{uid}/privado/contacto).
//
//  NUNCA modifica /usuariosPrivado, /bloqueos ni la subcolección privado.
//  Es 100% idempotente.
//
//  Requisitos:
//    export GOOGLE_APPLICATION_CREDENTIALS="/ruta/a/serviceAccountKey.json"
//
//  Uso:
//    node scripts/limpiarPublicos.mjs           # Dry-run (por defecto, no escribe)
//    node scripts/limpiarPublicos.mjs --apply   # Respalda y aplica FieldValue.delete() en batches de <= 400
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const CAMPOS_LEGADOS = [
  "email",
  "favoritos",
  "fcmToken",
  "bloqueados",
  "telefono",
];
export const MAX_FAVORITOS = 500;
const MAX_BATCH_OPS = 400;

const extraerStringsValidos = (arr) => {
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

/**
 * Decide de forma pura qué campos legados de /usuarios/{uid} es seguro
 * borrar y cuáles deben omitirse (con su motivo).
 *
 * @param {Object} params
 * @param {string} params.uid
 * @param {Object} [params.datosPublicos={}]
 * @param {Object|null} [params.datosPrivados=null]
 * @param {Set<string>|string[]} [params.bloqueosExistentes=new Set()]
 * @param {Object|null} [params.contactoPrivado=null]
 * @returns {{ camposABorrar: string[], omitidos: Array<{ campo: string, motivo: string }> }}
 */
export const construirLimpieza = ({
  uid,
  datosPublicos = {},
  datosPrivados = null,
  bloqueosExistentes = new Set(),
  contactoPrivado = null,
} = {}) => {
  const pub = datosPublicos || {};
  const setBloqueos =
    bloqueosExistentes instanceof Set
      ? bloqueosExistentes
      : new Set(Array.isArray(bloqueosExistentes) ? bloqueosExistentes : []);

  const camposABorrar = [];
  const omitidos = [];

  // 1. email: borrar si existe /usuariosPrivado/{uid}
  if ("email" in pub) {
    if (datosPrivados) {
      camposABorrar.push("email");
    } else {
      omitidos.push({ campo: "email", motivo: "sin doc privado" });
    }
  }

  // 2. favoritos: borrar si existe el doc privado y todos los favoritos válidos
  //    del público (strings, máximo 500) están en privado.favoritos
  if ("favoritos" in pub) {
    if (!datosPrivados) {
      omitidos.push({ campo: "favoritos", motivo: "sin doc privado" });
    } else {
      const favPub = extraerStringsValidos(pub.favoritos).slice(0, MAX_FAVORITOS);
      const favPrivSet = new Set(extraerStringsValidos(datosPrivados.favoritos));
      const faltan = favPub.filter((f) => !favPrivSet.has(f));
      if (faltan.length === 0) {
        camposABorrar.push("favoritos");
      } else {
        omitidos.push({
          campo: "favoritos",
          motivo: `faltan ${faltan.length} favoritos en doc privado`,
        });
      }
    }
  }

  // 3. fcmToken: borrar si existe el doc privado y NO ocurre que el público
  //    tenga tokens y el privado ninguno
  if ("fcmToken" in pub) {
    if (!datosPrivados) {
      omitidos.push({ campo: "fcmToken", motivo: "sin doc privado" });
    } else {
      const tokensPub = extraerStringsValidos(pub.fcmToken);
      const tokensPriv = extraerStringsValidos(datosPrivados.fcmToken);
      if (tokensPub.length > 0 && tokensPriv.length === 0) {
        omitidos.push({
          campo: "fcmToken",
          motivo: "tokens solo en doc público",
        });
      } else {
        camposABorrar.push("fcmToken");
      }
    }
  }

  // 4. bloqueados: borrar si por cada UID válido existe /bloqueos/{uid}_{bloqueado}
  if ("bloqueados" in pub) {
    const bloqueadosValidos = extraerStringsValidos(pub.bloqueados).filter(
      (b) => b !== uid
    );
    const sinDoc = bloqueadosValidos.filter(
      (b) => !setBloqueos.has(`${uid}_${b}`)
    );
    if (sinDoc.length === 0) {
      camposABorrar.push("bloqueados");
    } else {
      omitidos.push({
        campo: "bloqueados",
        motivo: `faltan ${sinDoc.length} docs en /bloqueos`,
      });
    }
  }

  // 5. telefono: borrar si público.telefono está vacío o si
  //    /usuarios/{uid}/privado/contacto tiene telefono string no vacío
  if ("telefono" in pub) {
    const telPub = typeof pub.telefono === "string" ? pub.telefono.trim() : "";
    const telPriv =
      typeof contactoPrivado?.telefono === "string"
        ? contactoPrivado.telefono.trim()
        : "";
    if (telPub.length === 0 || telPriv.length > 0) {
      camposABorrar.push("telefono");
    } else {
      omitidos.push({ campo: "telefono", motivo: "sin copia privada" });
    }
  }

  return { camposABorrar, omitidos };
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

  const conteoBorrarPorCampo = Object.fromEntries(
    CAMPOS_LEGADOS.map((c) => [c, 0])
  );
  const conteoOmitirPorCampo = Object.fromEntries(
    CAMPOS_LEGADOS.map((c) => [c, 0])
  );

  const operaciones = [];
  let usuariosConAccion = 0;
  let usuariosLimpios = 0;

  for (const userDoc of usuariosSnap.docs) {
    const uid = userDoc.id;
    const datosPublicos = userDoc.data() || {};

    const tieneAlgunCampoLegado = CAMPOS_LEGADOS.some(
      (campo) => campo in datosPublicos
    );
    if (!tieneAlgunCampoLegado) {
      usuariosLimpios += 1;
      continue;
    }

    let contactoPrivado = null;
    if ("telefono" in datosPublicos) {
      const contactoSnap = await db
        .collection("usuarios")
        .doc(uid)
        .collection("privado")
        .doc("contacto")
        .get();
      contactoPrivado = contactoSnap.exists ? contactoSnap.data() : null;
    }

    const { camposABorrar, omitidos } = construirLimpieza({
      uid,
      datosPublicos,
      datosPrivados: privadosMap.get(uid) || null,
      bloqueosExistentes,
      contactoPrivado,
    });

    if (camposABorrar.length === 0 && omitidos.length === 0) {
      usuariosLimpios += 1;
      continue;
    }

    usuariosConAccion += 1;
    for (const c of camposABorrar) {
      conteoBorrarPorCampo[c] = (conteoBorrarPorCampo[c] || 0) + 1;
    }
    for (const { campo } of omitidos) {
      conteoOmitirPorCampo[campo] = (conteoOmitirPorCampo[campo] || 0) + 1;
    }

    const textoBorrar = `[${camposABorrar.join(", ")}]`;
    const textoOmitir = `[${omitidos
      .map((o) => `${o.campo}: ${o.motivo}`)
      .join(", ")}]`;
    console.log(
      `usuario/${uid}: borrar ${textoBorrar}, omitir ${textoOmitir}`
    );

    if (camposABorrar.length > 0) {
      const valoresBorrados = {};
      const payloadUpdate = {};
      for (const campo of camposABorrar) {
        valoresBorrados[campo] = datosPublicos[campo];
        payloadUpdate[campo] = FieldValue.delete();
      }
      operaciones.push({
        uid,
        ref: userDoc.ref,
        path: `usuarios/${uid}`,
        camposABorrar,
        valoresBorrados,
        payloadUpdate,
      });
    }
  }

  console.log("\n─── Resumen ───");
  console.log(
    `Usuarios con campos legados evaluados: ${usuariosConAccion} (${usuariosLimpios} ya limpios).`
  );
  console.log("Conteos por campo (a borrar / omitidos):");
  for (const campo of CAMPOS_LEGADOS) {
    console.log(
      `  - ${campo}: borrar ${conteoBorrarPorCampo[campo]}, omitir ${conteoOmitirPorCampo[campo]}`
    );
  }

  if (!apply) {
    console.log(
      "\n[DRY-RUN] Finalizado sin escribir cambios. Usa --apply para ejecutar."
    );
    return;
  }

  if (operaciones.length === 0) {
    console.log(
      "\n[APPLY] No hay campos seguros por borrar. No se realizaron escrituras."
    );
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilename = `backup-limpieza-${timestamp}.json`;
  const backupPath = path.resolve(process.cwd(), backupFilename);

  const backupPayload = {
    createdAt: new Date().toISOString(),
    projectId: app.options.projectId,
    totalUsersModified: operaciones.length,
    usuarios: Object.fromEntries(
      operaciones.map((op) => [op.uid, op.valoresBorrados])
    ),
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
      batch.update(op.ref, op.payloadUpdate);
    }
    await batch.commit();
    lotesConfirmados += 1;
    console.log(
      `[APPLY] Lote ${lotesConfirmados} confirmado (${chunk.length} usuarios limpiados).`
    );
  }

  console.log(
    `[APPLY] Limpieza completada: ${operaciones.length} documentos actualizados en /usuarios.`
  );
}

const esEjecucionDirecta =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("Error en limpiarPublicos:", err);
    process.exit(1);
  });
}
