// ============================================================
//  app.js — Núcleo de UNP Market (Fase 2: Viralidad y Estabilidad)
//
//  CAMBIOS FASE 2:
//  1. PILAR 1 — Enrutamiento compartible:
//     El case "ver-detalle" ya no usa localStorage.setItem().
//     Ahora navega a producto.html?id=ID_DEL_PRODUCTO.
//     Cualquier URL es compartible por WhatsApp, Instagram, etc.
//
//  2. PILAR 3 — Infinite Scroll:
//     Reemplazamos el botón "Cargar más" por un IntersectionObserver
//     que observa un <div id="sentinel"> al final del grid.
//     Cuando el usuario hace scroll y el sentinel entra al viewport,
//     se dispara cargarMasProductos() automáticamente. Sin botones,
//     sin clics, experiencia nativa de app móvil.
//
//  CAMBIOS ARQUITECTÓNICOS HEREDADOS DE FASE 1:
//  1. Sin window.xxx — delegación de eventos.
//  2. Sin innerHTML += — createElement/textContent → sin XSS.
//  3. Paginación con limit() + startAfter() → cuota gratuita protegida.
//  4. onAuthStateChanged es el único guard de sesión.
// ============================================================

import { db, auth } from "./firebase.js";
import {
  collection, addDoc, getDocs, getDoc,
  doc, updateDoc, deleteDoc, query, where,
  onSnapshot, setDoc, serverTimestamp,
  orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

// ============================================================
//  SECCIÓN 1 — GUARD DE AUTENTICACIÓN
// ============================================================

const PAGINAS_PROTEGIDAS = ["index.html", "perfil.html", "publicar.html", ""];

function esPaginaProtegida() {
  const pagina = window.location.pathname.split("/").pop();
  return PAGINAS_PROTEGIDAS.includes(pagina);
}

let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (!user && esPaginaProtegida()) {
    window.location.replace("login.html");
    return;
  }
  currentUser = user;
  iniciarApp();
});

// ============================================================
//  SECCIÓN 2 — UTILIDADES DE UI
// ============================================================

