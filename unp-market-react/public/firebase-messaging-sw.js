// public/firebase-messaging-sw.js
// ============================================================
//  TuCampus — Service Worker de Firebase Cloud Messaging
//
//  Se encarga de mostrar la notificación del sistema cuando llega
//  un mensaje push y la app está en SEGUNDO PLANO (pestaña oculta)
//  o CERRADA. Cuando la app está en primer plano, el que maneja el
//  mensaje es onMessage() en src/services/notificationService.js
//  (ver escucharNotificacionesPrimerPlano).
//
//  🔧 Este SW es la ÚNICA fuente que llama a showNotification().
//  api/enviar-push.js manda el payload SOLO en `data` (nunca un
//  bloque `notification` en la raíz ni `webpush.notification`) —
//  si el payload trajera `notification`, el navegador/OS (sobre
//  todo Android) lo auto-muestra por su cuenta ADEMÁS de que este
//  handler llame a showNotification(), resultando en 2 notificaciones
//  por cada mensaje. Con payload data-only, onBackgroundMessage()
//  es el único que decide qué se muestra.
//
//  💸 Costo: $0.00 — FCM es gratuito, sin límite de envíos, en
//  cualquier plan de Firebase (incluido Spark).
//
//  ⚠️ Los Service Workers no pueden leer import.meta.env ni
//  variables del bundle de Vite (corren fuera del árbol de módulos
//  de la app), así que el config de Firebase va hardcodeado acá.
//  No es un secreto: son valores públicos, protegidos por las
//  Security Rules de Firestore, no por la confidencialidad de esta
//  config (mismo config que src/services/firebase.js).
// ============================================================

importScripts("https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.3.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBJCG9nJGGgtQuWyz3nWE7QiSaW-CEVCno",
  authDomain: "unp-market.firebaseapp.com",
  databaseURL: "https://unp-market-default-rtdb.firebaseio.com",
  projectId: "unp-market",
  storageBucket: "unp-market.firebasestorage.app",
  messagingSenderId: "369921201729",
  appId: "1:369921201729:web:d5ef3f9cdbf421d09a98c0",
});

const messaging = firebase.messaging();

// Logo de TuCampus — icon/badge por DEFECTO cuando el evento no trae
// `avatar` (ej. "nuevo producto en tu sede"). Mismo ícono que usa el
// resto de la app (ver MASCOTA_ICONO en Home.jsx). Reemplazar cuando
// exista el logo final (ver público/assets/*-placeholder.png).
const ICONO_DEFECTO = "/assets/mascota-icono-placeholder.png";

messaging.onBackgroundMessage((payload) => {
  // El payload llega SOLO en `data` (ver nota arriba) — el fallback a
  // `payload.notification` queda por robustez, por si algún día se
  // manda un push con ese formato desde otro origen (ej. una prueba
  // manual desde la consola de Firebase).
  const titulo = payload.notification?.title || payload.data?.title || "TuCampus";
  const cuerpo =
    payload.notification?.body || payload.data?.body || "Tienes una novedad en tu campus.";
  const enlace = payload.data?.url || payload.fcmOptions?.link || "/";

  // `icon`: círculo chico al costado del mensaje — el avatar de quien
  // originó el evento (remitente del chat, autor de la reseña). Si no
  // vino avatar (ej. "nuevo producto en tu sede"), cae al logo de la app.
  const icono = payload.data?.icon || ICONO_DEFECTO;

  // `image`: vista previa GRANDE expandida — solo para fotos de
  // PRODUCTO. A propósito no cae a ningún default: si no vino, la
  // notificación simplemente no se expande con una foto.
  const imagenGrande = payload.data?.image || undefined;

  self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: icono,
    badge: ICONO_DEFECTO,
    ...(imagenGrande ? { image: imagenGrande } : {}),
    vibrate: [200, 100, 200],
    tag: payload.data?.tag || "tucampus-notificacion",
    data: { url: enlace },
  });
});

// Al hacer click: si ya hay una pestaña de TuCampus abierta, la
// enfoca y navega al enlace; si no, abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if (cliente.url.startsWith(self.location.origin) && "focus" in cliente) {
          if ("navigate" in cliente) cliente.navigate(url);
          return cliente.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});