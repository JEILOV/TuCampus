// ============================================================
//  firebase.js — Singleton de inicialización (UNP Market)
// ============================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJCG9nJGGgtQuWyz3nWE7QiSaW-CEVCno",
  authDomain: "unp-market.firebaseapp.com",
  databaseURL: "https://unp-market-default-rtdb.firebaseio.com",
  projectId: "unp-market",
  storageBucket: "unp-market.firebasestorage.app",
  messagingSenderId: "369921201729",
  appId: "1:369921201729:web:d5ef3f9cdbf421d09a98c0"
};

// getApps() evita la doble inicialización
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);