function mostrarToast(mensaje, tipo = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.style.cssText = `
    background: ${tipo === "success" ? "#1e293b" : "#fecaca"};
    color: ${tipo === "success" ? "#ffffff" : "#991b1b"};
    padding: 14px 18px; border-radius: 16px; font-size: 13.5px;
    font-family: 'Nunito', sans-serif; font-weight: 700;
    box-shadow: 0 8px 20px rgba(0,0,0,0.15); display: flex;
    align-items: center; gap: 10px; pointer-events: auto;
    animation: slideUpToast 0.3s cubic-bezier(0.175,0.885,0.32,1.275) both,
               fadeOutToast 0.3s ease 2.7s both;
  `;

  const iconoSVG = tipo === "success"
    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

  const icono = document.createElement("span");
  icono.innerHTML = iconoSVG;

  const texto = document.createElement("span");
  texto.style.flex = "1";
  texto.textContent = mensaje;

  toast.appendChild(icono);
  toast.appendChild(texto);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function mostrarConfirmacion(titulo, mensaje, tipo = "normal") {
  return new Promise((resolve) => {
    const modal    = document.getElementById("modal-confirmar");
    const elTitulo = document.getElementById("confirmar-titulo");
    const elMensaje= document.getElementById("confirmar-mensaje");
    const elIcono  = document.getElementById("confirmar-icono");
    const btnOk    = document.getElementById("btn-confirmar-aceptar");
    const btnNo    = document.getElementById("btn-confirmar-cancelar");
    if (!modal) { resolve(false); return; }

    elTitulo.textContent  = titulo;
    elMensaje.textContent = mensaje;

    if (tipo === "danger") {
      btnOk.style.background      = "#dc2626";
      elIcono.style.background    = "#fff0f0";
      elIcono.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#dc2626" stroke-width="2.5"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    } else {
      btnOk.style.background      = "#1a1a2e";
      elIcono.style.background    = "#f0f1f9";
      elIcono.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#1a1a2e" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    modal.style.display = "flex";

    const nuevoOk = btnOk.cloneNode(true);
    const nuevoNo = btnNo.cloneNode(true);
    btnOk.replaceWith(nuevoOk);
    btnNo.replaceWith(nuevoNo);

    const cerrar = (valor) => {
      modal.style.display = "none";
      resolve(valor);
    };
    document.getElementById("btn-confirmar-aceptar").addEventListener("click", () => cerrar(true),  { once: true });
    document.getElementById("btn-confirmar-cancelar").addEventListener("click", () => cerrar(false), { once: true });
  });
}

// ============================================================
//  SECCIÓN 3 — IMGBB: SUBIDA DE IMÁGENES
// ============================================================

const IMGBB_API_KEY = "44396363d77b09fc503f8a3b50898ea7";

async function subirImagenImgBB(file, urlAnterior = "") {
  if (!file) return urlAnterior;
  const formData = new FormData();
  formData.append("image", file);
  const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
    { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) throw new Error("ImgBB rechazó la imagen");
  return data.data.url;
}

// ============================================================
//  SECCIÓN 4 — CATÁLOGO CON PAGINACIÓN
//
//  PILAR 3 — INFINITE SCROLL CON IntersectionObserver:
//
//  QUÉ ES IntersectionObserver:
//  Es una API nativa del navegador que nos avisa cuando un elemento
//  entra o sale del viewport (la zona visible de la pantalla).
//  En lugar de escuchar el evento "scroll" 60 veces por segundo
//  (costoso y lento), el navegador nos llama SOLO cuando el elemento
//  objetivo cruza el umbral visible. Más eficiente, más limpio.
//
//  CÓMO FUNCIONA AQUÍ:
//  1. Al final del catálogo existe un <div id="sentinel"> invisible.
//  2. Creamos un Observer que lo vigila.
//  3. Cuando el usuario hace scroll y el sentinel aparece en pantalla,
//     el Observer llama a cargarMasProductos().
//  4. Si ya no hay más páginas (todoCargado = true), desconectamos
//     el Observer con observer.disconnect() para liberar recursos.
//
//  VS. BOTÓN "CARGAR MÁS":
//  El Infinite Scroll es más UX-friendly en móvil. El botón requiere
//  un clic consciente; el scroll es natural. Elegimos Observer porque
//  es la misma técnica que usa Instagram, TikTok y YouTube.
// ============================================================

const PAGE_SIZE     = 20;
let ultimoDocumento = null;
let cargando        = false;
let todoCargado     = false;
let scrollObserver  = null; // referencia al IntersectionObserver activo

const cacheProductos = new Map();

async function cargarMasProductos() {
  if (cargando || todoCargado) return;
  cargando = true;

  const gridInicio = document.querySelector(".catalog .product-grid");
  if (!gridInicio) { cargando = false; return; }

  // Mostrar indicador de carga sutil
  const spinner = document.getElementById("carga-spinner");
  if (spinner) spinner.style.display = "block";

  try {
    let q = query(
      collection(db, "productos"),
      orderBy("fecha", "desc"),
      limit(PAGE_SIZE)
    );

    if (ultimoDocumento) {
      q = query(
        collection(db, "productos"),
        orderBy("fecha", "desc"),
        limit(PAGE_SIZE),
        startAfter(ultimoDocumento)
      );
    }

    const snapshot = await getDocs(q);

    if (snapshot.size < PAGE_SIZE) todoCargado = true;

    snapshot.forEach((documento) => {
      cacheProductos.set(documento.id, { id: documento.id, ...documento.data() });
      const card = crearTarjetaProducto(documento.id, documento.data(), "inicio");
      gridInicio.appendChild(card);
    });

    if (!snapshot.empty) {
      ultimoDocumento = snapshot.docs[snapshot.docs.length - 1];
    }

    // Si ya no hay más datos, desconectar el observer y ocultar sentinel
    if (todoCargado) {
      if (scrollObserver) scrollObserver.disconnect();
      const sentinel = document.getElementById("sentinel");
      if (sentinel) sentinel.style.display = "none";
    }

  } catch (e) {
    console.error("Error cargando productos:", e);
  } finally {
    cargando = false;
    if (spinner) spinner.style.display = "none";
  }
}

// ──────────────────────────────────────────────────────────────────
//  PILAR 3: Inicializar el IntersectionObserver sobre el sentinel
//
//  El sentinel es un div vacío al final del .catalog en index.html.
//  Cuando el 10% del sentinel entra al viewport (threshold: 0.1),
//  el Observer lo detecta y carga la siguiente página.
//  rootMargin: "200px" hace que el trigger ocurra 200px ANTES de
//  que el sentinel llegue visualmente, dando la ilusión de
//  carga instantánea mientras el usuario aún está scrolleando.
// ──────────────────────────────────────────────────────────────────
function iniciarInfiniteScroll() {
  const sentinel = document.getElementById("sentinel");
  if (!sentinel) return;

  scrollObserver = new IntersectionObserver(
    (entries) => {
      // entries[0].isIntersecting === true cuando el sentinel es visible
      if (entries[0].isIntersecting) {
        cargarMasProductos();
      }
    },
    {
      root: null,       // el viewport del navegador
      rootMargin: "200px", // empieza a cargar 200px antes del borde inferior
      threshold: 0.1    // 10% del sentinel visible = disparar
    }
  );

  scrollObserver.observe(sentinel);
}

// ============================================================
//  SECCIÓN 5 — CONSTRUCCIÓN SEGURA DE TARJETAS DE PRODUCTO
// ============================================================

const ICONOS_CAT = {
  dulces: "🍫", bebidas: "☕", salados: "🍔",
  servicios: "🔧", materiales: "📚"
};

function crearTarjetaProducto(id, p, modo = "inicio") {
  const article = document.createElement("article");
  article.className = "product-card";
  article.style.cssText = "cursor:pointer; position:relative;";
  article.dataset.id       = id;
  article.dataset.category = (p.categoria || "").toLowerCase();
  article.dataset.action   = "ver-detalle";

  const estaAgotado = p.estado === "agotado";
  const emoji       = ICONOS_CAT[(p.categoria || "").toLowerCase()] || "📦";

  // ── Contenedor de imagen ──
  const imgWrap = document.createElement("div");
  imgWrap.className = "card-image-wrap";
  imgWrap.style.cssText = `
    background: linear-gradient(135deg,#c8a97a 0%,#a07850 100%);
    display:flex; align-items:center; justify-content:center; position:relative;
  `;

  if (estaAgotado) {
    const cartel = document.createElement("div");
    cartel.style.cssText = `
      position:absolute; top:50%; left:50%;
      transform:translate(-50%,-50%) rotate(-10deg);
      background:#ff4d6d; color:white; font-weight:900;
      font-size:1rem; padding:4px 10px; border-radius:6px;
      z-index:10; border:2px solid white;
    `;
    cartel.textContent = "AGOTADO";
    imgWrap.appendChild(cartel);
  }

  if (p.imagen && p.imagen.trim()) {
    const img = document.createElement("img");
    img.src   = p.imagen;
    img.style.cssText = `
      width:100%; height:100%; object-fit:cover;
      border-radius:18px 18px 0 0;
      ${estaAgotado ? "filter:grayscale(100%) opacity(0.6);" : ""}
    `;
    img.alt = p.titulo || "Producto";
    imgWrap.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.className = "img-placeholder-icon";
    span.style.cssText = `font-size:3rem; ${estaAgotado ? "filter:grayscale(100%) opacity(0.6);" : ""}`;
    span.textContent = emoji;
    imgWrap.appendChild(span);
  }

  const badge = document.createElement("span");
  badge.className = "badge-price";
  if (estaAgotado) badge.style.cssText = "background:#666; color:white;";
  badge.textContent = `S/ ${(p.precio || 0).toFixed(2)}`;
  imgWrap.appendChild(badge);

  article.appendChild(imgWrap);

  // ── Cuerpo de la tarjeta ──
  const body = document.createElement("div");
  body.className = "card-body";

  const titulo = document.createElement("h3");
  titulo.className = "card-title";
  if (estaAgotado) titulo.style.cssText = "color:#999; text-decoration:line-through;";
  titulo.textContent = p.titulo || "Sin título";
  body.appendChild(titulo);

  // ── Vendedor ──
  const vendedorDiv = document.createElement("div");
  vendedorDiv.className = "card-seller";
  vendedorDiv.style.cssText = "display:flex; align-items:center; gap:6px; cursor:pointer;";
  if (p.userUid) vendedorDiv.dataset.uid = p.userUid;
  vendedorDiv.dataset.action = "ver-vendedor";

  if (p.avatarVendedor && p.avatarVendedor.trim()) {
    const avatarImg = document.createElement("img");
    avatarImg.src   = p.avatarVendedor;
    avatarImg.alt   = p.vendedor || "Vendedor";
    avatarImg.style.cssText = "width:24px; height:24px; border-radius:50%; object-fit:cover; flex-shrink:0;";
    vendedorDiv.appendChild(avatarImg);
  } else {
    const inicial = document.createElement("span");
    inicial.style.cssText = `
      width:24px; height:24px; border-radius:50%;
      background:linear-gradient(135deg,#c8a97a,#a07850);
      color:white; font-size:11px; font-weight:900;
      display:inline-flex; align-items:center; justify-content:center;
    `;
    inicial.textContent = (p.vendedor || "?").charAt(0).toUpperCase();
    vendedorDiv.appendChild(inicial);
  }

  const nombreVendedor = document.createElement("span");
  nombreVendedor.className = "seller-name";
  nombreVendedor.textContent = p.vendedor || "Vendedor UNP";
  vendedorDiv.appendChild(nombreVendedor);
  body.appendChild(vendedorDiv);

  // ── Botones de gestión (solo en modo "perfil") ──
  if (modo === "perfil") {
    const botonesDiv = document.createElement("div");
    botonesDiv.style.cssText = `
      display:flex; gap:4px; margin-top:8px;
      border-top:1px solid var(--border-subtle); padding-top:8px;
    `;

    const btnEditar = crearBotonAccion("editar", "Editar", "#f1f3f5", "#5c5c7a");
    btnEditar.dataset.action = "editar-producto";
    btnEditar.dataset.id          = id;
    btnEditar.dataset.titulo      = p.titulo      || "";
    btnEditar.dataset.precio      = p.precio      || 0;
    btnEditar.dataset.imagen      = p.imagen      || "";
    btnEditar.dataset.descripcion = p.descripcion || "";

    const btnStock = crearBotonAccion(
      estaAgotado ? "activar" : "agotar",
      estaAgotado ? "Activar" : "Agotar",
      "#f1f3f5", "#5c5c7a"
    );
    btnStock.dataset.action = "toggle-stock";
    btnStock.dataset.id     = id;
    btnStock.dataset.estado = p.estado || "disponible";

    const btnBorrar = crearBotonAccion("borrar", "Borrar", "#fff0f0", "#dc2626");
    btnBorrar.dataset.action = "borrar-producto";
    btnBorrar.dataset.id     = id;

    botonesDiv.appendChild(btnEditar);
    botonesDiv.appendChild(btnStock);
    botonesDiv.appendChild(btnBorrar);
    body.appendChild(botonesDiv);
  }

  article.appendChild(body);
  return article;
}

function crearBotonAccion(tipo, etiqueta, bg, color) {
  const btn = document.createElement("button");
  btn.style.cssText = `
    flex:1; display:flex; align-items:center; justify-content:center;
    gap:4px; background:${bg}; border:none; padding:6px 0;
    border-radius:6px; font-size:10px; font-family:var(--font);
    font-weight:800; color:${color}; cursor:pointer;
  `;
  btn.textContent = etiqueta;
  return btn;
}

// ============================================================
//  SECCIÓN 6 — DELEGACIÓN DE EVENTOS
//
//  PILAR 1 — CAMBIO CLAVE en el case "ver-detalle":
//
//  ANTES (roto para compartir):
//    localStorage.setItem("productoSeleccionado", id);
//    window.location.href = "producto.html";
//
//  AHORA (compartible y limpio):
//    window.location.href = `producto.html?id=${id}`;
//
//  Con esto, el URL completo del producto es:
//    https://tu-dominio.com/producto.html?id=abc123
//  Un usuario puede copiar ese URL, enviarlo por WhatsApp, y
//  el receptor verá exactamente el mismo producto. 
// ============================================================

function registrarDelegacionEventos() {
  document.body.addEventListener("click", async (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;

    const accion = target.dataset.action;

    if (accion !== "ver-detalle") e.stopPropagation();

    switch (accion) {

      // ── PILAR 1: Navegar al detalle con URL limpia ────────────
      case "ver-detalle": {
        const id = target.closest("[data-id]")?.dataset.id;
        if (id) {
          // ✅ CAMBIO: URL compartible en lugar de localStorage
          window.location.href = `producto.html?id=${id}`;
        }
        break;
      }

      // ── Ir al perfil del vendedor ─────────────────────────────
      case "ver-vendedor": {
        e.stopPropagation();
        const uid = target.dataset.uid;
        if (uid) window.location.href = `vendedor.html?uid=${uid}`;
        break;
      }

      // ── Abrir modal de edición de producto ───────────────────
      case "editar-producto": {
        const { id, titulo, precio, imagen, descripcion } = target.dataset;
        abrirModalEdicion(id, titulo, precio, imagen, descripcion);
        break;
      }

      // ── Cambiar estado disponible ↔ agotado ──────────────────
      case "toggle-stock": {
        const { id, estado } = target.dataset;
        const nuevo     = estado === "agotado" ? "disponible" : "agotado";
        const titulo    = nuevo === "agotado" ? "¿Agotar producto?"   : "¿Reactivar producto?";
        const msg       = nuevo === "agotado"
          ? "El producto se mostrará como fuera de stock."
          : "El producto volverá a estar disponible.";

        const ok = await mostrarConfirmacion(titulo, msg);
        if (!ok) break;

        try {
          await updateDoc(doc(db, "productos", id), { estado: nuevo });
          mostrarToast(nuevo === "agotado" ? "Producto marcado como agotado" : "¡Stock renovado!");
        } catch { mostrarToast("Error al actualizar stock", "error"); }
        break;
      }

      // ── Eliminar producto ─────────────────────────────────────
      case "borrar-producto": {
        const { id } = target.dataset;
        const ok = await mostrarConfirmacion(
          "¿Eliminar publicación?",
          "Esta acción quitará el producto de forma definitiva.",
          "danger"
        );
        if (!ok) break;
        try {
          await deleteDoc(doc(db, "productos", id));
          mostrarToast("Publicación eliminada");
        } catch { mostrarToast("No se pudo eliminar", "error"); }
        break;
      }

      case "cerrar-modal-edicion": {
        cerrarModalEdicion();
        break;
      }

      case "cerrar-modal-perfil": {
        cerrarModalPerfil();
        break;
      }

      case "abrir-modal-perfil": {
        abrirModalPerfil();
        break;
      }

      // ── Marcar notificación como leída ────────────────────────
      case "marcar-notif-leida": {
        const { notifId, productoId } = target.dataset;
        try {
          await updateDoc(doc(db, "notificaciones", notifId), { leido: true });
          if (productoId) {
            // ✅ CAMBIO: también las notificaciones usan URL compartible
            window.location.href = `producto.html?id=${productoId}`;
          }
        } catch { /* silencioso */ }
        break;
      }

      // ── Marcar todas las notificaciones como leídas ───────────
      case "marcar-todas-leidas": {
        if (!currentUser) break;
        try {
          const q    = query(
            collection(db, "notificaciones"),
            where("paraUid", "==", currentUser.uid),
            where("leido",   "==", false)
          );
          const snap = await getDocs(q);
          await Promise.all(snap.docs.map(d =>
            updateDoc(doc(db, "notificaciones", d.id), { leido: true })
          ));
        } catch { /* silencioso */ }
        break;
      }

      case "toggle-favorito": {
        const { productoId } = target.dataset;
        await toggleFavorito(productoId, target);
        break;
      }
    }
  });

  // ── Chips de categoría ───────────────────────────────────────
  document.querySelectorAll(".category-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const cat = chip.dataset.category.toLowerCase();
      document.querySelectorAll(".product-card").forEach(card => {
        card.style.display =
          (cat === "todos" || card.dataset.category === cat) ? "block" : "none";
      });
    });
  });

  // ── Buscador ──────────────────────────────────────────────────
  const buscador = document.getElementById("input-buscador");
  if (buscador) {
    buscador.addEventListener("input", (e) => {
      const texto = e.target.value.toLowerCase();
      document.querySelectorAll(".catalog .product-card").forEach(card => {
        const titulo = card.querySelector(".card-title")?.textContent.toLowerCase() || "";
        card.style.display = titulo.includes(texto) ? "block" : "none";
      });
    });
  }

  // ── Pestañas de navegación ────────────────────────────────────
  const btnInicio    = document.getElementById("btn-nav-inicio");
  const btnFavoritos = document.getElementById("btn-nav-favoritos");
  const btnNotifs    = document.getElementById("btn-nav-notifs");

  if (btnInicio)    btnInicio.addEventListener("click",    (e) => { e.preventDefault(); alternarPestaña("inicio"); });
  if (btnFavoritos) btnFavoritos.addEventListener("click", (e) => { e.preventDefault(); alternarPestaña("favoritos"); });
  if (btnNotifs)    btnNotifs.addEventListener("click",    (e) => { e.preventDefault(); alternarPestaña("notifs"); });

  const tabParam = new URLSearchParams(window.location.search).get("tab");
  if (tabParam === "favoritos") alternarPestaña("favoritos");
  else if (tabParam === "notifs") alternarPestaña("notifs");
}

