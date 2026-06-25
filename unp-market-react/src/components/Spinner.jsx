// src/components/Spinner.jsx
// ============================================================
//  UNP Market — Pantalla de carga unificada
//
//  REEMPLAZA 5 pantallas de carga distintas encontradas en:
//    • RutaProtegida.jsx  → "Verificando acceso..."
//    • Perfil.jsx         → "Cargando perfil..."
//    • Vendedor.jsx       → "Cargando perfil del vendedor..."
//    • Producto.jsx       → "Cargando producto..."
//    • EditarProducto.jsx → "Cargando producto..." (distinto wrapper)
//
//  USO:
//    if (cargando) return <Spinner mensaje="Cargando perfil..." />;
//
//  Con wrapper de página completa (default):
//    <Spinner mensaje="Cargando..." />
//
//  Inline (dentro de un contenedor que ya tiene height):
//    <Spinner mensaje="Cargando..." fullScreen={false} />
// ============================================================

const Spinner = ({ mensaje = "Cargando...", fullScreen = true }) => (
  <div style={{
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    gap:            "16px",
    ...(fullScreen
      ? { height: "100vh", background: "var(--bg-crema)" }
      : { padding: "40px 0" }
    ),
  }}>
    {/* Anillo giratorio — usa los colores de la marca */}
    <div style={{
      width:        "40px",
      height:       "40px",
      borderRadius: "50%",
      border:       "3.5px solid #e8e8f0",
      borderTop:    "3.5px solid var(--verde-marca)",
      animation:    "unp-spin 0.75s linear infinite",
    }} />

    <p style={{
      fontFamily: "'Nunito', sans-serif",
      fontWeight: 700,
      fontSize:   "0.95rem",
      color:      "#5c5c7a",
      margin:     0,
    }}>
      {mensaje}
    </p>

    <style>{`
      @keyframes unp-spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

export default Spinner;