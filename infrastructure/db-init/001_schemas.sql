-- Logical schemas for the Data-to-API POC.
-- platform    : registry, catalog, governance, HITL, audit, workflow, reports
-- warehouse   : the curated analytics warehouse (star schema)
-- crm/erp/maintenance : mock enterprise source systems
-- langgraph   : owned entirely by LangGraph's Postgres checkpointer (agent-service)
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS warehouse;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS erp;
CREATE SCHEMA IF NOT EXISTS maintenance;
CREATE SCHEMA IF NOT EXISTS langgraph;