// Shim de compatibilidad para onclick="" que ya existen en el HTML
window.cerrarModalEdicion = cerrarModalEdicion;
window.cerrarModalPerfil  = cerrarModalPerfil;
window.abrirModalPerfil   = abrirModalPerfil;

// ============================================================
//  SECCIÓN 7 — PESTAÑAS
// ============================================================

function alternarPestaña(pestaña) {
  const catalogo         = document.querySelector(".catalog");
  const buscador         = document.querySelector(".search-wrapper");
  const categorias       = document.querySelector(".categories-scroll");
  const secFavoritos     = document.getElementById("seccion-favoritos");
  const secNotifs        = document.getElementById("seccion-notifs");
  const btnInicio        = document.getElementById("btn-nav-inicio");
  const btnFavoritos     = document.getElementById("btn-nav-favoritos");
  const btnNotifs        = document.getElementById("btn-nav-notifs");

  const mostrar = (el) => { if (el) el.style.display = "block"; };
  const ocultar = (el) => { if (el) el.style.display = "none"; };

  [btnInicio, btnFavoritos, btnNotifs].forEach(b => b?.classList.remove("active"));

  if (pestaña === "inicio") {
    mostrar(catalogo); mostrar(buscador);
    if (categorias) categorias.style.display = "flex";
    ocultar(secFavoritos); ocultar(secNotifs);
    btnInicio?.classList.add("active");
  } else if (pestaña === "favoritos") {
    ocultar(catalogo); ocultar(buscador);
    if (categorias) categorias.style.display = "none";
    mostrar(secFavoritos); ocultar(secNotifs);
    btnFavoritos?.classList.add("active");
    cargarFavoritos();
  } else if (pestaña === "notifs") {
    ocultar(catalogo); ocultar(buscador);
    if (categorias) categorias.style.display = "none";
    ocultar(secFavoritos); mostrar(secNotifs);
    btnNotifs?.classList.add("active");
  }
}

