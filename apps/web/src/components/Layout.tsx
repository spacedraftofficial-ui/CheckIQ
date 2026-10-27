import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, FileCheck2, LayoutDashboard, LogOut, Lock, ShieldCheck, Users, Settings } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { request } from "../lib/api";
import { Footer } from "./Footer";

const candidateLinks = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/profile", label: "My profile", icon: Users },
  { to: "/documents", label: "Documents", icon: FileCheck2 },
  { to: "/consent", label: "Declaration", icon: ShieldCheck },
  { to: "/clarifications", label: "Clarifications", icon: ShieldCheck },
  { to: "/submit", label: "Submit", icon: FileCheck2 },
];

const staffLinks = [
  { to: "/ops", label: "Cases", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/packages", label: "Packages", icon: FileCheck2 },
  { to: "/admin/config", label: "Configuration", icon: Settings },
];

const accountLinks = [
  { to: "/change-password", label: "Change password", icon: Lock },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => request<{ unread: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
    enabled: Boolean(user),
  });

  const isStaff = Boolean(user?.roles.some((role) => role !== "CANDIDATE"));
  const links = isStaff ? staffLinks : candidateLinks;

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              C
            </span>
            <span className="text-base font-bold text-ink-900">CheckIQ</span>
          </div>

          <nav aria-label="Main" className="order-3 w-full sm:order-2 sm:w-auto">
            <ul className="flex flex-wrap items-center gap-1">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                      }`
                    }
                  >
                    <link.icon className="h-4 w-4" aria-hidden="true" />
                    {link.label}
                  </NavLink>
                </li>
              ))}
              {accountLinks.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                      }`
                    }
                  >
                    <link.icon className="h-4 w-4" aria-hidden="true" />
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
            <NavLink
              to="/notifications"
              className="relative rounded-lg p-2 text-ink-600 hover:bg-ink-100"
              aria-label={`Notifications${unread.data?.unread ? ` (${unread.data.unread} unread)` : ""}`}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unread.data?.unread ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread.data.unread > 9 ? "9+" : unread.data.unread}
                </span>
              ) : null}
            </NavLink>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-ink-900">{user?.fullName}</p>
              <p className="text-xs text-ink-500">
                {user?.candidateId ? `Candidate ID ${user.candidateId}` : user?.email}
              </p>
            </div>

            <button type="button" className="btn-ghost" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
