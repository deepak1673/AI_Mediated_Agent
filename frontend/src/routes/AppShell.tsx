import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth, useInvalidateAuth } from "../lib/auth";
import { api } from "../lib/api";

const WORKSPACE_LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/ask", label: "Ask Data" },
  { to: "/requests", label: "My Requests" },
  { to: "/insights", label: "Insights" },
];

const DATA_LINKS = [
  { to: "/apis", label: "APIs" },
  { to: "/catalog", label: "Data Catalog" },
];

const OPS_LINKS = [
  { to: "/approvals", label: "Approvals" },
  { to: "/audit", label: "Audit" },
];

function NavSection({ title, links }: { title: string; links: typeof WORKSPACE_LINKS }) {
  return (
    <div className="mb-6">
      <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</div>
      <nav className="flex flex-col gap-0.5">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={"end" in link ? link.end : false}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function AppShell() {
  const { user, isLoading } = useAuth();
  const invalidateAuth = useInvalidateAuth();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-sm text-neutral-500">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function handleLogout() {
    await api.post("/api/auth/logout");
    invalidateAuth();
  }

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-white px-3 py-4">
        <div className="px-3 mb-6 text-sm font-semibold tracking-tight">NovaMart</div>
        <NavSection title="Workspace" links={WORKSPACE_LINKS} />
        <NavSection title="Data & APIs" links={DATA_LINKS} />
        <NavSection title="Operations" links={OPS_LINKS} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6">
          <div className="text-sm text-neutral-500">Enterprise Data Operations</div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium leading-tight">{user.name}</div>
              <div className="text-xs text-neutral-500 leading-tight">
                {user.team} · {user.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