// ============================================================
//  SECCIÓN 8 — FAVORITOS
// ============================================================

function obtenerFavoritosLocales() {
  return JSON.parse(localStorage.getItem("listaFavoritos")) || [];
}

async function toggleFavorito(productoId, btnElement) {
  let favs = obtenerFavoritosLocales();
  const eraFavorito = favs.includes(productoId);

  favs = eraFavorito
    ? favs.filter(id => id !== productoId)
    : [...favs, productoId];

  localStorage.setItem("listaFavoritos", JSON.stringify(favs));

  if (btnElement) {
    const svg = btnElement.querySelector("svg");
    if (svg) {
      const activo = favs.includes(productoId);
      svg.setAttribute("fill",   activo ? "#ef4444" : "none");
      svg.setAttribute("stroke", activo ? "#ef4444" : "currentColor");
    }
  }

  if (currentUser) {
    try {
      await setDoc(doc(db, "usuarios", currentUser.uid), { favoritos: favs }, { merge: true });
    } catch { /* silencioso */ }

    if (!eraFavorito) {
      try {
        const prodSnap = await getDoc(doc(db, "productos", productoId));
        if (prodSnap.exists()) {
          await crearNotificacion({
            paraUid:        prodSnap.data().userUid,
            tipo:           "favorito",
            productoId,
            productoTitulo: prodSnap.data().titulo
          });
        }
      } catch { /* silencioso */ }
    }
  }
}

