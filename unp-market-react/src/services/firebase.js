// src/services/firebase.js
// ============================================================
//  UNP Market — Singleton de inicialización Firebase (Vite/npm)
//
//  DIFERENCIA VS. VANILLA:
//  El proyecto original importaba desde gstatic CDN.
//  Aquí usamos los paquetes npm instalados con:
//    npm install firebase
//  Vite los empaqueta en el bundle final → sin peticiones CDN,
//  tree-shaking automático, tipado correcto.
// ============================================================

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore }                    from "firebase/firestore";
import { getAuth }                         from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyBJCG9nJGGgtQuWyz3nWE7QiSaW-CEVCno",
  authDomain:        "unp-market.firebaseapp.com",
  databaseURL:       "https://unp-market-default-rtdb.firebaseio.com",
  projectId:         "unp-market",
  storageBucket:     "unp-market.firebasestorage.app",
  messagingSenderId: "369921201729",
  appId:             "1:369921201729:web:d5ef3f9cdbf421d09a98c0",
};

// getApps() evita la doble inicialización en HMR de Vite
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);