// src/utils/cropUtils.js
// ============================================================
//  TuCampus — Utilidades para recorte y rotación de imágenes (FASE 7D.2)
// ============================================================

/**
 * Limita el lado mayor a maxDimension (por defecto 2048px) para proteger
 * la memoria RAM en dispositivos móviles de gama baja.
 */
export const calcularDimensionesAjustadas = (ancho, alto, maxDimension = 2048) => {
  const mayor = Math.max(ancho, alto);
  if (mayor <= maxDimension || mayor <= 0) {
    return { ancho: Math.max(1, ancho), alto: Math.max(1, alto), escala: 1 };
  }
  const escala = maxDimension / mayor;
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
    escala,
  };
};

/**
 * Escala las coordenadas del recorte devuelto por react-easy-crop
 * de forma proporcional a la escala calculada.
 */
export const escalarAreaRecorte = (crop, escala = 1) => ({
  x: Math.round((crop.x || 0) * escala),
  y: Math.round((crop.y || 0) * escala),
  width: Math.max(1, Math.round((crop.width || 1) * escala)),
  height: Math.max(1, Math.round((crop.height || 1) * escala)),
});

/**
 * Devuelve las dimensiones de la caja envolvente de una imagen rotada.
 * Para 90° y 270° los lados se invierten.
 */
export const calcularCajaRotada = (ancho, alto, rotacion = 0) => {
  const rotNormalizada = ((rotacion % 360) + 360) % 360;
  if (rotNormalizada === 90 || rotNormalizada === 270) {
    return { width: alto, height: ancho };
  }
  return { width: ancho, height: alto };
};

/**
 * Recorta y rota una imagen fuente devolviendo un File JPEG (~0.85 de calidad).
 *
 * @param {File|Blob|string} imagenFuente - Archivo, Blob o URL de la imagen
 * @param {{ x: number, y: number, width: number, height: number }} cropPixels - Área de recorte
 * @param {number} [rotacion=0] - Ángulo de rotación en grados (0, 90, 180, 270)
 * @param {string} [nombreArchivo="foto-recortada.jpg"] - Nombre del archivo resultante
 * @returns {Promise<File>}
 */
export const recortarFoto = async (
  imagenFuente,
  cropPixels,
  rotacion = 0,
  nombreArchivo = "foto-recortada.jpg"
) => {
  let tempUrl = null;
  let bitmap = null;
  let imagenElemento = null;

  try {
    let anchoOriginal = 0;
    let altoOriginal = 0;

    // 1. Obtener fuente como ImageBitmap (respetando EXIF) o como HTMLImageElement de fallback
    let blobFuente = null;
    if (imagenFuente instanceof Blob) {
      blobFuente = imagenFuente;
    } else if (typeof imagenFuente === "string") {
      try {
        const respuesta = await fetch(imagenFuente);
        blobFuente = await respuesta.blob();
      } catch {
        // Fallback si fetch falla por CORS o protocolo local
        blobFuente = null;
      }
    }

    if (blobFuente && typeof createImageBitmap === "function") {
      try {
        // 🔒 imageOrientation: "from-image" garantiza que la orientación EXIF
        // nativa de móviles (ej. fotos tomadas en vertical) se respete automáticamente.
        bitmap = await createImageBitmap(blobFuente, { imageOrientation: "from-image" });
        anchoOriginal = bitmap.width;
        altoOriginal = bitmap.height;
      } catch {
        bitmap = null;
      }
    }

    if (!bitmap) {
      // Fallback a HTMLImageElement
      const url = blobFuente ? (tempUrl = URL.createObjectURL(blobFuente)) : imagenFuente;
      imagenElemento = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("No se pudo cargar la imagen para recortar"));
        img.src = url;
      });
      anchoOriginal = imagenElemento.naturalWidth || imagenElemento.width;
      altoOriginal = imagenElemento.naturalHeight || imagenElemento.height;
    }

    const fuente = bitmap || imagenElemento;

    // 2. Limitar dimensión mayor a 2048px para mitigar consumo de RAM en móviles
    const { ancho: anchoEscalado, alto: altoEscalado, escala } = calcularDimensionesAjustadas(
      anchoOriginal,
      altoOriginal,
      2048
    );

    const cropAjustado = escalarAreaRecorte(cropPixels, escala);
    const rotNormalizada = ((rotacion % 360) + 360) % 360;
    const bBox = calcularCajaRotada(anchoEscalado, altoEscalado, rotNormalizada);

    // 3. Canvas intermedio para rotar
    const canvasRotado = document.createElement("canvas");
    canvasRotado.width = bBox.width;
    canvasRotado.height = bBox.height;
    const ctxRotado = canvasRotado.getContext("2d");

    if (!ctxRotado) throw new Error("No se pudo obtener el contexto 2D del canvas");

    ctxRotado.translate(bBox.width / 2, bBox.height / 2);
    ctxRotado.rotate((rotNormalizada * Math.PI) / 180);
    ctxRotado.translate(-anchoEscalado / 2, -altoEscalado / 2);
    ctxRotado.drawImage(fuente, 0, 0, anchoEscalado, altoEscalado);

    // 4. Canvas final para extraer el área recortada
    const canvasFinal = document.createElement("canvas");
    canvasFinal.width = cropAjustado.width;
    canvasFinal.height = cropAjustado.height;
    const ctxFinal = canvasFinal.getContext("2d");

    if (!ctxFinal) throw new Error("No se pudo obtener el contexto 2D del canvas final");

    ctxFinal.drawImage(
      canvasRotado,
      cropAjustado.x,
      cropAjustado.y,
      cropAjustado.width,
      cropAjustado.height,
      0,
      0,
      cropAjustado.width,
      cropAjustado.height
    );

    // Liberar memoria del canvas intermedio inmediatamente
    canvasRotado.width = 0;
    canvasRotado.height = 0;

    // 5. Convertir a Blob JPEG con calidad ~0.85
    const blobFinal = await new Promise((resolve, reject) => {
      canvasFinal.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Error al exportar recorte de imagen"))),
        "image/jpeg",
        0.85
      );
    });

    // Liberar canvas final
    canvasFinal.width = 0;
    canvasFinal.height = 0;

    return new File([blobFinal], nombreArchivo, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    // 🔒 Liberar object URLs y bitmaps para evitar fugas de memoria
    if (bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
    if (tempUrl) {
      URL.revokeObjectURL(tempUrl);
    }
  }
};