function cargarFavoritos() {
  const grid = document.getElementById("lista-favoritos");
  if (!grid) return;
  grid.innerHTML = "";

  const favs = obtenerFavoritosLocales();
  if (favs.length === 0) {
    const p = document.createElement("p");
    p.style.cssText = "text-align:center; width:100%; color:#666; grid-column:1/-1;";
    p.textContent   = "Aún no tienes favoritos guardados.";
    grid.appendChild(p);
    return;
  }

  favs.forEach(id => {
    const prod = cacheProductos.get(id);
    if (prod) {
      grid.appendChild(crearTarjetaProducto(id, prod, "inicio"));
    }
  });
}

// ============================================================
//  SECCIÓN 9 — NOTIFICACIONES EN TIEMPO REAL
// ============================================================

async function crearNotificacion({ paraUid, tipo, productoId, productoTitulo }) {
  if (!paraUid || !currentUser) return;
  if (currentUser.uid === paraUid) return;

  await addDoc(collection(db, "notificaciones"), {
    paraUid,
    deUid:          currentUser.uid,
    deNombre:       currentUser.displayName || "Un usuario",
    tipo,
    productoId,
    productoTitulo: productoTitulo || "un producto",
    leido:          false,
    timestamp:      serverTimestamp()
  });
}

function iniciarEscuchaNotificaciones() {
  if (!currentUser) return;

  const badge   = document.querySelector(".nav-notif-badge");
  const panelEl = document.getElementById("seccion-notifs");

  const q = query(
    collection(db, "notificaciones"),
    where("paraUid", "==", currentUser.uid),
    where("leido",   "==", false)
  );

  onSnapshot(q, (snap) => {
    if (badge) {
      badge.textContent   = snap.size > 9 ? "9+" : String(snap.size);
      badge.style.display = snap.size > 0 ? "flex" : "none";
    }

    if (!panelEl) return;

    if (snap.size === 0) {
      panelEl.innerHTML = "";
      const vacio = document.createElement("div");
      vacio.style.cssText = "padding:20px 16px;";
      vacio.innerHTML = `
        <h2 style="font-size:1.2rem; font-weight:800; margin-bottom:15px;">Notificaciones</h2>
        <div style="background:#f7f8fc; padding:20px 16px; border-radius:14px; border:1.5px solid #e8e8f0; text-align:center;">
          <p style="font-size:2rem; margin-bottom:8px;">🔔</p>
          <p style="font-weight:700; font-size:0.9rem; color:#1a1a2e; margin-bottom:4px;">Todo al día</p>
          <p style="font-size:0.8rem; color:#5c5c7a;">Aquí verás cuando alguien guarde tus productos como favorito.</p>
        </div>`;
      panelEl.appendChild(vacio);
      return;
    }

    panelEl.innerHTML = "";

    const header = document.createElement("h2");
    header.style.cssText = "font-size:1.2rem; font-weight:800; margin-bottom:15px; padding:20px 16px 0; display:flex; align-items:center; justify-content:space-between;";
    header.textContent = "Notificaciones";

    const btnTodas = document.createElement("button");
    btnTodas.style.cssText = "font-size:0.75rem; font-weight:800; color:#3a7d44; background:none; border:1.5px solid #3a7d44; border-radius:20px; padding:4px 12px; cursor:pointer; font-family:'Nunito',sans-serif;";
    btnTodas.textContent    = "Marcar todas leídas";
    btnTodas.dataset.action = "marcar-todas-leidas";
    header.appendChild(btnTodas);
    panelEl.appendChild(header);

    const lista = document.createElement("div");
    lista.style.cssText = "padding:0 16px 100px; display:flex; flex-direction:column; gap:10px;";

    const ordenados = snap.docs.slice().sort((a, b) =>
      (b.data().timestamp?.toMillis() || 0) - (a.data().timestamp?.toMillis() || 0)
    );

    ordenados.forEach(d => {
      const n     = d.data();
      const esFav = n.tipo === "favorito";

      const item = document.createElement("div");
      item.style.cssText = `
        background:${esFav ? "#fff5f7" : "#f0f7f2"};
        border:1.5px solid ${esFav ? "#fecdd3" : "#bbf7d0"};
        border-radius:14px; padding:14px 16px;
        display:flex; align-items:flex-start; gap:12px; cursor:pointer;
      `;
      item.dataset.action    = "marcar-notif-leida";
      item.dataset.notifId   = d.id;
      item.dataset.productoId = n.productoId || "";

      const icono = document.createElement("span");
      icono.style.cssText = "font-size:1.4rem; flex-shrink:0;";
      icono.textContent   = esFav ? "❤️" : "💬";

      const contenido = document.createElement("div");
      contenido.style.flex = "1";

      const texto = document.createElement("p");
      texto.style.cssText = "font-size:0.85rem; font-weight:600; color:#1a1a2e; margin:0; line-height:1.45;";
      const negrita = document.createElement("strong");
      negrita.textContent = n.deNombre || "Alguien";
      const sufijo  = document.createElement("span");
      sufijo.textContent  = esFav
        ? ` guardó "${n.productoTitulo}" en favoritos`
        : ` quiere comprar "${n.productoTitulo}"`;
      texto.appendChild(negrita);
      texto.appendChild(sufijo);

      const tiempo = document.createElement("p");
      tiempo.style.cssText = "font-size:0.72rem; font-weight:700; color:#a0a0b8; margin:4px 0 0;";
      if (n.timestamp) {
        const mins = Math.floor((Date.now() - n.timestamp.toMillis()) / 60000);
        tiempo.textContent = mins < 1 ? "Ahora mismo"
          : mins < 60   ? `Hace ${mins} min`
          : mins < 1440 ? `Hace ${Math.floor(mins / 60)} h`
          : `Hace ${Math.floor(mins / 1440)} d`;
      }

      contenido.appendChild(texto);
      contenido.appendChild(tiempo);

      const badge2 = document.createElement("span");
      badge2.style.cssText = "font-size:0.65rem; font-weight:900; color:white; background:#3a7d44; border-radius:20px; padding:2px 8px; flex-shrink:0; align-self:center;";
      badge2.textContent   = "NUEVA";

      item.appendChild(icono);
      item.appendChild(contenido);
      item.appendChild(badge2);
      lista.appendChild(item);
    });

    panelEl.appendChild(lista);
  });
}

