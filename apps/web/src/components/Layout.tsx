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

/* shared nav pill styling (visual only) */
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    isActive
      ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-md shadow-indigo-500/30"
      : "text-ink-600 hover:bg-indigo-50 hover:text-indigo-700"
  }`;

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
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50">
      <header className="sticky top-0 z-40 border-b border-indigo-100 bg-white/85 shadow-sm shadow-indigo-100/60 backdrop-blur-md">
        <div className="h-1 bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500" aria-hidden="true" />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/30">
              C
            </span>
            <span className="bg-gradient-to-r from-indigo-700 to-fuchsia-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
              CheckIQ
            </span>
          </div>

          <nav
            aria-label="Main"
            className="order-3 -mx-4 w-[calc(100%+2rem)] px-4 sm:order-2 sm:mx-0 sm:w-auto sm:px-0"
          >
            <ul className="flex items-center gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
              {links.map((link) => (
                <li key={link.to} className="shrink-0">
                  <NavLink to={link.to} className={navLinkClass}>
                    <link.icon className="h-4 w-4" aria-hidden="true" />
                    {link.label}
                  </NavLink>
                </li>
              ))}
              {accountLinks.map((link) => (
                <li key={link.to} className="shrink-0">
                  <NavLink to={link.to} className={navLinkClass}>
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
              className="relative rounded-xl p-2.5 text-indigo-600 ring-1 ring-inset ring-indigo-100 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label={`Notifications${unread.data?.unread ? ` (${unread.data.unread} unread)` : ""}`}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unread.data?.unread ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white">
                  {unread.data.unread > 9 ? "9+" : unread.data.unread}
                </span>
              ) : null}
            </NavLink>

            <div className="hidden items-center gap-3 sm:flex">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-orange-300 to-fuchsia-400 text-sm font-bold text-white shadow-md ring-2 ring-white"
                aria-hidden="true"
              >
                {(user?.fullName ?? "?").trim().charAt(0).toUpperCase()}
              </span>
              <div className="text-right">
                <p className="text-sm font-semibold text-ink-900">{user?.fullName}</p>
                <p className="text-xs text-ink-500">
                  {user?.candidateId ? `Candidate ID ${user.candidateId}` : user?.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}