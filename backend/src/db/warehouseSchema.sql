-- Warehouse (curated) + source-system tables. Managed by raw SQL, not Prisma —
-- Prisma owns the `platform` schema only (doc §3.4: Prisma is the app ORM, but the
-- warehouse/source data is queried through compiled query plans, not model classes).

CREATE TABLE IF NOT EXISTS warehouse.dim_customer (
  customer_key   SERIAL PRIMARY KEY,
  customer_id    TEXT UNIQUE NOT NULL,
  customer_name  TEXT NOT NULL,
  customer_type  TEXT NOT NULL,
  country        TEXT NOT NULL,
  segment        TEXT NOT NULL,
  signup_date    DATE NOT NULL,
  email          TEXT,
  phone          TEXT
);

CREATE TABLE IF NOT EXISTS warehouse.dim_product (
  product_key   SERIAL PRIMARY KEY,
  product_id    TEXT UNIQUE NOT NULL,
  product_name  TEXT NOT NULL,
  category      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warehouse.fact_orders (
  order_key     SERIAL PRIMARY KEY,
  order_id      TEXT UNIQUE NOT NULL,
  customer_key  INTEGER NOT NULL REFERENCES warehouse.dim_customer (customer_key),
  product_key   INTEGER NOT NULL REFERENCES warehouse.dim_product (product_key),
  order_date    DATE NOT NULL,
  quantity      INTEGER NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL,
  status        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warehouse.fact_payments (
  payment_key     SERIAL PRIMARY KEY,
  payment_id      TEXT UNIQUE NOT NULL,
  order_id        TEXT NOT NULL,
  payment_date    DATE NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL,
  payment_status  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warehouse.fact_inventory (
  id             SERIAL PRIMARY KEY,
  product_key    INTEGER NOT NULL REFERENCES warehouse.dim_product (product_key),
  warehouse_id   TEXT NOT NULL,
  snapshot_date  DATE NOT NULL,
  quantity       INTEGER NOT NULL
);

-- CRM source system
CREATE TABLE IF NOT EXISTS crm.customers (
  id             SERIAL PRIMARY KEY,
  customer_id    TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL,
  country        TEXT NOT NULL,
  customer_type  TEXT NOT NULL,
  segment        TEXT NOT NULL,
  signup_date    DATE NOT NULL
);

-- Deliberately not mirrored into the warehouse (doc §15) — demonstrates data-access HITL.
CREATE TABLE IF NOT EXISTS crm.customer_preferences (
  id                     SERIAL PRIMARY KEY,
  customer_id            TEXT NOT NULL,
  channel                TEXT NOT NULL,
  marketing_opt_in       BOOLEAN NOT NULL,
  preferred_contact_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm.customer_interactions (
  id                SERIAL PRIMARY KEY,
  customer_id       TEXT NOT NULL,
  interaction_type  TEXT NOT NULL,
  interaction_date  DATE NOT NULL,
  notes             TEXT
);

-- ERP source system
CREATE TABLE IF NOT EXISTS erp.orders (
  id           SERIAL PRIMARY KEY,
  order_id     TEXT UNIQUE NOT NULL,
  customer_id  TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  order_date   DATE NOT NULL,
  quantity     INTEGER NOT NULL,
  amount       NUMERIC(12, 2) NOT NULL,
  status       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS erp.payments (
  id              SERIAL PRIMARY KEY,
  payment_id      TEXT UNIQUE NOT NULL,
  order_id        TEXT NOT NULL,
  payment_date    DATE NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL,
  payment_status  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS erp.suppliers (
  id           SERIAL PRIMARY KEY,
  supplier_id  TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  country      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS erp.purchase_orders (
  id           SERIAL PRIMARY KEY,
  po_id        TEXT UNIQUE NOT NULL,
  supplier_id  TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  quantity     INTEGER NOT NULL,
  order_date   DATE NOT NULL
);

-- Maintenance source system (deliberately absent from warehouse — the ETL/HITL demo, doc §15)
CREATE TABLE IF NOT EXISTS maintenance.equipment (
  id            SERIAL PRIMARY KEY,
  equipment_id  TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  location      TEXT NOT NULL,
  install_date  DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance.maintenance_events (
  id             SERIAL PRIMARY KEY,
  event_id       TEXT UNIQUE NOT NULL,
  equipment_id   TEXT NOT NULL,
  event_date     DATE NOT NULL,
  event_type     TEXT NOT NULL,
  technician_id  TEXT NOT NULL,
  notes          TEXT
);

CREATE TABLE IF NOT EXISTS maintenance.technician_logs (
  id             SERIAL PRIMARY KEY,
  log_id         TEXT UNIQUE NOT NULL,
  technician_id  TEXT NOT NULL,
  log_date       DATE NOT NULL,
  hours          NUMERIC(5, 2) NOT NULL,
  notes          TEXT
);
