// ============================================
//  1. CONFIGURACIÓN Y CONEXIÓN
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJCg9nJGGgtQuWyz3nWE7QiSaW-CEVCno",
  authDomain: "unp-market.firebaseapp.com",
  projectId: "unp-market",
  storageBucket: "unp-market.firebasestorage.app",
  messagingSenderId: "369921201729",
  appId: "1:369921201729:web:d5ef3f9cdbf421d09a98c0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================
//  2. LÓGICA DE CARGA DE DATOS
// ============================================
async function cargarDetalle() {
    const id = localStorage.getItem('productoSeleccionado');
    if (!id) return;

    try {
        const docSnap = await getDoc(doc(db, "productos", id));
        if (docSnap.exists()) {
            const p = docSnap.data();
            
            // ── TEXTOS DEL PRODUCTO ──
            document.querySelector('.product-info-title').textContent = p.titulo;
            document.querySelector('.price-amount').textContent = p.precio.toFixed(2);
            document.querySelector('.description-text').textContent = p.descripcion;
            
            const tagCategoria = document.querySelector('.category-tag');
            if (tagCategoria) tagCategoria.textContent = p.categoria;

            // ── MEJORA 1: NOMBRE Y AVATAR DINÁMICO ──
            let nombreVendedor = p.vendedor;
            // Si el sistema detecta que eres tú, pone tu nombre completo para que se vea más pro
            if (nombreVendedor === "Jordan P.") {
                nombreVendedor = "Jordan Josue Pardo";
            }
            document.querySelector('.seller-name').textContent = `${nombreVendedor} · Estudiante UNP`;
            
            const avatarVendedor = document.querySelector('.pd-seller-avatar');
            if (avatarVendedor && p.vendedor) {
                // Toma la primera letra del nombre (Ej. "Jordan" -> "J")
                avatarVendedor.textContent = p.vendedor.charAt(0).toUpperCase();
            }

            // ── MANEJO DE IMAGEN GRANDE Y ESTADO ──
            const hero = document.querySelector('.pd-hero-image');
            const emoji = document.querySelector('.pd-hero-emoji');
            const gradient = document.querySelector('.pd-hero-gradient');
            
            if (p.estado === "agotado") {
                hero.style.filter = "grayscale(100%) opacity(0.8)";
            }

            if (p.imagen && p.imagen.trim() !== "") {
                hero.style.backgroundImage = `url('${p.imagen}')`;
                hero.style.backgroundSize = 'cover';
                hero.style.backgroundPosition = 'center';
                if(emoji) emoji.style.display = 'none'; 
                if(gradient) gradient.style.display = 'none'; 
            } else {
                const iconos = { 'dulces': '🍫', 'bebidas': '☕', 'salados': '🍔', 'servicios': '🔧', 'materiales': '📚' };
                if (emoji) emoji.textContent = iconos[p.categoria.toLowerCase()] || '📦';
            }

            // ── BOTÓN WHATSAPP ──
            const btnWa = document.getElementById('link-whatsapp');
            if (btnWa) {
                if (p.estado === "agotado") {
                    btnWa.style.background = "#888"; 
                    btnWa.style.pointerEvents = "none";
                    btnWa.innerHTML = `
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px; height:20px; margin-right:8px;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                      Producto Agotado
                    `;
                } else {
                    const msj = encodeURIComponent(`Hola, vi tu producto "${p.titulo}" en UNP Market y estoy interesado.`);
                    btnWa.href = `https://wa.me/51999999999?text=${msj}`;
                }
            }

            // ── MEJORA 2: SISTEMA DE FAVORITOS (Corazón) ──
            const btnFavorito = document.querySelector('.pd-btn-wishlist');
            if (btnFavorito) {
                // Recuperamos los favoritos guardados en la memoria del navegador
                let favoritosGuardados = JSON.parse(localStorage.getItem('listaFavoritos')) || [];
                let esFavorito = favoritosGuardados.includes(id);

                const actualizarCorazonVisual = () => {
                    if (esFavorito) {
                        // Corazón relleno rojo
                        btnFavorito.innerHTML = `<svg viewBox="0 0 24 24" fill="#ff4d6d" stroke="#ff4d6d" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
                        btnFavorito.style.borderColor = "#ff4d6d";
                        btnFavorito.style.background = "#fff5f7";
                    } else {
                        // Corazón vacío normal
                        btnFavorito.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
                        btnFavorito.style.borderColor = "var(--border-subtle)";
                        btnFavorito.style.background = "var(--bg-white)";
                    }
                };

                // Pintamos el botón apenas carga la página
                actualizarCorazonVisual();

                // ¿Qué pasa al hacer clic en el corazón?
                btnFavorito.addEventListener('click', () => {
                    if (esFavorito) {
                        // Si ya era favorito, lo sacamos de la lista
                        favoritosGuardados = favoritosGuardados.filter(favId => favId !== id);
                    } else {
                        // Si no era favorito, lo agregamos
                        favoritosGuardados.push(id);
                    }
                    // Guardamos la nueva lista en la memoria
                    localStorage.setItem('listaFavoritos', JSON.stringify(favoritosGuardados));
                    esFavorito = !esFavorito; // Cambiamos el estado
                    actualizarCorazonVisual(); // Volvemos a pintar
                });
            }
        }
    } catch (e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', cargarDetalle);