// ============================================================
//  SECCIÓN 10 — PERFIL DE USUARIO
// ============================================================

function renderizarPerfil() {
  if (currentUser) {
    getDoc(doc(db, "usuarios", currentUser.uid))
      .then(snap => {
        const perfil = snap.exists() ? snap.data() : {};
        _pintarPerfil(perfil);
      })
      .catch(() => {
        _pintarPerfil(JSON.parse(localStorage.getItem("unp_user_profile")) || {});
      });
  } else {
    _pintarPerfil(JSON.parse(localStorage.getItem("unp_user_profile")) || {});
  }
}

function _pintarPerfil(perfil) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) {
      // PILAR 4: quitar clase skeleton al rellenar con datos reales
      el.classList.remove("skeleton");
      el.textContent = val || "";
    }
  };
  set("ui-nombre",    perfil.nombre    || "Estudiante UNP");
  set("ui-bio",       perfil.bio       || "Estudiante de la UNP");
  set("ui-acerca",    perfil.acercaDe  || "¡Hola! Bienvenido a mi tienda.");
  set("ui-ubicacion", perfil.ubicacion || "Piura");
  set("perfil-telefono-display", perfil.telefono || "Sin WhatsApp");

  const uiAvatar = document.getElementById("ui-avatar");
  if (uiAvatar) {
    uiAvatar.classList.remove("skeleton");
    if (perfil.avatar && perfil.avatar.trim()) {
      const img = document.createElement("img");
      img.src   = perfil.avatar;
      img.alt   = perfil.nombre || "Avatar";
      img.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:50%;";
      uiAvatar.innerHTML = "";
      uiAvatar.appendChild(img);
    } else {
      uiAvatar.textContent = (perfil.nombre || "U").charAt(0).toUpperCase();
    }
  }

  const header = document.querySelector(".up-header");
  if (header) {
    if (perfil.portada && perfil.portada.trim()) {
      header.style.backgroundImage    = `url('${perfil.portada}')`;
      header.style.backgroundSize     = "cover";
      header.style.backgroundPosition = "center";
    } else {
      header.style.backgroundImage = "none";
      header.style.background      = "linear-gradient(135deg,#c8a97a 0%,#a07850 100%)";
    }
  }
}

function abrirModalPerfil() {
  const settingsMenu = document.getElementById("settings-menu");
  if (settingsMenu) settingsMenu.classList.remove("up-settings-menu--open");

  const perfil = JSON.parse(localStorage.getItem("unp_user_profile")) || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("perfil-input-nombre",    perfil.nombre);
  set("perfil-input-bio",       perfil.bio);
  set("perfil-input-acerca",    perfil.acercaDe);
  set("perfil-input-ubicacion", perfil.ubicacion);
  set("perfil-input-telefono",  perfil.telefono);
  set("perfil-input-avatar",    perfil.avatar);
  set("perfil-input-portada",   perfil.portada);

  const modal = document.getElementById("modal-perfil");
  if (modal) modal.style.display = "flex";
}

