/**
 * Public information routes, authenticated library/account, and A4 editor.
 * Saved CVs use /app/documents/:documentId. Legacy workspace and /pdfcanvas
 * entry points retain start/template intent and the guest draft workflow.
 * Client route gates improve navigation; the API independently checks ownership.
 */
import './App.css';
import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { getAccessToken, getEditorPath } from './utils/authSession';
import { parseDocumentId } from './utils/siteRoutes';
import { NotFoundPage, RouteErrorPage } from './components/common/ErrorBoundary/ErrorBoundary';

const PdfCanvas = lazy(() => import('./pages/PdfCanvas'));
const Login = lazy(() => import('./pages/Login/Login'));
const Register = lazy(() => import('./pages/Register/Register'));
const Hero = lazy(() => import('./pages/Hero/Hero'));
const DocumentsPage = lazy(() => import('./pages/Site/DocumentsPage'));
const AccountPage = lazy(() => import('./pages/Site/AccountPage'));
const TemplatesPage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.TemplatesPage })));
const TemplatePage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.TemplatePage })));
const PricingPage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.PricingPage })));
const HelpPage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.HelpPage })));
const PrivacyPage = lazy(() => import('./pages/Site/PrivacyPage'));
const VerifyEmail = lazy(() => import('./pages/Auth/VerifyEmail'));
const CheckoutResult = lazy(() => import('./pages/Billing/CheckoutResult'));

/** Client gate preserves the target; API ownership checks remain authoritative. */
function RequireSession({ children }) {
  const location = useLocation();
  return getAccessToken() ? children : <Navigate to={`/login?${new URLSearchParams({ returnTo: location.pathname })}`} replace />;
}

/** The same boundary retains the canvas when its first save assigns an address. */
function EditorRoute() {
  const { documentId } = useParams();
  if (documentId && parseDocumentId(documentId) === null) return <NotFoundPage />;
  if (documentId && !getAccessToken()) return <Navigate to={`/login?${new URLSearchParams({ returnTo: `/app/documents/${documentId}` })}`} replace />;
  return <PdfCanvas />;
}

/** Named entry points retain the existing guest draft and account-gate workflow. */
function StartRoute({ start }) {
  const [params] = useSearchParams();
  return <Navigate to={getEditorPath({ start, template: params.get('template') })} replace />;
}

/**
 * Preserve setup intent and template selection in deprecated bookmarks.
 */
function PdfCanvasLegacyRedirect() {
  const [searchParams] = useSearchParams();
  const start = searchParams.get("start");
  return <Navigate to={getEditorPath({ start, template: searchParams.get("template") })} replace />;
}

const router = createBrowserRouter([
  { path: "/cvstudio/:workspace", element: <EditorRoute />, errorElement: <RouteErrorPage /> },
  { path: "/app", element: <Navigate to="/app/documents" replace />, errorElement: <RouteErrorPage /> },
  { path: "/app/documents", element: <RequireSession><DocumentsPage /></RequireSession>, errorElement: <RouteErrorPage /> },
  { path: "/app/documents/:documentId", element: <EditorRoute />, errorElement: <RouteErrorPage /> },
  { path: "/app/account", element: <RequireSession><AccountPage /></RequireSession>, errorElement: <RouteErrorPage /> },
  { path: "/app/new", element: <StartRoute start="new" />, errorElement: <RouteErrorPage /> },
  { path: "/app/import", element: <StartRoute start="import" />, errorElement: <RouteErrorPage /> },
  { path: "/templates", element: <TemplatesPage />, errorElement: <RouteErrorPage /> },
  { path: "/templates/:slug", element: <TemplatePage />, errorElement: <RouteErrorPage /> },
  { path: "/pricing", element: <PricingPage />, errorElement: <RouteErrorPage /> },
  { path: "/help", element: <HelpPage />, errorElement: <RouteErrorPage /> },
  { path: "/privacy", element: <PrivacyPage />, errorElement: <RouteErrorPage /> },
  { path: "/pdfcanvas", element: <PdfCanvasLegacyRedirect />, errorElement: <RouteErrorPage /> },
  { path: "/register", element: <Register />, errorElement: <RouteErrorPage /> },
  { path: "/login", element: <Login />, errorElement: <RouteErrorPage /> },
  { path: "/verify-email", element: <VerifyEmail />, errorElement: <RouteErrorPage /> },
  { path: "/billing/success", element: <RequireSession><CheckoutResult variant="success" /></RequireSession>, errorElement: <RouteErrorPage /> },
  { path: "/billing/cancel", element: <RequireSession><CheckoutResult variant="cancel" /></RequireSession>, errorElement: <RouteErrorPage /> },
  { path: "/", element: <Hero />, errorElement: <RouteErrorPage /> },
  { path: "*", element: <NotFoundPage />, errorElement: <RouteErrorPage /> },
])

function App() {
  useEffect(() => {
    // Retire anonymous analytics created by older releases without touching the
    // guest CV or wizard draft the visitor still expects to resume.
    localStorage.removeItem('cvstudio.guest.events');
  }, []);
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
