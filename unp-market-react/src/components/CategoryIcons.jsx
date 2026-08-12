// src/components/CategoryIcons.jsx
// ────────────────────────────────────────────────────────────
//  Iconos de categorías con lucide-react (MIT, sin restricciones
//  de licencia). La animación (wiggle al hover, "pop" al activar)
//  vive en index.css, sobre la clase .chip-icon / .category-chip.
//
//  🔧 Fase "Categorías ampliadas": el set pasó de 6 opciones
//  granulares (dulces/salados/bebidas/...) a 6 más amplias y
//  equilibradas (comida/tecnologia/ropa/materiales/servicios/
//  otros). Ver CATEGORIAS en Home.jsx y CATEGORIAS_VALIDAS en
//  services/productService.js — deben coincidir exactamente.
// ────────────────────────────────────────────────────────────
import { Sparkles, Sandwich, Headphones, Shirt, BookOpen, Wrench, Package } from "lucide-react";

const props = { size: 26, strokeWidth: 2 };

export const IconTodos      = ({ color }) => <Sparkles   {...props} color={color} />;
export const IconComida     = ({ color }) => <Sandwich   {...props} color={color} />;
export const IconTecnologia = ({ color }) => <Headphones {...props} color={color} />;
export const IconRopa       = ({ color }) => <Shirt      {...props} color={color} />;
export const IconMateriales = ({ color }) => <BookOpen   {...props} color={color} />;
export const IconServicios  = ({ color }) => <Wrench     {...props} color={color} />;
export const IconOtros      = ({ color }) => <Package    {...props} color={color} />;
export const IconPackage    = ({ color }) => <Package    {...props} color={color} />; // fallback genérico

export const CATEGORY_ICON_MAP = {
  todos:      IconTodos,
  comida:     IconComida,
  tecnologia: IconTecnologia,
  ropa:       IconRopa,
  materiales: IconMateriales,
  servicios:  IconServicios,
  otros:      IconOtros,
};