import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

interface HitlRequestRow {
  id: string;
  hitlType: string;
  reason: string;
  requestedResource: { path?: string; apiId?: string; classification?: string };
  status: string;
  createdAt: string;
  requester: { name: string; team: string; role: string } | null;
}

export function ApprovalsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selected, setSelected] = useState<HitlRequestRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const isAdmin = user?.role === "DWH_ADMIN";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["hitl", statusFilter],
    queryFn: async () => (await api.get<{ requests: HitlRequestRow[] }>(`/api/hitl?status=${statusFilter}`)).requests,
    enabled: isAdmin,
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "APPROVED" | "REJECTED" }) =>
      api.post(`/api/hitl/${id}/decision`, { decision, rejectionReason: decision === "REJECTED" ? rejectionReason : undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hitl"] });
      setSelected(null);
      setRejectionReason("");
    },
  });

  if (!isAdmin) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Approvals</h1>
        <EmptyState label="Only a DWH Administrator can review approvals. Sign in as Sam Okafor to try this." />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Approvals</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">Human-in-the-loop requests for API access, data access, and ETL execution.</p>

      <div className="mb-4 flex gap-1.5">
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${statusFilter === s ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.length === 0 && <EmptyState label="Nothing here." />}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-2 font-medium">Requester</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Resource</th>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {statusFilter === "PENDING" && <th className="px-4 py-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-neutral-900">{r.requester?.name}</div>
                    <div className="text-xs text-neutral-400">{r.requester?.team} · {r.requester?.role}</div>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{r.hitlType.replaceAll("_", " ")}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-neutral-600">{r.requestedResource.path ?? "—"}</td>
                  <td className="px-4 py-2.5">{r.requestedResource.classification && <StatusBadge value={r.requestedResource.classification} />}</td>
                  <td className="px-4 py-2.5 text-neutral-500">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5"><StatusBadge value={r.status} /></td>
                  {statusFilter === "PENDING" && (
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => decide.mutate({ id: r.id, decision: "APPROVED" })}
                        className="mr-2 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setSelected(r)}
                        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        Reject
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <div className="mb-2 text-sm font-semibold text-neutral-900">Reject request</div>
            <div className="mb-3 text-xs text-neutral-500">{selected.reason}</div>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection"
              className="mb-3 h-20 w-full rounded-md border border-neutral-200 p-2 text-sm outline-none focus:border-neutral-400"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
                Cancel
              </button>
              <button
                onClick={() => decide.mutate({ id: selected.id, decision: "REJECTED" })}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}

      {decide.isError && (
        <div className="mt-3 text-xs text-red-600">
          {decide.error instanceof ApiError ? decide.error.message : "Failed to submit decision."}
        </div>
      )}
    </div>
  );
}
