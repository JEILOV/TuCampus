import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home           from "./pages/Home";
import Login          from "./pages/Login";
import RutaProtegida  from "./components/RutaProtegida";
import NotificacionToast from "./components/NotificacionToast";
import InstalarPWABanner from "./components/InstalarPWABanner";
import Spinner        from "./components/Spinner";

// 🚀 Code splitting (rendimiento): Home y Login se importan de forma
// EAGER (arriba) a propósito — son las dos pantallas de entrada más
// probables (usuario logueado va directo a "/", usuario nuevo pasa por
// "/login"), así que no tiene sentido meterlas en un chunk separado
// que solo agregaría una espera extra justo en el primer render.
//
// El resto de páginas son React.lazy(): cada una se convierte en su
// propio chunk .js que Vite genera al hacer build, y el navegador solo
// lo descarga cuando el usuario efectivamente navega ahí. Esto reduce
// drásticamente el bundle inicial (menos JS que parsear/ejecutar antes
// de que Home sea interactivo), a costa de una pausa breve (cubierta
// por <Suspense>) la PRIMERA vez que se visita cada ruta secundaria.
const Publicar          = lazy(() => import("./pages/Publicar"));
const Perfil            = lazy(() => import("./pages/Perfil"));
const Producto          = lazy(() => import("./pages/Producto"));
const Vendedor          = lazy(() => import("./pages/Vendedor"));
const EditarProducto    = lazy(() => import("./pages/EditarProducto"));
const Chat              = lazy(() => import("./pages/Chat"));
const Notificaciones    = lazy(() => import("./pages/Notificaciones"));
const Terminos          = lazy(() => import("./pages/Terminos"));
const PanelAdminAnuncios = lazy(() => import("./pages/PanelAdminAnuncios"));

const App = () => (
  <BrowserRouter>
    {/* Toast de push en primer plano — fuera de <Routes> a propósito,
        así se mantiene montado (y puede seguir escuchando) sin
        importar por qué ruta esté navegando el usuario. */}
    <NotificacionToast />

    {/* Banner discreto de "Instalar TuCampus" — mismo patrón que
        NotificacionToast: fuera de <Routes> para que sobreviva a la
        navegación y aparezca en cualquier pantalla. Se autooculta si
        el navegador no soporta instalación (ej. iOS Safari) o si el
        usuario ya la descartó recientemente (ver el propio componente). */}
    <InstalarPWABanner />

    {/* Suspense ÚNICO envolviendo todas las rutas: mientras el chunk de
        la página lazy pedida termina de descargar, se muestra el mismo
        Spinner que ya usa RutaProtegida (así no hay dos pantallas de
        carga distintas compitiendo, una por code-splitting y otra por
        auth-guard). Home y Login nunca activan este fallback porque no
        son lazy. */}
    <Suspense fallback={<Spinner mensaje="Cargando..." />}>
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
    </Suspense>
  </BrowserRouter>
);

export default App;