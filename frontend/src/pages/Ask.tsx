import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingState } from "../components/States";

export interface AskResult {
  runId: string;
  status: string;
  intent?: { summary: string; metric: string; dimensions: string[]; filters: Record<string, string> };
  discovery?: { api_id: string | null; params: Record<string, string>; confidence: number; reasoning: string };
  api?: { id: string; name: string; path: string; classification: string } | null;
  callUrl?: string;
  generated?: boolean;
  etl?: { runId?: string; pipeline?: string; status?: string; events?: { at: string; step: string; detail?: string }[]; note?: string };
  problems?: string[];
  dataDiscovery?: {
    data_available: boolean;
    missing: string;
    reasoning: string;
    assets: { table_name: string; schema_name: string; columns: string[]; classification: string }[];
  };
  rows?: Record<string, unknown>[];
  reason?: string;
  message?: string;
  error?: string;
}

const EXAMPLES = ["Show me customers in India", "List orders for Germany", "What is customer lifetime value by region?"];

export function AskPage() {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();
  const ask = useMutation({
    mutationFn: (request: string) => api.post<AskResult>("/api/ask", { request }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requests"] }),
  });
  const result = ask.data;

  // "Resume" from My Requests opens /ask?q=... and re-runs that question once (the workflow
  // re-checks approvals and continues from where it stopped).
  const [params, setParams] = useSearchParams();
  const started = useRef(false);
  useEffect(() => {
    const q = params.get("q");
    if (q && !started.current) {
      started.current = true;
      setText(q);
      ask.mutate(q);
      setParams({}, { replace: true });
    }
  }, [params, setParams, ask]);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-neutral-900">Ask Data</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">
        Ask in plain English. The agent finds a matching API; access is checked by policy, not by the model.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) ask.mutate(text.trim());
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. Show me customers in India"
          className="w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={ask.isPending || !text.trim()}
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {ask.isPending ? "Working…" : "Ask"}
          </button>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {ask.isPending && <LoadingState label="Understanding your request and searching the API registry…" />}
      {ask.isError && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {ask.error instanceof ApiError && ask.error.message === "LLM_QUOTA_EXHAUSTED"
            ? "The Gemini API quota is exhausted (free tier daily limit). Try again later or use a key with billing enabled."
            : ask.error instanceof ApiError && ask.error.message === "AGENT_UNAVAILABLE"
              ? "The agent service is unavailable right now."
              : "Request failed."}
        </p>
      )}
      {result && <ResultView result={result} />}
    </div>
  );
}

interface CallResult {
  httpStatus: number;
  body: { data?: Record<string, unknown>[]; status?: string; reason?: string; error?: string };
}

function ApiCall({ callUrl }: { callUrl: string }) {
  const call = useMutation({
    mutationFn: async (): Promise<CallResult> => {
      const res = await fetch(callUrl, { credentials: "include" });
      return { httpStatus: res.status, body: await res.json().catch(() => ({})) };
    },
  });
  const out = call.data;
  const rows = out?.body.data ?? [];
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <section className="rounded-md border border-neutral-200 p-4 text-sm">
      <h2 className="mb-2 font-semibold text-neutral-900">API</h2>
      <div className="flex items-center gap-2">
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">GET</span>
        <code className="break-all text-neutral-800">{callUrl}</code>
        <button
          onClick={() => call.mutate()}
          disabled={call.isPending}
          className="ml-auto shrink-0 rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {call.isPending ? "Calling..." : "Call API"}
        </button>
      </div>
      {out && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-neutral-500">
            HTTP {out.httpStatus}
            {out.httpStatus === 202 && " - pending approval: " + (out.body.reason ?? "")}
            {out.httpStatus === 403 && " - denied: " + (out.body.reason ?? "")}
            {out.httpStatus === 200 && ` - ${rows.length} row(s)`}
          </p>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-neutral-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>{cols.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      {cols.map((c) => <td key={c} className="px-3 py-1.5 text-neutral-700">{String(r[c] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && <p className="p-2 text-xs text-neutral-400">Showing first 100 of {rows.length}.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function ResultView({ result }: { result: AskResult }) {
  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-md border border-neutral-200 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Outcome</h2>
          <StatusBadge value={result.status} />
        </div>
        {result.status === "API_READY" && (
          <p className="mt-1 text-sm text-neutral-600">
            {result.generated
              ? "No API existed for this, so a new one was generated, validated and added to the registry. Call it below."
              : "An existing API can answer this. Call it below to get the data."}
          </p>
        )}
        {result.status === "NO_DATA" && (
          <p className="mt-1 text-sm text-neutral-600">{result.message} Sourcing it via ETL is a later build stage.</p>
        )}
        {result.status === "WAITING_HITL" && (
          <p className="mt-1 text-sm text-neutral-600">
            {result.reason} A DWH Admin must approve this in Approvals; ask again afterwards to continue.
          </p>
        )}
        {result.status === "REJECTED" && <p className="mt-1 text-sm text-neutral-600">{result.reason}</p>}
        {result.status === "NO_API" && (
          <p className="mt-1 text-sm text-neutral-600">{result.message}</p>
        )}
        {result.status === "ETL_RUNNING" && <p className="mt-1 text-sm text-neutral-600">{result.message}</p>}
        {result.status === "FAILED" && (
          <div className="mt-1 text-sm text-red-700">
            <p>{result.error}</p>
            {result.problems && <ul className="mt-1 list-disc pl-5">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
      </section>

      {result.etl && (result.etl.events?.length || result.etl.note) && (
        <section className="rounded-md border border-neutral-200 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-neutral-900">
            ETL {result.etl.pipeline ? `- ${result.etl.pipeline}` : ""} {result.etl.status && <StatusBadge value={result.etl.status} />}
          </h2>
          {result.etl.note && <p className="text-neutral-600">{result.etl.note}</p>}
          <ol className="space-y-1 text-neutral-600">
            {result.etl.events?.map((e, i) => (
              <li key={i}>
                <span className="text-neutral-400">{new Date(e.at).toLocaleTimeString()}</span> {e.step}
                {e.detail && <span className="text-neutral-400"> - {e.detail}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {result.intent && (
        <section className="rounded-md border border-neutral-200 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-neutral-900">Agent reasoning</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-neutral-600">
            <dt className="text-neutral-400">Understood as</dt>
            <dd>{result.intent.summary}</dd>
            <dt className="text-neutral-400">Metric</dt>
            <dd>{result.intent.metric}</dd>
            <dt className="text-neutral-400">Filters</dt>
            <dd>
              {Object.entries(result.intent.filters)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ") || "none"}
            </dd>
            <dt className="text-neutral-400">Matched API</dt>
            <dd>
              {result.api ? (
                <>
                  <Link className="underline" to={`/apis/${result.api.id}`}>
                    {result.api.name}
                  </Link>{" "}
                  <StatusBadge value={result.api.classification} />
                </>
              ) : (
                "none"
              )}
              {result.discovery && (
                <span className="ml-2 text-neutral-400">confidence {Math.round(result.discovery.confidence * 100)}%</span>
              )}
            </dd>
            <dt className="text-neutral-400">Why</dt>
            <dd>{result.discovery?.reasoning}</dd>
            {result.dataDiscovery && (
              <>
                <dt className="text-neutral-400">Data used</dt>
                <dd>
                  {result.dataDiscovery.assets.length === 0
                    ? "none found"
                    : result.dataDiscovery.assets.map((a) => `${a.schema_name}.${a.table_name} (${a.columns.join(", ")})`).join("; ")}
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      {result.callUrl && <ApiCall key={result.runId} callUrl={result.callUrl} />}
    </div>
  );
}