function cerrarModalPerfil() {
  const modal = document.getElementById("modal-perfil");
  if (modal) modal.style.display = "none";
}

function iniciarGuardarPerfil() {
  const btn = document.getElementById("btn-guardar-perfil");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!currentUser) { mostrarToast("Sesión expirada, inicia sesión de nuevo.", "error"); return; }

    const perfilAnterior = JSON.parse(localStorage.getItem("unp_user_profile")) || {};
    btn.disabled    = true;
    btn.textContent = "Guardando...";

    try {
      const avatarFinal  = document.getElementById("perfil-input-avatar")?.value  || perfilAnterior.avatar  || "";
      const portadaFinal = document.getElementById("perfil-input-portada")?.value || perfilAnterior.portada || "";

      const nuevoPerfil = {
        ...perfilAnterior,
        uid:       currentUser.uid,
        nombre:    document.getElementById("perfil-input-nombre")?.value    || perfilAnterior.nombre,
        bio:       document.getElementById("perfil-input-bio")?.value       || perfilAnterior.bio,
        acercaDe:  document.getElementById("perfil-input-acerca")?.value    || perfilAnterior.acercaDe,
        ubicacion: document.getElementById("perfil-input-ubicacion")?.value || perfilAnterior.ubicacion,
        telefono:  document.getElementById("perfil-input-telefono")?.value?.trim() || perfilAnterior.telefono || "",
        avatar:    avatarFinal,
        portada:   portadaFinal
      };

      await setDoc(doc(db, "usuarios", currentUser.uid), nuevoPerfil, { merge: true });
      localStorage.setItem("unp_user_profile", JSON.stringify(nuevoPerfil));

      renderizarPerfil();
      cerrarModalPerfil();
      mostrarToast("¡Perfil guardado correctamente!");

      if (avatarFinal !== perfilAnterior.avatar) {
        btn.textContent = "Actualizando productos...";
        try {
          const q    = query(collection(db, "productos"), where("userUid", "==", currentUser.uid));
          const snap = await getDocs(q);
          await Promise.all(snap.docs.map(d =>
            updateDoc(doc(db, "productos", d.id), { avatarVendedor: avatarFinal })
          ));
          mostrarToast(`✓ Foto actualizada en ${snap.size} publicación${snap.size !== 1 ? "es" : ""}`);
        } catch { /* silencioso */ }
      }

    } catch (e) {
      console.error(e);
      mostrarToast("Error al guardar el perfil", "error");
    } finally {
      btn.disabled    = false;
      btn.textContent = "Guardar Perfil";
    }
  });
}

// ============================================================
//  SECCIÓN 11 — PUBLICAR NUEVO PRODUCTO
// ============================================================

function iniciarFormPublicar() {
  const form = document.getElementById("form-publicar");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
      mostrarToast("Debes iniciar sesión para publicar.", "error");
      return;
    }

    const perfilSnap = await getDoc(doc(db, "usuarios", currentUser.uid));
    const perfil     = perfilSnap.exists() ? perfilSnap.data() : {};

    if (!perfil.telefono || perfil.telefono.trim().length < 7) {
      alert("⚠️ Debes registrar tu WhatsApp en tu perfil para que los compradores puedan contactarte.");
      window.location.href = "perfil.html";
      return;
    }

    const btn = document.getElementById("btn-publicar");
    btn.disabled    = true;
    btn.textContent = "Comprimiendo imagen...";

    try {
      const fileInput   = document.getElementById("file-imagen-publicar");
      const fileOriginal = fileInput.files[0];

      // ── PILAR 2: Comprimir con Canvas antes de subir ──────────
      // La función comprimirImagen devuelve un Blob ya procesado.
      // subirImagenImgBB acepta tanto File como Blob, así que no
      // necesitamos cambiar nada más en la cadena de subida.
      const fileComprimido = fileOriginal
        ? await comprimirImagen(fileOriginal)
        : null;

      btn.textContent = "Subiendo imagen...";
      const imagenFinal = await subirImagenImgBB(fileComprimido, "");

      btn.textContent = "Publicando...";
      await addDoc(collection(db, "productos"), {
        titulo:         document.getElementById("titulo").value,
        precio:         parseFloat(document.getElementById("precio").value),
        categoria:      document.getElementById("categoria").value,
        descripcion:    document.getElementById("descripcion").value,
        imagen:         imagenFinal,
        vendedor:       perfil.nombre   || currentUser.displayName || "Vendedor UNP",
        avatarVendedor: perfil.avatar   || currentUser.photoURL    || "",
        telefono:       perfil.telefono || "",
        userUid:        currentUser.uid,
        estado:         "disponible",
        fecha:          serverTimestamp()
      });

      localStorage.setItem("mostrarToastPublicar", "true");
      window.location.href = "index.html";
    } catch (err) {
      console.error(err);
      mostrarToast("Error al publicar", "error");
      btn.disabled    = false;
      btn.textContent = "Publicar Producto";
    }
  });
}

// ============================================================
//  SECCIÓN 11B — PILAR 2: COMPRESIÓN DE IMAGEN CON CANVAS
//
//  POR QUÉ CANVAS:
//  El navegador puede "dibujar" cualquier imagen en un <canvas>
//  y luego exportarla como JPEG comprimido. Esto ocurre 100%
//  en el cliente, sin servidor, sin costo. El flujo es:
//
//  File/Blob original → FileReader → Image → Canvas → Blob comprimido
//
//  PARÁMETROS ELEGIDOS:
//  - MAX_DIMENSION: 1080px — resolución Full HD suficiente para
//    una app de marketplace de campus. Fotos de cámara móvil
//    suelen ser 3000-4000px. Las reducimos ~3x antes de subir.
//  - CALIDAD: 0.70 (70%) — balance óptimo calidad/peso.
//    Una foto de 2MB queda en ~200-400KB. ImgBB carga 5-10x más rápido.
//
//  RETORNA: Promise<Blob> — compatible con FormData.append()
// ============================================================

