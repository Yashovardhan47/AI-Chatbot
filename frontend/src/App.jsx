import { useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import useAuthStore from "./context/authStore";
import AppShell from "./components/AppShell";
import { loginDestination, safeDestination } from "./services/routing";
import { MotionProvider } from "./motion/MotionProvider";
import MotionDirector from "./motion/MotionDirector";

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
const MemoryPage     = lazy(() => import("./pages/MemoryPage"));
const KnowledgePage  = lazy(() => import("./pages/KnowledgePage"));
const ContinuityPage = lazy(() => import("./pages/ContinuityPage"));
const GraphPage      = lazy(() => import("./pages/GraphPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const SetupPage = lazy(() => import("./pages/SetupPage"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
const ConversationsPage = lazy(() => import("./pages/ConversationsPage"));
const TourPage = lazy(() => import("./pages/TourPage"));
const AuthSetupPage = lazy(() => import("./pages/AuthSetupPage"));
const ContextLabPage = lazy(() => import("./pages/ContextLabPage"));

// Instant, lightweight fallback — shown for the few ms a lazy chunk takes
// to load, so switching pages never *looks* frozen.
function RouteLoader() {
  return (
    <div className="ns-route-loader" role="status">
      <div className="ns-loader-ring" /><span>Opening NeuroSense…</span>
    </div>
  );
}

function PrivateRoute() {
  const { user, loading } = useAuthStore();
  const location = useLocation();
  if (loading) return <RouteLoader />;
  if (!user) return <Navigate to={loginDestination(location)} replace />;
  if (!user.preferences?.onboarding_completed && location.pathname !== "/setup")
    return <Navigate to={"/setup?next=" + encodeURIComponent(safeDestination(location.pathname + location.search))} replace />;
  return <AppShell><Outlet /></AppShell>;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuthStore();
  const location = useLocation();
  if (loading) return <RouteLoader />;
  return !user ? children : <Navigate to={safeDestination(new URLSearchParams(location.search).get("next"))} replace />;
}

export function AppRoutes() {
  return <><MotionDirector /><Suspense fallback={<RouteLoader />}><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/welcome" element={<Navigate to="/" replace />} />
    <Route path="/tour" element={<TourPage />} />
    <Route path="/auth-setup" element={<AuthSetupPage />} />
    <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
    <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
    <Route path="/verify-email/:token" element={<VerifyEmail />} />
    <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
    <Route path="/reset-password/:token" element={<GuestRoute><ResetPassword /></GuestRoute>} />
    <Route element={<PrivateRoute />}>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/home" element={<DashboardPage />} />
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route path="/chat" element={<ConversationsPage />} />
      <Route path="/chat/:id" element={<ChatPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDetail />} />
      <Route path="/agents" element={<AgentsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/security" element={<SecurityPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/memory" element={<MemoryPage />} />
      <Route path="/knowledge" element={<KnowledgePage />} />
      <Route path="/continuity" element={<ContinuityPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/memory-graph" element={<GraphPage />} />
      <Route path="/context-lab" element={<ContextLabPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></>;
}

export default function App() {
  const init = useAuthStore(s => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <MotionProvider><BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: "#1e1e2e", color: "#cdd6f4", border: "1px solid #313244", fontSize: "13px" },
          success: { iconTheme: { primary: "#1D9E75", secondary: "#fff" } },
          error:   { iconTheme: { primary: "#D85A30", secondary: "#fff" } },
        }}
      />
      <AppRoutes />
    </BrowserRouter></MotionProvider>
  );
}
