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
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useSearchParams } from 'react-router-dom';
import { getEditorPath } from './utils/authSession';
import { NotFoundPage, RouteErrorPage } from './components/common/ErrorBoundary/ErrorBoundary';

const PdfCanvas = lazy(() => import('./pages/PdfCanvas'));
const Login = lazy(() => import('./pages/Login/Login'));
const Register = lazy(() => import('./pages/Register/Register'));
const Hero = lazy(() => import('./pages/Hero/Hero'));

/**
 * Preserve `?start=...` when rewriting deprecated `/pdfcanvas` bookmarks.
 */
function PdfCanvasLegacyRedirect() {
  const [searchParams] = useSearchParams();
  const start = searchParams.get("start");
  return <Navigate to={getEditorPath({ start })} replace />;
}

const router = createBrowserRouter([
  { path: "/cvstudio/:workspace", element: <PdfCanvas />, errorElement: <RouteErrorPage /> },
  { path: "/pdfcanvas", element: <PdfCanvasLegacyRedirect />, errorElement: <RouteErrorPage /> },
  { path: "/register", element: <Register />, errorElement: <RouteErrorPage /> },
  { path: "/login", element: <Login />, errorElement: <RouteErrorPage /> },
  { path: "/", element: <Hero />, errorElement: <RouteErrorPage /> },
  { path: "*", element: <NotFoundPage />, errorElement: <RouteErrorPage /> },
])

function App() {
  return (
    <Suspense fallback={(
      <main className="route-loading" role="status" aria-live="polite">
        <span aria-hidden="true" />
        <strong>Ładowanie widoku</strong>
      </main>
    )}>
      <RouterProvider router={router} />
    </Suspense>
  )
}

export default App
