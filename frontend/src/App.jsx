/**
 * Top-level router for CV Studio.
 *
 * Public: landing (`/`), login, register, and the A4 editor at `/pdfcanvas`.
 * `/pdfcanvas` works without a JWT (guest mode) — PdfCanvas itself branches
 * on `localStorage.token` presence for anything that needs the backend.
 */
import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import PdfCanvas from './pages/PdfCanvas';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Hero from './pages/Hero/Hero';

const router = createBrowserRouter([
  { path: "/pdfcanvas", element: <PdfCanvas /> },
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
