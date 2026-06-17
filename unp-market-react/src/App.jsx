// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home           from "./pages/Home";
import Publicar       from "./pages/Publicar";
import Login          from "./pages/Login";
import Perfil         from "./pages/Perfil";
import Producto       from "./pages/Producto";
import Vendedor       from "./pages/Vendedor";
import EditarProducto from "./pages/EditarProducto"; // <-- Importamos el nuevo componente

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/"          element={<Home />} />
      <Route path="/publicar"  element={<Publicar />} />
      <Route path="/login"     element={<Login />} />
      <Route path="/perfil"    element={<Perfil />} />
      <Route path="/producto"  element={<Producto />} />
      <Route path="/vendedor"  element={<Vendedor />} />
      <Route path="/editar"    element={<EditarProducto />} /> {/* <-- Añadimos la ruta */}
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;