import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home           from "./pages/Home";
import Publicar       from "./pages/Publicar";
import Login          from "./pages/Login";
import Perfil         from "./pages/Perfil";
import Producto       from "./pages/Producto";
import Vendedor       from "./pages/Vendedor";
import EditarProducto from "./pages/EditarProducto";
import Chat           from "./pages/Chat";
import Notificaciones from "./pages/Notificaciones";
import Terminos       from "./pages/Terminos";
import PanelAdminAnuncios from "./pages/PanelAdminAnuncios";
import RutaProtegida  from "./components/RutaProtegida";
import NotificacionToast from "./components/NotificacionToast";

const App = () => (
  <BrowserRouter>
    {/* Toast de push en primer plano — fuera de <Routes> a propósito,
        así se mantiene montado (y puede seguir escuchando) sin
        importar por qué ruta esté navegando el usuario. */}
    <NotificacionToast />

    <Routes>
      {/* Rutas Públicas */}
      <Route path="/"          element={<Home />} />
      <Route path="/login"     element={<Login />} />
      <Route path="/producto"  element={<Producto />} />
      <Route path="/vendedor"  element={<Vendedor />} />
      <Route path="/terminos"  element={<Terminos />} />

      {/* Rutas Protegidas */}
      <Route path="/perfil"   element={<RutaProtegida><Perfil /></RutaProtegida>} />
      <Route path="/publicar" element={<RutaProtegida><Publicar /></RutaProtegida>} />
      <Route path="/editar"   element={<RutaProtegida><EditarProducto /></RutaProtegida>} />
      <Route path="/chat"     element={<RutaProtegida><Chat /></RutaProtegida>} />
      <Route path="/notificaciones" element={<RutaProtegida><Notificaciones /></RutaProtegida>} />
      <Route path="/admin/anuncios" element={<RutaProtegida><PanelAdminAnuncios /></RutaProtegida>} />

      {/* Ruta Comodín (404) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;