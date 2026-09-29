import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

interface AssetSummary {
  id: string;
  schemaName: string;
  tableName: string;
  description: string;
  owner: string;
  classification: string;
  inWarehouse: boolean;
  _count: { columns: number };
}

const SCHEMAS = ["warehouse", "crm", "erp", "maintenance"];

export function CatalogPage() {
  const [schema, setSchema] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog", schema],
    queryFn: async () => (await api.get<{ assets: AssetSummary[] }>(`/api/catalog/assets${schema ? `?schema=${schema}` : ""}`)).assets,
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Data Catalog</h1>
      <p className="mt-1 mb-4 text-sm text-neutral-500">
        What agents reason over instead of raw database schemas — sources, tables, columns, classification.
      </p>

      <div className="mb-4 flex gap-1.5">
        <button
          onClick={() => setSchema(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${schema === null ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}
        >
          All
        </button>
        {SCHEMAS.map((s) => (
          <button
            key={s}
            onClick={() => setSchema(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${schema === s ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.length === 0 && <EmptyState label="No tables in this schema." />}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-2 font-medium">Table</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Classification</th>
                <th className="px-4 py-2 font-medium">Columns</th>
                <th className="px-4 py-2 font-medium">In warehouse</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2.5">
                    <Link to={`/catalog/${a.id}`} className="font-mono text-neutral-900 hover:underline">
                      {a.schemaName}.{a.tableName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.description}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.owner}</td>
                  <td className="px-4 py-2.5"><StatusBadge value={a.classification} /></td>
                  <td className="px-4 py-2.5 text-neutral-600">{a._count.columns}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{a.inWarehouse ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
