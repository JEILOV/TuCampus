// src/services/productService.js
import {
  doc, getDoc, updateDoc, deleteDoc,
  collection, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db }              from "./firebase";
import { generarPrefijos } from "../utils/imageUtils";
import { traducirError, logError } from "../utils/errorHandler"; // ← corregido: utils/, no services/

export const obtenerProductoPorId = async (productoId) => {
  if (!productoId) return null;
  try {                                                           // ← agregado
    const snap = await getDoc(doc(db, "productos", productoId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    logError("[productService.obtenerProductoPorId]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

export const crearProducto = async ({ titulo, precio, categoria, descripcion, imagen, user, perfil }) => {
  try {
    const prefijos = generarPrefijos(titulo);
    const batch    = writeBatch(db);

    const nuevoRef = doc(collection(db, "productos"));
    batch.set(nuevoRef, {
      titulo,
      precio:         parseFloat(precio),
      categoria,
      descripcion,
      imagen:         imagen || "",
      vendedor:       perfil?.nombre   || user.displayName || "Vendedor UNP",
      vendedorNombre: perfil?.nombre   || user.displayName || "Vendedor UNP",
      avatarVendedor: perfil?.avatar   || "",
      telefono:       perfil?.telefono || "",
      userUid:        user.uid,
      fecha:          serverTimestamp(),
      estado:         "disponible",
      keywords:       prefijos,
    });

    const userRef = doc(db, "usuarios", user.uid);
    const snap    = await getDoc(userRef);
    if (snap.exists()) {
      batch.update(userRef, {
        totalPublicaciones: (snap.data().totalPublicaciones || 0) + 1,
      });
    }

    await batch.commit();
    return nuevoRef.id;
  } catch (err) {
    logError("[productService.crearProducto]", err);
    throw new Error(traducirError(err, "firestore")); // mensaje limpio hacia el componente
  }
};

export const actualizarProducto = async (productoId, { titulo, precio, categoria, descripcion, imagen, imagenOriginal }) => {
  try {
    const prefijos = generarPrefijos(titulo);
    await updateDoc(doc(db, "productos", productoId), {
      titulo,
      precio:       parseFloat(precio),
      categoria,
      descripcion,
      imagen:       imagen || imagenOriginal || "",
      keywords:     prefijos,
      fechaEdicion: serverTimestamp(),
    });
  } catch (err) {
    logError("[productService.actualizarProducto]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

export const eliminarProducto = async (productoId) => {
  try {
    await deleteDoc(doc(db, "productos", productoId));
  } catch (err) {
    logError("[productService.eliminarProducto]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};

export const cambiarEstadoProducto = async (productoId, nuevoEstado) => {
  try {
    await updateDoc(doc(db, "productos", productoId), { estado: nuevoEstado });
  } catch (err) {
    logError("[productService.cambiarEstadoProducto]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};
