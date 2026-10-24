import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth-context";
import { Layout } from "./components/Layout";
import { LoadingBlock } from "./components/States";
import { LandingPage } from "./pages/LandingPage";
import { SignupPage } from "./pages/SignupPage";
import { LoginPage } from "./pages/LoginPage";
import { CandidateDashboard } from "./pages/candidate/CandidateDashboard";
import { ProfilePage } from "./pages/candidate/ProfilePage";
import { DocumentsPage } from "./pages/candidate/DocumentsPage";
import { ConsentPage } from "./pages/candidate/ConsentPage";
import { SubmitPage } from "./pages/candidate/SubmitPage";
import { ClarificationsPage } from "./pages/candidate/ClarificationsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { OpsDashboard } from "./pages/ops/OpsDashboard";
import { CaseDetailPage } from "./pages/ops/CaseDetailPage";
import { ReportPage } from "./pages/ops/ReportPage";
import { VerificationPage } from "./pages/ops/VerificationPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminConfigPage } from "./pages/admin/AdminConfigPage";
import { AdminPackagesPage } from "./pages/admin/AdminPackagesPage";
import { UserDetailPage } from "./pages/admin/UserDetailPage";

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50">
      <LoadingBlock label="Loading CheckIQ" />
    </div>
  );
}

function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { status, user } = useAuth();
  if (status === "loading") return <FullPageSpinner />;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  if (roles && user && !user.roles.some((role) => roles.includes(role))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function RequireAnonymous({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <FullPageSpinner />;
  if (status === "authenticated") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * The candidate-only routes. Staff who open one are sent to the operations
 * queue, which is the only case list they may open. The server enforces the
 * same boundary — this only avoids showing an empty page.
 */
function RequireCandidate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "loading") return <FullPageSpinner />;
  if (status === "anonymous") return <Navigate to="/login" replace />;
  if (user && user.roles.some((role) => role !== "CANDIDATE")) {
    return <Navigate to="/ops" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAnonymous>
            <LandingPage />
          </RequireAnonymous>
        }
      />
      <Route
        path="/signup"
        element={
          <RequireAnonymous>
            <SignupPage />
          </RequireAnonymous>
        }
      />
      <Route
        path="/login"
        element={
          <RequireAnonymous>
            <LoginPage />
          </RequireAnonymous>
        }
      />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route
          path="/dashboard"
          element={
            <RequireCandidate>
              <CandidateDashboard />
            </RequireCandidate>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireCandidate>
              <ProfilePage />
            </RequireCandidate>
          }
        />
        <Route
          path="/documents"
          element={
            <RequireCandidate>
              <DocumentsPage />
            </RequireCandidate>
          }
        />
        <Route
          path="/consent"
          element={
            <RequireCandidate>
              <ConsentPage />
            </RequireCandidate>
          }
        />
        <Route
          path="/submit"
          element={
            <RequireCandidate>
              <SubmitPage />
            </RequireCandidate>
          }
        />
        <Route
          path="/clarifications"
          element={
            <RequireCandidate>
              <ClarificationsPage />
            </RequireCandidate>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />

        <Route
          path="/ops"
          element={
            <RequireAuth roles={["BGV_EXECUTIVE", "BGV_REVIEWER", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
              <OpsDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/ops/cases/:caseId"
          element={
            <RequireAuth roles={["BGV_EXECUTIVE", "BGV_REVIEWER", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
              <CaseDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ops/cases/:caseId/verification"
          element={
            <RequireAuth roles={["BGV_EXECUTIVE", "BGV_REVIEWER", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
              <VerificationPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ops/cases/:caseId/report"
          element={
            <RequireAuth roles={["BGV_EXECUTIVE", "BGV_REVIEWER", "HR_RECRUITMENT", "ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
              <ReportPage />
            </RequireAuth>
          }
        />

         <Route
           path="/admin/users"
           element={
             <RequireAuth roles={["ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
               <AdminUsersPage />
             </RequireAuth>
           }
         />
         <Route
           path="/admin/users/:id"
           element={
             <RequireAuth roles={["ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
               <UserDetailPage />
             </RequireAuth>
           }
         />
        <Route
          path="/admin/config"
          element={
            <RequireAuth roles={["ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
              <AdminConfigPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/packages"
          element={
            <RequireAuth roles={["ADMINISTRATOR", "SUPER_ADMINISTRATOR"]}>
              <AdminPackagesPage />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
