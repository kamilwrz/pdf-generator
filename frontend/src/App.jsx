import { ensureWorkspaceMessages } from './i18n/index.js';
import { t as uiText } from "./i18n/index.js";
import { useTranslation } from 'react-i18next';
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

// Load copy before evaluating modules with presentation registries.
const workspacePage = (load) => lazy(async () => { await ensureWorkspaceMessages(); return load(); });

const PdfCanvas = workspacePage(() => import('./pages/PdfCanvas'));
const Login = workspacePage(() => import('./pages/Login/Login'));
const Register = workspacePage(() => import('./pages/Register/Register'));
const Hero = lazy(() => import('./pages/Hero/Hero'));
const DocumentsPage = workspacePage(() => import('./pages/Site/DocumentsPage'));
const AccountPage = workspacePage(() => import('./pages/Site/AccountPage'));
const CareerProfilePage = workspacePage(() => import('./pages/Site/CareerProfilePage'));
const InterviewPage = workspacePage(() => import('./pages/Site/InterviewPage'));
const TemplatesPage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.TemplatesPage })));
const TemplatePage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.TemplatePage })));
const PricingPage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.PricingPage })));
const HelpPage = lazy(() => import('./pages/Site/PublicPages').then((module) => ({ default: module.HelpPage })));
const PrivacyPage = lazy(() => import('./pages/Site/PrivacyPage'));
const VerifyEmail = workspacePage(() => import('./pages/Auth/VerifyEmail'));
const CheckoutResult = workspacePage(() => import('./pages/Billing/CheckoutResult'));

/** Client gate preserves the target; API ownership checks remain authoritative. */
function RequireSession({ children }) {
  useTranslation();
  const location = useLocation();
  return getAccessToken() ? children : <Navigate to={`/login?${new URLSearchParams({ returnTo: location.pathname })}`} replace />;
}

/** The same boundary retains the canvas when its first save assigns an address. */
function EditorRoute() {
  useTranslation();
  const { documentId } = useParams();
  if (documentId && parseDocumentId(documentId) === null) return <NotFoundPage />;
  if (documentId && !getAccessToken()) return <Navigate to={`/login?${new URLSearchParams({ returnTo: `/app/documents/${documentId}` })}`} replace />;
  return <PdfCanvas />;
}

/** Named entry points retain the existing guest draft and account-gate workflow. */
function StartRoute({ start }) {
  useTranslation();
  const [params] = useSearchParams();
  return <Navigate to={getEditorPath({ start, template: params.get('template') })} replace />;
}

/**
 * Resolves the generic creation entry according to the visitor's context.
 *
 * Guests keep the shortest path into the free A4 setup. Authenticated users
 * enter the account creation hub, where manual setup, import and interview
 * remain equally discoverable. Template-specific links bypass the chooser,
 * including older `/app/new?template=...` addresses.
 */
function CreateCvRoute() {
  useTranslation();
  const [params] = useSearchParams();
  const template = params.get("template");
  const start = !getAccessToken() || template ? "new" : "choose";
  return <Navigate to={getEditorPath({ start, template })} replace />;
}

/**
 * Preserve setup intent and template selection in deprecated bookmarks.
 */
function PdfCanvasLegacyRedirect() {
  useTranslation();
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
  { path: "/app/career-profile", element: <RequireSession><CareerProfilePage /></RequireSession>, errorElement: <RouteErrorPage /> },
  { path: "/app/interview", element: <RequireSession><InterviewPage /></RequireSession>, errorElement: <RouteErrorPage /> },
  { path: "/app/interview/:sessionId", element: <RequireSession><InterviewPage /></RequireSession>, errorElement: <RouteErrorPage /> },
  { path: "/app/new", element: <CreateCvRoute />, errorElement: <RouteErrorPage /> },
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
  useTranslation();
  useEffect(() => {
    // Retire anonymous analytics created by older releases without touching the
    // guest CV or wizard draft the visitor still expects to resume.
    try { localStorage.removeItem('cvstudio.guest.events'); } catch { /* Browser storage may be unavailable. */ }
  }, []);
  return (
    <Suspense fallback={(
      <main className="route-loading" role="status" aria-live="polite">
        <span aria-hidden="true" />
        <strong>{uiText("editor:app.loadingView")}</strong>
      </main>
    )}>
      <RouterProvider router={router} />
    </Suspense>
  )
}

export default App
