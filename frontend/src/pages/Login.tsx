import { useQuery, useMutation } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth, useInvalidateAuth } from "../lib/auth";

interface DemoUser {
  id: string;
  name: string;
  email: string;
  team: string;
  role: string;
}

export function LoginPage() {
  const { user, isLoading: authLoading } = useAuth();
  const invalidateAuth = useInvalidateAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["demo-users"],
    queryFn: async () => (await api.get<{ users: DemoUser[] }>("/api/auth/demo-users")).users,
  });

  const login = useMutation({
    mutationFn: (userId: string) => api.post("/api/auth/login", { userId }),
    onSuccess: () => invalidateAuth(),
  });

  if (!authLoading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-1 text-center text-sm font-semibold tracking-tight text-neutral-900">NovaMart</div>
        <div className="mb-6 text-center text-lg font-semibold text-neutral-900">
          Enterprise Data Intelligence Platform
        </div>

        <div className="mb-4 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Secure enterprise login (demo identities)
        </div>

        <div className="flex flex-col gap-2">
          {isLoading && <div className="text-sm text-neutral-400">Loading demo users…</div>}
          {data?.map((u) => (
            <button
              key={u.id}
              disabled={login.isPending}
              onClick={() => login.mutate(u.id)}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50"
            >
              <span className="font-medium text-neutral-800">{u.name}</span>
              <span className="text-xs text-neutral-500">{u.role}</span>
            </button>
          ))}
        </div>

        {login.isError && (
          <div className="mt-4 text-xs text-red-600">Sign-in failed. Is the backend running?</div>
        )}
      </div>
    </div>
  );
}
