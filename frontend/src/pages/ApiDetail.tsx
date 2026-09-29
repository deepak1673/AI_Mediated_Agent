import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingState, ErrorState } from "../components/States";

interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ApiDetailData {
  id: string;
  name: string;
  description: string;
  method: string;
  path: string;
  version: string;
  status: string;
  classification: string;
  ownerTeam: string;
  metric: string;
  dimensions: string[];
  filterKeys: string[];
  parameters: ApiParam[];
  responseSchema: unknown;
  queryPlan: unknown;
  usageCount: number;
  lastUsedAt: string | null;
}

const TABS = ["Overview", "Contract", "Parameters", "Try it", "Data"] as const;

export function ApiDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [invokeResult, setInvokeResult] = useState<{ kind: string; body: unknown } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["api", id],
    queryFn: async () => (await api.get<{ api: ApiDetailData }>(`/api/apis/${id}`)).api,
  });

  const invoke = useMutation({
    mutationFn: async () => {
      const qs = Object.entries(paramValues)
        .filter(([, v]) => v)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      try {
        const res = await fetch(`${data!.path}${qs ? `?${qs}` : ""}`, { credentials: "include" });
        const body = await res.json();
        return { kind: res.status === 200 ? "success" : res.status === 202 ? "pending" : "error", body };
      } catch (e) {
        return { kind: "error", body: { error: String(e) } };
      }
    },
    onSuccess: (result) => setInvokeResult(result),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState />;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-neutral-900">{data.name}</h1>
        <StatusBadge value={data.status} />
        <StatusBadge value={data.classification} />
      </div>
      <p className="mb-4 text-sm text-neutral-500">{data.description}</p>

      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-neutral-400">Method / Path</dt><dd className="font-mono">{data.method} {data.path}</dd></div>
          <div><dt className="text-neutral-400">Version</dt><dd>{data.version}</dd></div>
          <div><dt className="text-neutral-400">Owner team</dt><dd>{data.ownerTeam}</dd></div>
          <div><dt className="text-neutral-400">Metric</dt><dd>{data.metric}</dd></div>
          <div><dt className="text-neutral-400">Dimensions</dt><dd>{data.dimensions.join(", ") || "—"}</dd></div>
          <div><dt className="text-neutral-400">Usage count</dt><dd>{data.usageCount}</dd></div>
          <div><dt className="text-neutral-400">Last used</dt><dd>{data.lastUsedAt ? new Date(data.lastUsedAt).toLocaleString() : "Never"}</dd></div>
        </dl>
      )}

      {tab === "Contract" && (
        <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-900 p-4 text-xs text-neutral-100">
          {JSON.stringify(data.responseSchema, null, 2)}
        </pre>
      )}

      {tab === "Parameters" && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Required</th>
              <th className="py-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {data.parameters.map((p) => (
              <tr key={p.name} className="border-b border-neutral-100">
                <td className="py-2 font-mono">{p.name}</td>
                <td className="py-2 text-neutral-600">{p.type}</td>
                <td className="py-2 text-neutral-600">{p.required ? "Yes" : "No"}</td>
                <td className="py-2 text-neutral-600">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "Try it" && (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {data.parameters.map((p) => (
              <div key={p.name}>
                <label className="mb-1 block text-xs font-medium text-neutral-500">
                  {p.name} {p.required && <span className="text-red-500">*</span>}
                </label>
                <input
                  value={paramValues[p.name] ?? ""}
                  onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                  placeholder={p.description}
                  className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => invoke.mutate()}
            disabled={invoke.isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {invoke.isPending ? "Invoking…" : "Invoke"}
          </button>

          {invokeResult && (
            <div className="mt-4">
              <StatusBadge value={invokeResult.kind === "success" ? "ALLOW" : invokeResult.kind === "pending" ? "PENDING_APPROVAL" : "HARD_DENY"} />
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-neutral-200 bg-neutral-900 p-4 text-xs text-neutral-100">
                {JSON.stringify(invokeResult.body, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === "Data" && (
        <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-900 p-4 text-xs text-neutral-100">
          {JSON.stringify(data.queryPlan, null, 2)}
        </pre>
      )}
    </div>
  );
}
