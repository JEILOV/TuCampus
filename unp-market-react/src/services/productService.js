// src/services/productService.js
import {
  doc, getDoc, updateDoc, deleteDoc,
  collection, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db }              from "./firebase";
import { generarPrefijos } from "../utils/imageUtils";
import { traducirError, logError } from "../utils/errorHandler"; // ← corregido: utils/, no services/
import { notificarNuevoProductoEnSede } from "./notificationService";

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

// 🔒 Única fuente de verdad de las categorías válidas — debe coincidir
// exactamente con las reglas de seguridad de Firestore.
// ⚠️ IMPORTANTE: este arreglo es solo el blindaje del lado del cliente.
// Las Firestore Security Rules (fuera de este repo) tienen su propia
// whitelist de categorías y DEBEN actualizarse a mano en la consola de
// Firebase con este mismo set, o la publicación fallará con
// PERMISSION_DENIED aunque el cliente la valide correctamente.
const CATEGORIAS_VALIDAS = ["comida", "tecnologia", "ropa", "materiales", "servicios", "otros"];

// 🔧 Migración de taxonomía: productos publicados ANTES del cambio de
// categorías pueden traer valores viejos guardados en Firestore
// ('dulces', 'salados', 'bebidas'). Sin este mapeo, abrir esos
// productos en EditarProducto.jsx y guardar sin tocar la categoría
// dispara "Categoría inválida.", porque el valor viejo nunca fue
// migrado en la base de datos. Ampliar este mapa si aparecen más
// categorías legacy.
const MIGRACION_CATEGORIAS = {
  dulces:  "comida",
  salados: "comida",
  bebidas: "comida",
};

// Única función de normalización de categoría en todo el repo: valida
// contra la taxonomía vigente y, si no coincide, intenta migrar desde
// la taxonomía anterior. Devuelve null si la categoría no es
// reconocible en ninguna de las dos.
export const normalizarCategoria = (categoria) => {
  if (CATEGORIAS_VALIDAS.includes(categoria)) return categoria;
  return MIGRACION_CATEGORIAS[categoria] || null;
};

// 🖼️ Múltiples fotos por producto (hasta 4).
// Único lugar que decide cómo se guarda `imagen` (portada, string —
// campo legado que YA leen ProductCard.jsx, GeneradorStoryModal.jsx,
// notificationService.js, etc.) vs `imagenes` (array nuevo, opcional).
// Blindaje de entrada: acepta `imagenes` (array) y/o `imagen` (string
// suelto, retrocompatible con quien todavía llame a esta función con
// la firma vieja) y siempre devuelve una lista limpia y acotada a 4.
const MAX_FOTOS_PRODUCTO = 4;
const normalizarImagenes = (imagenes, imagenSuelta) => {
  const fuente = Array.isArray(imagenes) && imagenes.length > 0 ? imagenes : [imagenSuelta];
  return fuente
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_FOTOS_PRODUCTO);
};

