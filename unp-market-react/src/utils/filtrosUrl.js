// src/utils/filtrosUrl.js
// ============================================================
//  TuCampus — Helpers puros para sincronizar filtros en la URL (FASE 7A)
// ============================================================

import { CATEGORIAS } from "../components/FeedFiltros";

export const MAX_LARGO_BUSQUEDA = 80;

const CATEGORIAS_VALIDAS_SET = new Set(CATEGORIAS.map((c) => c.key));

const aSearchParams = (entrada) => {
  if (!entrada) return new URLSearchParams();
  if (entrada instanceof URLSearchParams) return entrada;
  if (typeof entrada === "string") {
    const limpio = entrada.trim();
    if (!limpio || limpio === "/") return new URLSearchParams();
    const indicePregunta = limpio.indexOf("?");
    const queryStr =
      indicePregunta >= 0 ? limpio.slice(indicePregunta + 1) : limpio;
    return new URLSearchParams(queryStr);
  }
  if (typeof entrada.get === "function") {
    return entrada;
  }
  return new URLSearchParams();
};

/**
 * Extrae y normaliza `{ q, cat, tab }` desde `searchParams` (URLSearchParams o string).
 * - `q`: string recortado (máximo 80 caracteres).
 * - `cat`: una de las claves de `CATEGORIAS` de `FeedFiltros.jsx`, o `"todos"`.
 * - `tab`: `"inicio"` por defecto.
 *
 * @param {URLSearchParams|string|null|undefined} searchParams
 * @returns {{ q: string, cat: string, tab: string }}
 */
export const leerFiltrosDeUrl = (searchParams) => {
  const params = aSearchParams(searchParams);

  const rawQ = params.get("q");
  const q =
    typeof rawQ === "string"
      ? rawQ.trim().slice(0, MAX_LARGO_BUSQUEDA)
      : "";

  const rawCat = params.get("cat");
  const catLimpia = typeof rawCat === "string" ? rawCat.trim() : "";
  const cat = CATEGORIAS_VALIDAS_SET.has(catLimpia) ? catLimpia : "todos";

  const rawTab = params.get("tab");
  const tabLimpia = typeof rawTab === "string" ? rawTab.trim() : "";
  const tab = tabLimpia.length > 0 ? tabLimpia : "inicio";

  return { q, cat, tab };
};

/**
 * Construye una URL relativa tipo `"/?q=libros&cat=materiales"` omitiendo
 * los valores por defecto (`q` vacío, `cat === "todos"`, `tab === "inicio"`).
 *
 * @param {Object} [filtros]
 * @param {string} [filtros.q=""]
 * @param {string} [filtros.cat="todos"]
 * @param {string} [filtros.tab="inicio"]
 * @returns {string}
 */
export const construirUrlFiltros = ({
  q = "",
  cat = "todos",
  tab = "inicio",
} = {}) => {
  const params = new URLSearchParams();

  const qLimpia =
    typeof q === "string" ? q.trim().slice(0, MAX_LARGO_BUSQUEDA) : "";
  if (qLimpia.length > 0) {
    params.set("q", qLimpia);
  }

  const catLimpia = typeof cat === "string" ? cat.trim() : "todos";
  if (catLimpia !== "todos" && CATEGORIAS_VALIDAS_SET.has(catLimpia)) {
    params.set("cat", catLimpia);
  }

  const tabLimpia = typeof tab === "string" ? tab.trim() : "inicio";
  if (tabLimpia.length > 0 && tabLimpia !== "inicio") {
    params.set("tab", tabLimpia);
  }

  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
};
