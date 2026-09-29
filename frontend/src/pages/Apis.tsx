import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

interface ApiEntry {
  id: string;
  name: string;
  description: string;
  method: string;
  path: string;
  version: string;
  status: string;
  classification: string;
  ownerTeam: string;
  usageCount: number;
  lastUsedAt: string | null;
}

export function ApisPage() {
  const [q, setQ] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["apis", q],
    queryFn: async () => (await api.get<{ apis: ApiEntry[] }>(`/api/apis${q ? `?q=${encodeURIComponent(q)}` : ""}`)).apis,
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">APIs</h1>
          <p className="mt-1 text-sm text-neutral-500">The governed API Registry — always checked before new data discovery.</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search APIs…"
          className="w-64 rounded-md border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.length === 0 && <EmptyState label="No APIs match your search." />}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Classification</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Usage</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2.5">
                    <Link to={`/apis/${a.id}`} className="font-medium text-neutral-900 hover:underline">
                      {a.name}
                    </Link>
                    <div className="text-xs text-neutral-400">{a.path}</div>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.method}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.version}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge value={a.classification} />
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.ownerTeam}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.usageCount}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge value={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