export const crearProducto = async ({ titulo, precio, categoria, descripcion, imagen, imagenes, user, perfil }) => {
  try {
    if (!user?.uid) {
      throw new Error("Usuario no autenticado.");
    }

    // 🔧 Blindaje del payload: sin importar qué llegue desde la UI,
    // esta función garantiza que el objeto enviado a Firestore cumpla
    // estrictamente con las reglas de seguridad.
    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum <= 0 || precioNum > 10000) {
      throw new Error("El precio debe ser un número mayor a 0 y menor o igual a 10000.");
    }

    const categoriaValida = normalizarCategoria(categoria);
    if (!categoriaValida) {
      throw new Error("Categoría inválida.");
    }

    const tituloLimpio      = String(titulo || "").trim().slice(0, 200);
    const descripcionLimpia = String(descripcion || "").trim().slice(0, 500);
    if (!tituloLimpio || !descripcionLimpia) {
      throw new Error("Título y descripción son obligatorios.");
    }

    const prefijos       = generarPrefijos(tituloLimpio);
    const imagenesLimpias = normalizarImagenes(imagenes, imagen);
    // 🔒 Retrocompatibilidad total: `imagen` sigue siendo la portada
    // (primera foto) para que Home/ProductCard/GeneradorStoryModal, que
    // NUNCA leen `imagenes`, sigan funcionando sin ningún cambio.
    const imagenPortada  = imagenesLimpias[0] || "";
    const batch    = writeBatch(db);

    const nuevoRef = doc(collection(db, "productos"));
    batch.set(nuevoRef, {
      titulo:         tituloLimpio,
      precio:         precioNum,
      categoria:      categoriaValida,
      descripcion:    descripcionLimpia,
      imagen:         imagenPortada,
      // 🆕 Array multi-foto (hasta 4). Se guarda SIEMPRE que haya al
      // menos 1 foto, incluso con un solo elemento — así Producto.jsx
      // tiene una única fuente de verdad cuando existe, y su propio
      // fallback (`imagenes?.length > 0 ? imagenes : [imagenUrl]`)
      // cubre los productos viejos que nunca tuvieron este campo.
      ...(imagenesLimpias.length > 0 ? { imagenes: imagenesLimpias } : {}),
      vendedor:       perfil?.nombre   || user.displayName || "Vendedor UNP",
      vendedorNombre: perfil?.nombre   || user.displayName || "Vendedor UNP",
      avatarVendedor: perfil?.avatar   || "",
      // 🔒 telefono YA NO se copia al documento público del producto.
      aceptaYape:     !!perfil?.aceptaYape,
      aceptaPlin:     !!perfil?.aceptaPlin,
      // ⭐ Reputación denormalizada — snapshot de la calificación del
      // vendedor AL MOMENTO de publicar. Se usa para el badge de
      // estrellas en ProductCard y para el orden "Mejor valorados" sin
      // tener que leer el doc del vendedor por cada producto (N+1).
      // 🔧 Trade-off conocido: este valor NO se actualiza solo cuando el
      // vendedor recibe nuevas reseñas después de publicar. Para
      // mantenerlo sincronizado, reviewService.enviarResena debería
      // además actualizar (vía batch) calificacionVendedor/
      // totalResenasVendedor en todos los productos activos de ese
      // vendedor — no incluido aquí porque excede el alcance pedido.
      calificacionVendedor: perfil?.calificacionPromedio || 0,
      totalResenasVendedor: perfil?.totalResenas || 0,
      // 🏫 Multicampus: heredado del perfil del usuario que publica —
      // así el Home puede filtrar productos por campus (useProducts.js).
      universidadId:  perfil?.universidadId || null,
      userUid:        user.uid,
      fecha:          serverTimestamp(),
      estado:         "disponible",
      keywords:       prefijos,
    });

    // 🔧 El contador totalPublicaciones es un "nice to have", no un
    // requisito de la publicación. Si esta lectura falla (hipo de red,
    // etc.) NO debe tumbar la creación del producto en sí — solo se
    // omite el incremento y se registra para diagnóstico.
    try {
      const userRef = doc(db, "usuarios", user.uid);
      const snap    = await getDoc(userRef);
      if (snap.exists()) {
        batch.update(userRef, {
          totalPublicaciones: (snap.data().totalPublicaciones || 0) + 1,
        });
      }
    } catch (counterErr) {
      logError("[productService.crearProducto] contador opcional", counterErr);
    }

    await batch.commit();

    // 🔔 Push a la sede — SIEMPRE después del commit (efecto secundario
    // best-effort, fire-and-forget: si falla, el producto ya quedó
    // publicado igual). No se espera su resultado.
    notificarNuevoProductoEnSede({
      universidadId: perfil?.universidadId || null,
      titulo:        tituloLimpio,
      productoId:    nuevoRef.id,
      imagen:        imagenPortada || undefined,
      excluirUid:    user.uid, // el vendedor no se autonotifica
    });

    return nuevoRef.id;
  } catch (err) {
    logError("[productService.crearProducto]", err);
    throw new Error(traducirError(err, "firestore")); // mensaje limpio hacia el componente
  }
};

export const actualizarProducto = async (productoId, { titulo, precio, categoria, descripcion, imagen, imagenOriginal, imagenes }) => {
  try {
    // 🔧 Mismo blindaje que crearProducto: la regla de `update` también
    // exige esProductoValido() sobre el documento resultante, así que
    // editar un producto está sujeto exactamente a las mismas 6 reglas.
    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum <= 0 || precioNum > 10000) {
      throw new Error("El precio debe ser un número mayor a 0 y menor o igual a 10000.");
    }

    const categoriaValida = normalizarCategoria(categoria);
    if (!categoriaValida) {
      throw new Error("Categoría inválida.");
    }

    const tituloLimpio      = String(titulo || "").trim().slice(0, 200);
    const descripcionLimpia = String(descripcion || "").trim().slice(0, 500);
    if (!tituloLimpio || !descripcionLimpia) {
      throw new Error("Título y descripción son obligatorios.");
    }

    const prefijos = generarPrefijos(tituloLimpio);

    // 🖼️ Igual criterio que crearProducto: `imagenes` (array, hasta 4)
    // es la fuente de verdad si viene informado; `imagen`/`imagenOriginal`
    // son el fallback de la firma vieja (edición sin tocar la foto o
    // llamadores que aún no migraron). `imagen` (portada) se recalcula
    // siempre a partir de la primera foto del array final.
    const imagenesLimpias = normalizarImagenes(imagenes, imagen || imagenOriginal);
    const imagenPortada   = imagenesLimpias[0] || "";

    await updateDoc(doc(db, "productos", productoId), {
      titulo:       tituloLimpio,
      precio:       precioNum,
      categoria:    categoriaValida,
      descripcion:  descripcionLimpia,
      imagen:       imagenPortada,
      // Ver nota en crearProducto: se guarda el array completo cuando
      // hay al menos 1 foto, para que Producto.jsx tenga el carrusel.
      ...(imagenesLimpias.length > 0 ? { imagenes: imagenesLimpias } : {}),
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

const ESTADOS_VALIDOS = ["disponible", "agotado"];

export const cambiarEstadoProducto = async (productoId, nuevoEstado) => {
  try {
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      throw new Error("Estado inválido.");
    }
    await updateDoc(doc(db, "productos", productoId), { estado: nuevoEstado });
  } catch (err) {
    logError("[productService.cambiarEstadoProducto]", err);
    throw new Error(traducirError(err, "firestore"));
  }
};