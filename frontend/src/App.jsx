/**
 * Top-level router for CV Studio.
 *
 * Public: landing (`/`), login, register.
 * Protected: the A4 editor at `/pdfcanvas` (requires a JWT in localStorage).
 */
import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ProtectedRoute from "./ProtectedRoute";
import PdfCanvas from './pages/PdfCanvas';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Hero from './pages/Hero/Hero';

const router = createBrowserRouter([
  { path: "/pdfcanvas", element: <ProtectedRoute><PdfCanvas /></ProtectedRoute> },
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
