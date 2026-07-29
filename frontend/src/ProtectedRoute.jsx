/**
 * Gate authenticated editor routes behind a localStorage JWT.
 *
 * Missing token redirects to `/login` and preserves `location` so post-login
 * navigation can return the user to the page they attempted to open.
 */
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
