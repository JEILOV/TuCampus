// src/components/CategoryIcons.jsx
// ────────────────────────────────────────────────────────────
//  Iconos de categorías con lucide-react (MIT, sin restricciones
//  de licencia). La animación (wiggle al hover, "pop" al activar)
//  vive en index.css, sobre la clase .chip-icon / .category-chip.
// ────────────────────────────────────────────────────────────
import { Sparkles, CakeSlice, Sandwich, CupSoda, Wrench, BookOpen, Package } from "lucide-react";

const props = { size: 26, strokeWidth: 2 };

export const IconTodos      = ({ color }) => <Sparkles  {...props} color={color} />;
export const IconDulces     = ({ color }) => <CakeSlice {...props} color={color} />;
export const IconSalados    = ({ color }) => <Sandwich  {...props} color={color} />;
export const IconBebidas    = ({ color }) => <CupSoda   {...props} color={color} />;
export const IconServicios  = ({ color }) => <Wrench    {...props} color={color} />;
export const IconMateriales = ({ color }) => <BookOpen  {...props} color={color} />;
export const IconPackage    = ({ color }) => <Package   {...props} color={color} />;

export const CATEGORY_ICON_MAP = {
  todos:      IconTodos,
  dulces:     IconDulces,
  salados:    IconSalados,
  bebidas:    IconBebidas,
  servicios:  IconServicios,
  materiales: IconMateriales,
};