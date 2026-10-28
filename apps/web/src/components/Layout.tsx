import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, FileCheck2, LayoutDashboard, LogOut, Lock, Menu, ShieldCheck, Users, Settings, X } from "lucide-react";
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

type NavItem = { to: string; label: string; icon: typeof Users };

/* Sidebar link: active item becomes a blue-to-violet pill, like the primary button */
function SidebarLink({ link, onNavigate }: { link: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={link.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          isActive
            ? "bg-gradient-to-r from-blue-600 to-violet-500 text-white shadow-md shadow-blue-500/30"
            : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <link.icon
            className={`h-[18px] w-[18px] shrink-0 transition-colors ${
              isActive ? "text-white" : "text-slate-400 group-hover:text-blue-600"
            }`}
            aria-hidden="true"
          />
          <span className="truncate">{link.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

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

  /* mobile drawer: close on route change and on Escape */
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const initial = (user?.fullName ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 text-slate-900">
      {/* Mobile overlay */}
      <div
        aria-hidden="true"
        onClick={closeMenu}
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity lg:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sidebar (fixed on desktop, drawer on mobile) */}
      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 transition-[transform,visibility] duration-300 ease-out lg:visible lg:translate-x-0 lg:shadow-none ${
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 text-lg font-extrabold text-white shadow-lg shadow-blue-500/30">
              C
            </span>
            <div className="leading-tight">
              <p className="text-lg font-extrabold tracking-tight text-slate-900">CheckIQ</p>
              <p className="text-xs text-slate-500">{isStaff ? "Operations console" : "Candidate portal"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeMenu}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-xs font-semibold text-slate-400">
            {isStaff ? "Workspace" : "Your application"}
          </p>
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.to}>
                <SidebarLink link={link} onNavigate={closeMenu} />
              </li>
            ))}
          </ul>

          <p className="mt-8 px-3 pb-2 text-xs font-semibold text-slate-400">Account</p>
          <ul className="space-y-1">
            {accountLinks.map((link) => (
              <li key={link.to}>
                <SidebarLink link={link} onNavigate={closeMenu} />
              </li>
            ))}
          </ul>
        </nav>

        {/* User card */}
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 p-3 ring-1 ring-inset ring-blue-100">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-500 text-sm font-bold text-white shadow-sm ring-2 ring-white"
              aria-hidden="true"
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-500">
                {user?.candidateId ? `Candidate ID ${user.candidateId}` : user?.email}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200 transition hover:text-blue-700 hover:ring-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden"
              aria-label="Open menu"
              aria-controls="app-sidebar"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-500 text-sm font-extrabold text-white">
                C
              </span>
              <span className="text-base font-extrabold tracking-tight text-slate-900">CheckIQ</span>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-900">{user?.fullName}</p>
                <p className="text-xs text-slate-500">
                  {user?.candidateId ? `Candidate ID ${user.candidateId}` : user?.email}
                </p>
              </div>
              <NavLink
                to="/notifications"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 transition hover:text-blue-700 hover:ring-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={`Notifications${unread.data?.unread ? ` (${unread.data.unread} unread)` : ""}`}
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unread.data?.unread ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unread.data.unread > 9 ? "9+" : unread.data.unread}
                  </span>
                ) : null}
              </NavLink>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <Outlet />
        </main>

        <Footer />
      </div>
    </div>
  );
}