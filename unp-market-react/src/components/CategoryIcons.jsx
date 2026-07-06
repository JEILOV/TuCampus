// src/components/CategoryIcons.jsx
// ────────────────────────────────────────────────────────────
//  Set de iconos de línea, dibujados a mano, para las
//  categorías del marketplace. Un solo estilo (stroke 1.7,
//  esquinas redondeadas) para que se vean como un set diseñado
//  a propósito y no emojis sueltos de distintas fuentes/SO.
// ────────────────────────────────────────────────────────────

const base = {
  width: 26,
  height: 26,
  viewBox: "0 0 24 24",
  fill: "none",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const IconTodos = ({ color = "currentColor" }) => (
  <svg {...base} stroke={color}>
    <path d="M12 3.5l1.8 4.4 4.7.5-3.6 3.1 1.1 4.6L12 13.7l-4 2.4 1.1-4.6-3.6-3.1 4.7-.5z" />
  </svg>
);

export const IconDulces = ({ color = "currentColor" }) => (
  <svg {...base} stroke={color}>
    {/* base del cupcake */}
    <path d="M6.5 12.5h11l-1.1 7a1.6 1.6 0 0 1-1.6 1.4H9.2a1.6 1.6 0 0 1-1.6-1.4z" />
    <path d="M6 12.5c0-2 1.6-2.9 2.7-3.6-.5-.7-.5-1.7.2-2.3.7-.6 1.6-.4 2.1.2.2-1 1-1.8 2-1.8s1.8.8 2 1.8c.5-.6 1.4-.8 2.1-.2.7.6.7 1.6.2 2.3 1.1.7 2.7 1.6 2.7 3.6z" />
    <circle cx="12" cy="4.6" r=".9" fill={color} stroke="none" />
  </svg>
);

export const IconSalados = ({ color = "currentColor" }) => (
  <svg {...base} stroke={color}>
    <path d="M4 10.5c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5" />
    <path d="M3.5 10.5h17" />
    <path d="M4.5 13.2h15" />
    <path d="M3.7 15.8h16.6a1.6 1.6 0 0 1-1.5 2.1H5.2a1.6 1.6 0 0 1-1.5-2.1z" />
  </svg>
);

export const IconBebidas = ({ color = "currentColor" }) => (
  <svg {...base} stroke={color}>
    <path d="M6.7 8.2h10.6l-1 10.4a1.7 1.7 0 0 1-1.7 1.5H9.4a1.7 1.7 0 0 1-1.7-1.5z" />
    <path d="M5.8 8.2h12.4" />
    <path d="M14.5 4.3l1.6-1.7" />
    <path d="M15.3 8v2.4" />
  </svg>
);

export const IconServicios = ({ color = "currentColor" }) => (
  <svg {...base} stroke={color}>
    <path d="M14.7 4.6a3.4 3.4 0 0 0-4.4 4.2L4 15.1v3h3l6.3-6.3a3.4 3.4 0 0 0 4.2-4.4l-2.5 2.5-2-2z" />
  </svg>
);

export const IconMateriales = ({ color = "currentColor" }) => (
  <svg {...base} stroke={color}>
    <path d="M12 6.2C10.6 5 8.6 4.4 6.3 4.6a1 1 0 0 0-.9 1v11.7c0 .6.5 1 1.1 1 2-.1 3.7.4 5 1.5" />
    <path d="M12 6.2c1.4-1.2 3.4-1.8 5.7-1.6a1 1 0 0 1 .9 1v11.7c0 .6-.5 1-1.1 1-2-.1-3.7.4-5 1.5" />
    <path d="M12 6.2V20" />
  </svg>
);

export const CATEGORY_ICON_MAP = {
  todos:      IconTodos,
  dulces:     IconDulces,
  salados:    IconSalados,
  bebidas:    IconBebidas,
  servicios:  IconServicios,
  materiales: IconMateriales,
};
