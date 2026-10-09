import { useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import useAuthStore from "./context/authStore";

// Eager: needed immediately on first load
import LandingPage from "./pages/LandingPage";
import LoginPage    from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Lazy: only fetched when the user actually navigates there —
// this keeps the initial bundle small and each route swaps in fast.
const VerifyEmail    = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword  = lazy(() => import("./pages/ResetPassword"));
const DashboardPage  = lazy(() => import("./pages/DashboardPage"));
const ChatPage       = lazy(() => import("./pages/ChatPage"));
const ProjectsPage   = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetail  = lazy(() => import("./pages/ProjectDetail"));
const AgentsPage     = lazy(() => import("./pages/AgentsPage"));
const SettingsPage   = lazy(() => import("./pages/SettingsPage"));
const ProfilePage    = lazy(() => import("./pages/ProfilePage"));

// Instant, lightweight fallback — shown for the few ms a lazy chunk takes
// to load, so switching pages never *looks* frozen.
function RouteLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <div className="h-6 w-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    </div>
  );
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) return <RouteLoader />;
  return user ? children : <Navigate to="/welcome" replace />;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) return <RouteLoader />;
  return !user ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const init = useAuthStore(s => s.init);
  useEffect(() => { init(); }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: "#1e1e2e", color: "#cdd6f4", border: "1px solid #313244", fontSize: "13px" },
          success: { iconTheme: { primary: "#1D9E75", secondary: "#fff" } },
          error:   { iconTheme: { primary: "#D85A30", secondary: "#fff" } },
        }}
      />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/"        element={<LandingPage />} />
          <Route path="/welcome" element={<LandingPage />} />

          <Route path="/login"                 element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register"              element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/verify-email/:token"   element={<VerifyEmail />} />
          <Route path="/forgot-password"       element={<GuestRoute><ForgotPassword /></GuestRoute>} />
          <Route path="/reset-password/:token" element={<GuestRoute><ResetPassword /></GuestRoute>} />

          <Route path="/dashboard"    element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/chat"         element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/chat/:id"     element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/projects"     element={<PrivateRoute><ProjectsPage /></PrivateRoute>} />
          <Route path="/projects/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />
          <Route path="/agents"       element={<PrivateRoute><AgentsPage /></PrivateRoute>} />
          <Route path="/settings"     element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          <Route path="/profile"      element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
