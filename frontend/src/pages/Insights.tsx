import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

export interface ReportRow {
  id: string;
  reportType: string;
  generatedAt: string;
  agent: string;
  summary: string;
  severity: string;
  status: string;
  findings: {
    counts: Record<string, number>;
    priority: { apiName: string; reason: string } | null;
    items: unknown[];
    periodDays: number;
  };
}

interface Usage {
  totalRequests: number;
  perDay: { date: string; count: number }[];
  byStatus: Record<string, number>;
  topApis: { id: string; name: string; usageCount: number; classification: string }[];
  generatedApis: number;
}

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-neutral-100 text-neutral-600 border-neutral-200",
  none: "bg-green-50 text-green-700 border-green-200",
};

export function SeverityBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[value] ?? SEVERITY_STYLE.low}`}>
      {value === "none" ? "healthy" : value}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function VolumeChart({ data }: { data: Usage["perDay"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex h-28 items-end gap-1" role="img" aria-label="Requests per day, last 14 days">
        {data.map((d) => (
          <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.count}`}>
            <div className="w-full rounded-t bg-neutral-800" style={{ height: `${Math.max(2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.15 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export function InsightsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canRun = user?.role === "DWH_ADMIN" || user?.role === "DATA_ENGINEER";

  const usage = useQuery({ queryKey: ["usage"], queryFn: () => api.get<Usage>("/api/analytics/usage") });
  const reports = useQuery({ queryKey: ["reports"], queryFn: async () => (await api.get<{ reports: ReportRow[] }>("/api/reports")).reports });
  const run = useMutation({
    mutationFn: () => api.post("/api/reports/lifecycle/run"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["apis"] });
    },
  });

  const latest = reports.data?.[0];
  const previous = reports.data?.slice(1) ?? [];
  const findingCount = latest ? Object.values(latest.findings.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-neutral-900">Insights</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">How the platform is being used, and what the lifecycle agent found.</p>

      <h2 className="mb-2 text-sm font-semibold text-neutral-900">User analytics</h2>
      {usage.isLoading && <LoadingState />}
      {usage.isError && <ErrorState />}
      {usage.data && (
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="grid grid-cols-3 gap-3 md:col-span-3">
            <Kpi label="Requests (14 days)" value={usage.data.totalRequests} />
            <Kpi label="APIs generated" value={usage.data.generatedApis} />
            <Kpi label="Awaiting approval" value={usage.data.byStatus.WAITING_HITL ?? 0} />
          </div>
          <div className="rounded-md border border-neutral-200 p-4 md:col-span-2">
            <div className="mb-2 text-xs font-medium text-neutral-500">Request volume</div>
            <VolumeChart data={usage.data.perDay} />
          </div>
          <div className="rounded-md border border-neutral-200 p-4">
            <div className="mb-2 text-xs font-medium text-neutral-500">Most used APIs</div>
            {usage.data.topApis.length === 0 ? (
              <p className="text-sm text-neutral-400">No API calls yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {usage.data.topApis.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <Link to={`/apis/${a.id}`} className="truncate text-neutral-800 underline-offset-2 hover:underline">{a.name}</Link>
                    <span className="text-neutral-500">{a.usageCount}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Agent reports</h2>
        {canRun && (
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            {run.isPending ? "Analyzing…" : "Run lifecycle analysis"}
          </button>
        )}
      </div>
      {run.isError && <p className="mb-2 text-sm text-red-700">The analysis could not be run.</p>}
      {reports.isLoading && <LoadingState />}
      {reports.isError && <ErrorState />}
      {reports.data && reports.data.length === 0 && (
        <EmptyState label={canRun ? "No reports yet. Run the lifecycle analysis to generate the first one." : "No reports yet. An administrator can run the lifecycle analysis."} />
      )}

      {latest && (
        <div className="rounded-md border border-neutral-200 p-4">
          <div className="text-xs text-neutral-400">Latest analysis · {new Date(latest.generatedAt).toLocaleString()}</div>
          <div className="mt-1 flex items-center gap-2">
            <h3 className="text-base font-semibold text-neutral-900">{latest.reportType}</h3>
            <SeverityBadge value={latest.severity} />
            <StatusBadge value={latest.status} />
          </div>
          <p className="mt-2 text-sm text-neutral-600">{latest.summary}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-neutral-500">
            <span>{findingCount} finding(s)</span>
            {Object.entries(latest.findings.counts).map(([k, v]) => (
              <span key={k}>{v} {k.toLowerCase()}</span>
            ))}
          </div>
          {latest.findings.priority && (
            <p className="mt-2 text-sm text-neutral-700">
              <span className="font-medium">Priority attention:</span> {latest.findings.priority.apiName}
              <span className="text-neutral-500"> — {latest.findings.priority.reason}</span>
            </p>
          )}
          <Link to={`/insights/${latest.id}`} className="mt-3 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
            View report
          </Link>
        </div>
      )}

      {previous.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-neutral-500">Previous reports</div>
          <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
            {previous.map((r) => (
              <li key={r.id}>
                <Link to={`/insights/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-neutral-50">
                  <span className="text-neutral-800">{r.reportType} <span className="text-neutral-400">· {new Date(r.generatedAt).toLocaleDateString()}</span></span>
                  <span className="flex items-center gap-2"><SeverityBadge value={r.severity} /><StatusBadge value={r.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
