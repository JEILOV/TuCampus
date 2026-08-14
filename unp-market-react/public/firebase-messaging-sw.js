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

// Logo de TuCampus — mismo ícono que usa el resto de la app
// (ver MASCOTA_ICONO en Home.jsx). Reemplazar cuando exista el
// logo final (ver público/assets/*-placeholder.png).
const ICONO_NOTIFICACION = "/assets/mascota-icono-placeholder.png";

messaging.onBackgroundMessage((payload) => {
  const titulo = payload.notification?.title || payload.data?.title || "TuCampus";
  const cuerpo =
    payload.notification?.body || payload.data?.body || "Tienes una novedad en tu campus.";
  // Enlace a abrir al hacer click — ver notificationclick más abajo.
  const enlace = payload.data?.url || payload.fcmOptions?.link || "/";

  self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: ICONO_NOTIFICACION,
    badge: ICONO_NOTIFICACION,
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