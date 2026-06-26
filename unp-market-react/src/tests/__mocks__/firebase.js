// src/tests/__mocks__/firebase.js
// ============================================================
//  Mock de Firebase compartido para todos los service tests
//
//  ESTRATEGIA: mockeamos "firebase/firestore" completo y
//  "src/services/firebase" (el singleton db).
//
//  Cada test puede sobreescribir el comportamiento de una
//  función específica con vi.mocked(fn).mockResolvedValueOnce(...)
//  sin afectar a los demás tests.
// ============================================================

import { vi } from "vitest";

// ── Snapshot falso: representa un doc que SÍ existe ─────────
export const makeSnap = (id, data) => ({
  exists: () => true,
  id,
  data: () => data,
});

// ── Snapshot falso: representa un doc que NO existe ─────────
export const makeEmptySnap = () => ({
  exists: () => false,
  id:     null,
  data:   () => null,
});

// ── QuerySnapshot falso ──────────────────────────────────────
export const makeQuerySnap = (items) => ({
  docs: items.map(({ id, data }) => makeSnap(id, data)),
  size: items.length,
  empty: items.length === 0,
});

// ── Mock de funciones de Firestore ───────────────────────────
export const mockGetDoc     = vi.fn();
export const mockSetDoc     = vi.fn();
export const mockUpdateDoc  = vi.fn();
export const mockDeleteDoc  = vi.fn();
export const mockAddDoc     = vi.fn();
export const mockGetDocs    = vi.fn();
export const mockWriteBatch = vi.fn();
export const mockBatchSet   = vi.fn();
export const mockBatchUpdate = vi.fn();
export const mockBatchCommit = vi.fn();

// ── Objeto batch falso que devuelve writeBatch() ─────────────
export const fakeBatch = {
  set:    mockBatchSet,
  update: mockBatchUpdate,
  delete: vi.fn(),
  commit: mockBatchCommit,
};

// ── Configuración del mock de "firebase/firestore" ───────────
vi.mock("firebase/firestore", () => ({
  getDoc:          mockGetDoc,
  setDoc:          mockSetDoc,
  updateDoc:       mockUpdateDoc,
  deleteDoc:       mockDeleteDoc,
  addDoc:          mockAddDoc,
  getDocs:         mockGetDocs,
  writeBatch:      mockWriteBatch,
  serverTimestamp: () => ({ _type: "serverTimestamp" }),
  arrayUnion:      (...args) => ({ _type: "arrayUnion", args }),
  arrayRemove:     (...args) => ({ _type: "arrayRemove", args }),
  // Helpers de query — devuelven sus args para poder afirmar sobre ellos
  doc:        (_db, col, id) => ({ _col: col, _id: id }),
  collection: (_db, col)     => ({ _col: col }),
  query:      (...args)      => ({ _query: args }),
  where:      (field, op, val)  => ({ field, op, val }),
  orderBy:    (field, dir)      => ({ field, dir }),
  limit:      (n)               => ({ limit: n }),
  startAfter: (snap)            => ({ startAfter: snap }),
}));

// ── Mock del singleton db ─────────────────────────────────────
vi.mock("../../services/firebase", () => ({ db: {} }));

// ── Mock del errorHandler (lo testeamos aparte) ──────────────
vi.mock("../../utils/errorHandler", () => ({
  traducirError: vi.fn((_err, ctx) => `Error simulado (${ctx})`),
  logError:      vi.fn(),
}));

// ── Reset entre tests ─────────────────────────────────────────
// Importa resetAllMocks en tu beforeEach para limpiar llamadas:
//   import { resetAllMocks } from "../__mocks__/firebase";
export const resetAllMocks = () => {
  [
    mockGetDoc, mockSetDoc, mockUpdateDoc, mockDeleteDoc,
    mockAddDoc, mockGetDocs, mockWriteBatch,
    mockBatchSet, mockBatchUpdate, mockBatchCommit,
  ].forEach((fn) => fn.mockReset());

  // Comportamiento por defecto: writeBatch devuelve el fakeBatch
  mockWriteBatch.mockReturnValue(fakeBatch);
  mockBatchCommit.mockResolvedValue(undefined);
};