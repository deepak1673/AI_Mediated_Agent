import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  resource: string | null;
  decision: string | null;
  createdAt: string;
}

export function AuditPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await api.get<{ logs: AuditLogRow[] }>("/api/audit")).logs,
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Audit</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">Every governance decision, invocation, and HITL action is traceable here.</p>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.length === 0 && <EmptyState label="No audit events yet." />}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-2 font-medium">Timestamp</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Resource</th>
                <th className="px-4 py-2 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.map((log) => (
                <tr key={log.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2.5 text-neutral-500">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-neutral-700">{log.action}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{log.resource ?? "—"}</td>
                  <td className="px-4 py-2.5">{log.decision && <StatusBadge value={log.decision} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
