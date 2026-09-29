import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";
import { SeverityBadge } from "./Insights";

interface Item {
  apiId: string;
  apiName: string;
  apiPath: string;
  issueType: string;
  severity: string;
  evidence: string;
  explanation: string;
  suggestedAction: string;
  usageCount: number;
  lastUsedAt: string | null;
}

interface Report {
  id: string;
  reportType: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  agent: string;
  summary: string;
  severity: string;
  status: string;
  findings: { items: Item[]; counts: Record<string, number>; priority: { apiName: string; reason: string } | null; periodDays: number };
}

export function ReportDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canReview = user?.role === "DWH_ADMIN" || user?.role === "DATA_ENGINEER";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["report", id],
    queryFn: async () => (await api.get<{ report: Report }>(`/api/reports/${id}`)).report,
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/api/reports/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report", id] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState label="This report could not be loaded." />;
  const { items, priority } = data.findings;

  return (
    <div className="max-w-4xl">
      <Link to="/insights" className="text-sm text-neutral-500 hover:underline">← Insights</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-neutral-900">{data.reportType}</h1>
        <SeverityBadge value={data.severity} />
        <StatusBadge value={data.status} />
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        {data.agent} · generated {new Date(data.generatedAt).toLocaleString()} · analysis period {data.findings.periodDays} days
      </p>

      <section className="mt-5">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Summary</h2>
        <p className="text-sm text-neutral-700">{data.summary}</p>
        {priority && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-medium">Priority attention: {priority.apiName}.</span> {priority.reason}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Findings ({items.length})</h2>
        {items.length === 0 && <p className="text-sm text-neutral-500">Nothing needs attention.</p>}
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={`${f.apiId}-${f.issueType}`} className="rounded-md border border-neutral-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={f.issueType} />
                <SeverityBadge value={f.severity} />
                <Link to={`/apis/${f.apiId}`} className="text-sm font-medium text-neutral-900 underline-offset-2 hover:underline">{f.apiName}</Link>
                <code className="text-xs text-neutral-400">{f.apiPath}</code>
              </div>
              <p className="mt-2 text-sm text-neutral-700">{f.explanation}</p>
              <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
                <dt className="text-neutral-400">Evidence</dt>
                <dd className="text-neutral-600">{f.evidence}</dd>
                <dt className="text-neutral-400">Usage</dt>
                <dd className="text-neutral-600">
                  {f.usageCount} call(s){f.lastUsedAt ? `, last used ${new Date(f.lastUsedAt).toLocaleDateString()}` : ", never used"}
                </dd>
                <dt className="text-neutral-400">Suggested action</dt>
                <dd className="text-neutral-800">{f.suggestedAction}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {canReview && (
        <div className="mt-6 flex gap-2">
          {["REVIEWED", "RESOLVED"].filter((s) => s !== data.status).map((s) => (
            <button
              key={s}
              onClick={() => setStatus.mutate(s)}
              disabled={setStatus.isPending}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              Mark as {s.toLowerCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