const MAX_DIMENSION = 1080;
const CALIDAD_JPEG  = 0.70;

function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    // Paso 1: Leer el archivo como Data URL
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload  = (e) => {
      // Paso 2: Crear un elemento Image y cargar el Data URL
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.onload  = () => {
        // Paso 3: Calcular las nuevas dimensiones manteniendo el ratio
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width  = MAX_DIMENSION;
          } else {
            width  = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        // Si ya es pequeña (< 1080px), no redimensionamos, solo recomprimimos

        // Paso 4: Dibujar en canvas con las nuevas dimensiones
        const canvas    = document.createElement("canvas");
        canvas.width    = width;
        canvas.height   = height;
        const ctx       = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Paso 5: Exportar como JPEG al 70% de calidad → Blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              // Fallback: si el canvas falla, usar el archivo original
              resolve(file);
            }
          },
          "image/jpeg",
          CALIDAD_JPEG
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
//  SECCIÓN 12 — MIS PRODUCTOS (en perfil.html)
// ============================================================

function cargarMisProductos() {
  const grid = document.getElementById("mis-productos");
  if (!grid || !currentUser) return;

  const q = query(
    collection(db, "productos"),
    where("userUid", "==", currentUser.uid),
    orderBy("fecha", "desc")
  );

  onSnapshot(q, (snapshot) => {
    grid.innerHTML = "";
    if (snapshot.empty) {
      const p = document.createElement("p");
      p.style.cssText = "text-align:center; width:100%; color:#666; grid-column:1/-1; margin-top:20px;";
      p.textContent   = "Aún no has publicado ningún producto.";
      grid.appendChild(p);
      return;
    }
    snapshot.forEach(d => {
      grid.appendChild(crearTarjetaProducto(d.id, d.data(), "perfil"));
    });
  });
}

// ============================================================
//  SECCIÓN 13 — MODAL DE EDICIÓN DE PRODUCTO
// ============================================================

function abrirModalEdicion(id, titulo, precio, imagen, descripcion) {
  const modal = document.getElementById("modal-editar");
  if (!modal) return;

  document.getElementById("edit-id").value          = id;
  document.getElementById("edit-titulo").value      = titulo;
  document.getElementById("edit-precio").value      = precio;
  document.getElementById("edit-descripcion").value = descripcion;
  const urlField = document.getElementById("edit-imagen-url");
  if (urlField) urlField.value = imagen;

  const fileEl = document.getElementById("edit-imagen-file");
  if (fileEl) fileEl.value = "";
  const area = document.getElementById("edit-imagen-area");
  if (area) {
    area.textContent       = "Toca para cambiar la foto (opcional)";
    area.style.borderColor = "#c3c6d4";
  }

  modal.style.display = "flex";
}

function cerrarModalEdicion() {
  const modal = document.getElementById("modal-editar");
  if (modal) modal.style.display = "none";
}

function iniciarGuardarEdicion() {
  const btn = document.getElementById("btn-guardar-edicion");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!currentUser) return;

    const id          = document.getElementById("edit-id").value;
    const urlActual   = document.getElementById("edit-imagen-url")?.value || "";
    const fileNuevo   = document.getElementById("edit-imagen-file")?.files[0];

    btn.disabled    = true;
    btn.textContent = fileNuevo ? "Comprimiendo imagen..." : "Guardando...";

    try {
      let imagenFinal = urlActual;
      if (fileNuevo) {
        // PILAR 2: también comprimir al editar
        const fileComprimido = await comprimirImagen(fileNuevo);
        btn.textContent = "Subiendo imagen...";
        imagenFinal = await subirImagenImgBB(fileComprimido, urlActual);
      }

      btn.textContent = "Guardando...";

      await updateDoc(doc(db, "productos", id), {
        titulo:      document.getElementById("edit-titulo").value,
        precio:      parseFloat(document.getElementById("edit-precio").value),
        imagen:      imagenFinal,
        descripcion: document.getElementById("edit-descripcion").value
      });

      cerrarModalEdicion();
      mostrarToast("¡Producto modificado con éxito!");
    } catch (err) {
      console.error(err);
      mostrarToast("Error al guardar cambios", "error");
    } finally {
      btn.disabled    = false;
      btn.textContent = "Guardar";
    }
  });
}

// ============================================================
//  SECCIÓN 14 — PUNTO DE ENTRADA PRINCIPAL
// ============================================================

function iniciarApp() {
  registrarDelegacionEventos();

  const pagina = window.location.pathname.split("/").pop();

  if (pagina === "index.html" || pagina === "") {
    // Primero cargamos la primera tanda de productos,
    // luego iniciamos el scroll infinito sobre el sentinel
    cargarMasProductos().then(() => {
      iniciarInfiniteScroll();
    });
    iniciarEscuchaNotificaciones();
    if (localStorage.getItem("mostrarToastPublicar") === "true") {
      mostrarToast("¡Éxito total! Tu producto ya está en el catálogo.");
      localStorage.removeItem("mostrarToastPublicar");
    }
  }

  if (pagina === "perfil.html") {
    renderizarPerfil();
    cargarMisProductos();
    iniciarGuardarPerfil();
    iniciarGuardarEdicion();
    iniciarEscuchaNotificaciones();
  }

  if (pagina === "publicar.html") {
    iniciarFormPublicar();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    // onAuthStateChanged ya se registró arriba y llamará iniciarApp()
  });
}