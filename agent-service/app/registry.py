"""Read-only access to the platform API Registry (doc §17). Deterministic, no LLM."""

from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from app.config import settings


def list_active_apis() -> list[dict]:
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        return conn.execute(
            'SELECT id, name, description, path, metric, dimensions, "filterKeys" AS filter_keys, '
            "classification, parameters FROM platform.api_registry WHERE status = 'ACTIVE' ORDER BY name"
        ).fetchall()


def list_catalog() -> list[dict]:
    """Data Catalog (doc section 16): assets with their columns, for Data Discovery."""
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        assets = conn.execute(
            'SELECT id, "schemaName" AS schema_name, "tableName" AS table_name, description, '
            'classification, "inWarehouse" AS in_warehouse, "sourceSystem" AS source_system '
            "FROM platform.data_assets ORDER BY 2, 3"
        ).fetchall()
        cols = conn.execute(
            'SELECT "assetId" AS asset_id, "columnName" AS column_name, "dataType" AS data_type, '
            "classification, synonyms FROM platform.data_columns ORDER BY 1, 2"
        ).fetchall()
    by_asset = {}
    for c in cols:
        by_asset.setdefault(c["asset_id"], []).append(c)
    for a in assets:
        a["columns"] = by_asset.get(a["id"], [])
    return assets
