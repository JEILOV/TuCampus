import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home           from "./pages/Home";
import Publicar       from "./pages/Publicar";
import Login          from "./pages/Login";
import Perfil         from "./pages/Perfil";
import Producto       from "./pages/Producto";
import Vendedor       from "./pages/Vendedor";
import EditarProducto from "./pages/EditarProducto";
import RutaProtegida  from "./components/RutaProtegida";

const App = () => (
  <BrowserRouter>
    <Routes>
      {/* Rutas Públicas */}
      <Route path="/"          element={<Home />} />
      <Route path="/login"     element={<Login />} />
      <Route path="/producto"  element={<Producto />} />
      <Route path="/vendedor"  element={<Vendedor />} />

      {/* Rutas Protegidas */}
      <Route path="/perfil"   element={<RutaProtegida><Perfil /></RutaProtegida>} />
      <Route path="/publicar" element={<RutaProtegida><Publicar /></RutaProtegida>} />
      <Route path="/editar"   element={<RutaProtegida><EditarProducto /></RutaProtegida>} />

      {/* Ruta Comodín (404) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;