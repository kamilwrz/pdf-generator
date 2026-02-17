import './App.css';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import PdfGenerator from './pages/PdfGenerator';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Hero from './pages/Hero/Hero';

const router = createBrowserRouter([
  { path: "/pdfgenerator", element: <PdfGenerator /> },
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
