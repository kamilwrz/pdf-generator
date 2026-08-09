/**
 * Top-level router for CV Studio.
 *
 * Public: landing (`/`), login, register, and the A4 editor at
 * `/cvstudio/:workspace`. Guests use `/cvstudio/guest`; authenticated users
 * use `/cvstudio/{username}`. PdfCanvas branches on `localStorage.token` for
 * anything that needs the backend. Legacy `/pdfcanvas` URLs redirect into the
 * personalised path so old bookmarks keep working.
 */
import './App.css';
import { createBrowserRouter, Navigate, RouterProvider, useSearchParams } from 'react-router-dom';
import PdfCanvas from './pages/PdfCanvas';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Hero from './pages/Hero/Hero';
import { getEditorPath } from './utils/authSession';

/**
 * Preserve `?start=...` when rewriting deprecated `/pdfcanvas` bookmarks.
 */
function PdfCanvasLegacyRedirect() {
  const [searchParams] = useSearchParams();
  const start = searchParams.get("start");
  return <Navigate to={getEditorPath({ start })} replace />;
}

const router = createBrowserRouter([
  { path: "/cvstudio/:workspace", element: <PdfCanvas /> },
  { path: "/pdfcanvas", element: <PdfCanvasLegacyRedirect /> },
  { path: "/register", element: <Register /> },
  { path: "/login", element: <Login /> },
  { path: "/", element: <Hero /> },
])

function App() {
  return (
    <RouterProvider router={router} />
  )
}

export default App
