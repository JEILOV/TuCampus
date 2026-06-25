// src/services/productService.js
import {
  doc, getDoc,
  addDoc, updateDoc, deleteDoc,
  collection, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db }             from "./firebase";
import { generarPrefijos } from "../utils/imageUtils";

// ── El addDoc quedó en los imports pero no se usa — lo eliminé.
// ── Un solo bloque de imports arriba, sin repetir.

export const obtenerProductoPorId = async (productoId) => {
  if (!productoId) return null;
  const snap = await getDoc(doc(db, "productos", productoId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const crearProducto = async ({ titulo, precio, categoria, descripcion, imagen, user, perfil }) => {
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
    prefijos,
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
};

export const actualizarProducto = async (productoId, { titulo, precio, categoria, descripcion, imagen, imagenOriginal }) => {
  const prefijos = generarPrefijos(titulo);
  await updateDoc(doc(db, "productos", productoId), {
    titulo,
    precio:       parseFloat(precio),
    categoria,
    descripcion,
    imagen:       imagen || imagenOriginal || "",
    prefijos,
    fechaEdicion: serverTimestamp(),
  });
};

export const eliminarProducto = async (productoId) => {
  await deleteDoc(doc(db, "productos", productoId));
};

export const cambiarEstadoProducto = async (productoId, nuevoEstado) => {
  await updateDoc(doc(db, "productos", productoId), { estado: nuevoEstado });
};