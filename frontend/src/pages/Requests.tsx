import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

interface Run {
  id: string;
  requestText: string;
  status: string;
  createdAt: string;
}

export function RequestsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => (await api.get<{ requests: Run[] }>("/api/requests")).requests,
  });
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">My Requests</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">Everything you have asked, and where it stands.</p>
      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.length === 0 && <EmptyState label="No requests yet. Try Ask Data." />}
      {data && data.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
          {data.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <Link to={`/requests/${r.id}`} className="text-neutral-800 underline-offset-2 hover:underline">{r.requestText}</Link>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-neutral-400">{new Date(r.createdAt).toLocaleString()}</span>
                <StatusBadge value={r.status} />
                {(r.status === "APPROVED" || r.status === "WAITING_HITL" || r.status === "ETL_RUNNING") && (
                  <Link
                    to={`/ask?q=${encodeURIComponent(r.requestText)}`}
                    className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    {r.status === "APPROVED" ? "Resume" : "Check again"}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
