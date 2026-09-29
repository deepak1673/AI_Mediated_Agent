import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  team: string;
  role: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, isLoading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const res = await api.get<{ user: CurrentUser }>("/api/auth/me");
        return res.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });

  return <AuthContext.Provider value={{ user: data ?? null, isLoading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useInvalidateAuth() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["me"] });
}
