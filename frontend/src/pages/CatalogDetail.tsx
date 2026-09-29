import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorState, LoadingState } from "../components/States";

interface ColumnRow {
  id: string;
  columnName: string;
  dataType: string;
  description: string | null;
  classification: string;
  synonyms: string[];
}

interface AssetDetail {
  id: string;
  schemaName: string;
  tableName: string;
  description: string;
  owner: string;
  classification: string;
  inWarehouse: boolean;
  sourceSystem: string | null;
  columns: ColumnRow[];
}

export function CatalogDetailPage() {
  const { id } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalog-asset", id],
    queryFn: async () =>
      api.get<{ asset: AssetDetail; relatedApis: { id: string; name: string; path: string }[] }>(`/api/catalog/assets/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState />;

  const { asset, relatedApis } = data;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="font-mono text-xl font-semibold text-neutral-900">
          {asset.schemaName}.{asset.tableName}
        </h1>
        <StatusBadge value={asset.classification} />
        {!asset.inWarehouse && <StatusBadge value="INTERNAL" />}
      </div>
      <p className="mb-4 text-sm text-neutral-500">{asset.description}</p>

      <dl className="mb-6 grid grid-cols-3 gap-4 text-sm">
        <div><dt className="text-neutral-400">Owner</dt><dd>{asset.owner}</dd></div>
        <div><dt className="text-neutral-400">In warehouse</dt><dd>{asset.inWarehouse ? "Yes" : "No (source-only)"}</dd></div>
        <div><dt className="text-neutral-400">Source system</dt><dd>{asset.sourceSystem ?? "—"}</dd></div>
      </dl>

      <h2 className="mb-2 text-sm font-semibold text-neutral-900">Columns</h2>
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
            <th className="py-2 font-medium">Column</th>
            <th className="py-2 font-medium">Type</th>
            <th className="py-2 font-medium">Classification</th>
            <th className="py-2 font-medium">Synonyms</th>
          </tr>
        </thead>
        <tbody>
          {asset.columns.map((c) => (
            <tr key={c.id} className="border-b border-neutral-100">
              <td className="py-2 font-mono">{c.columnName}</td>
              <td className="py-2 text-neutral-600">{c.dataType}</td>
              <td className="py-2"><StatusBadge value={c.classification} /></td>
              <td className="py-2 text-neutral-500">{c.synonyms.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 text-sm font-semibold text-neutral-900">APIs using this table</h2>
      {relatedApis.length === 0 ? (
        <div className="text-sm text-neutral-400">No registered API queries this table directly yet.</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {relatedApis.map((a) => (
            <li key={a.id}>
              <Link to={`/apis/${a.id}`} className="text-sm font-medium text-neutral-800 hover:underline">
                {a.name}
              </Link>
              <span className="ml-2 text-xs text-neutral-400">{a.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
