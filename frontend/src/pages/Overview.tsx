import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { SeverityBadge } from "./Insights";

interface Overview {
  me: { totalRequests: number; completed: number; waitingApproval: number; readyToResume: { id: string; requestText: string }[] };
  pendingApprovals: number | null;
  apis: { total: number; byStatus: Record<string, number> };
  latestReport: { id: string; summary: string; severity: string; generatedAt: string; status: string } | null;
  recentActivity: { id: string; action: string; resource: string | null; decision: string | null; at: string; actor: string | null }[];
}

const ACTION_LABEL: Record<string, string> = {
  ASK_RECEIVED: "asked",
  API_REGISTERED: "generated an API",
  HITL_CREATED: "needs approval for",
  HITL_APPROVE: "approved",
  HITL_REJECT: "rejected",
  ETL_COMPLETED: "loaded data into",
  ETL_FAILED: "ETL failed for",
  LIFECYCLE_REPORT_CREATED: "created a lifecycle report",
  API_STATUS_CHANGED: "changed status of",
};

function Tile({ label, value, to, tone }: { label: string; value: string | number; to?: string; tone?: "warn" }) {
  const body = (
    <div className={`rounded-md border p-4 ${tone === "warn" && Number(value) > 0 ? "border-amber-300 bg-amber-50" : "border-neutral-200"}`}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body;
}

const short = (s: string | null) => (s ? (s.length > 70 ? `${s.slice(0, 70)}…` : s) : "");

export function OverviewPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<Overview>("/api/overview"),
    refetchInterval: 15000,
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-neutral-900">Good to see you, {user?.name.split(" ")[0]}</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">Your activity, what needs attention, and the health of the platform.</p>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="My requests" value={data.me.totalRequests} to="/requests" />
            <Tile label="Waiting for approval" value={data.me.waitingApproval} to="/requests" tone="warn" />
            {data.pendingApprovals !== null ? (
              <Tile label="Approvals to review" value={data.pendingApprovals} to="/approvals" tone="warn" />
            ) : (
              <Tile label="Answered" value={data.me.completed} to="/requests" />
            )}
            <Tile label="APIs in registry" value={data.apis.total} to="/apis" />
          </div>

          {data.me.readyToResume.length > 0 && (
            <section className="mt-6 rounded-md border border-green-200 bg-green-50 p-4">
              <h2 className="text-sm font-semibold text-green-900">Approved — ready to resume</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {data.me.readyToResume.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <span className="text-green-950">{r.requestText}</span>
                    <Link to={`/ask?q=${encodeURIComponent(r.requestText)}`} className="shrink-0 rounded-md bg-green-800 px-2.5 py-1 text-xs font-medium text-white">
                      Resume
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-md border border-neutral-200 p-4">
              <h2 className="mb-2 text-sm font-semibold text-neutral-900">API health</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.apis.byStatus).map(([status, n]) => (
                  <span key={status} className="flex items-center gap-1.5 text-sm text-neutral-700">
                    <StatusBadge value={status} /> {n}
                  </span>
                ))}
              </div>
              {data.latestReport ? (
                <div className="mt-4 border-t border-neutral-100 pt-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    Latest lifecycle report · {new Date(data.latestReport.generatedAt).toLocaleDateString()} <SeverityBadge value={data.latestReport.severity} />
                  </div>
                  <p className="mt-1 text-sm text-neutral-700">{data.latestReport.summary}</p>
                  <Link to={`/insights/${data.latestReport.id}`} className="mt-2 inline-block text-xs font-medium text-neutral-900 underline">
                    View report
                  </Link>
                </div>
              ) : (
                <p className="mt-4 border-t border-neutral-100 pt-3 text-sm text-neutral-400">
                  No lifecycle report yet. <Link to="/insights" className="underline">Open Insights</Link> to run one.
                </p>
              )}
            </section>

            <section className="rounded-md border border-neutral-200 p-4">
              <h2 className="mb-2 text-sm font-semibold text-neutral-900">Recent activity</h2>
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-neutral-400">Nothing yet. Try Ask Data.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.recentActivity.map((e) => (
                    <li key={e.id} className="text-neutral-700">
                      <span className="font-medium text-neutral-900">{e.actor ?? "System"}</span> {ACTION_LABEL[e.action] ?? e.action.toLowerCase()}{" "}
                      <span className="text-neutral-500">{short(e.resource)}</span>
                      <span className="ml-1 text-xs text-neutral-400">{new Date(e.at).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-6">
            <Link to="/ask" className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              Ask Data
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
