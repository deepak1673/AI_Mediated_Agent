import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { ResultView, type AskResult } from "./Ask";

interface Run {
  id: string;
  requestText: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resultSummary: Omit<AskResult, "runId" | "status"> | null;
}

export function RequestDetailPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => (await api.get<{ request: Run }>(`/api/requests/${id}`)).request,
  });

  if (isLoading) return <LoadingState />;
  if (error instanceof ApiError && error.status === 404) return <EmptyState label="That request was not found." />;
  if (error || !data) return <ErrorState label="This request could not be loaded." />;

  const canResume = data.status === "APPROVED" || data.status === "WAITING_HITL" || data.status === "ETL_RUNNING";
  return (
    <div className="max-w-4xl">
      <Link to="/requests" className="text-sm text-neutral-500 hover:underline">← My Requests</Link>
      <h1 className="mt-2 text-xl font-semibold text-neutral-900">{data.requestText}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
        <StatusBadge value={data.status} />
        <span>Asked {new Date(data.createdAt).toLocaleString()}</span>
        <span>Updated {new Date(data.updatedAt).toLocaleString()}</span>
        {canResume && (
          <Link
            to={`/ask?q=${encodeURIComponent(data.requestText)}`}
            className="rounded-md border border-neutral-300 px-2 py-0.5 font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {data.status === "APPROVED" ? "Resume" : "Check again"}
          </Link>
        )}
      </div>
      {data.resultSummary ? (
        <ResultView result={{ runId: data.id, status: data.status, ...data.resultSummary }} />
      ) : (
        <EmptyState label="No result was recorded for this request." />
      )}
    </div>
  );
}
