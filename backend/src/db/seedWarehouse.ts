import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";
import { pgPool } from "../lib/pg.js";

// Deterministic PRNG (mulberry32) so seed data is reproducible across runs.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const date = (start: Date, end: Date) => {
  const t = start.getTime() + rand() * (end.getTime() - start.getTime());
  return new Date(t).toISOString().slice(0, 10);
};

const COUNTRIES = ["India", "United States", "Germany", "United Kingdom", "Singapore", "Brazil", "UAE"];
const CUSTOMER_TYPES = ["Enterprise", "SMB", "Individual"];
const SEGMENTS = ["Retail", "Wholesale", "Online", "Key Account"];
const PRODUCT_CATEGORIES = ["Electronics", "Home & Kitchen", "Apparel", "Sports", "Groceries", "Beauty"];
const ORDER_STATUSES = ["COMPLETED", "PENDING", "CANCELLED", "REFUNDED"];
const PAYMENT_STATUSES = ["PAID", "PENDING", "FAILED", "REFUNDED"];
const CHANNELS = ["email", "sms", "push", "phone"];
const INTERACTION_TYPES = ["support_call", "chat", "email_reply", "complaint", "feedback"];
const EVENT_TYPES = ["inspection", "repair", "replacement", "calibration"];

const NUM_CUSTOMERS = 200;
const NUM_PRODUCTS = 50;
const NUM_ORDERS = 900;

async function main() {
  const sql = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "warehouseSchema.sql"), "utf-8");
  await pgPool.query(sql);
  console.log("Warehouse/source DDL applied.");

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    // Truncate for idempotent re-seeding (dependents first).
    await client.query(`
      TRUNCATE
        warehouse.fact_inventory, warehouse.fact_payments, warehouse.fact_orders,
        warehouse.dim_product, warehouse.dim_customer,
        crm.customer_interactions, crm.customer_preferences, crm.customers,
        erp.purchase_orders, erp.suppliers, erp.payments, erp.orders,
        maintenance.technician_logs, maintenance.maintenance_events, maintenance.equipment
      RESTART IDENTITY CASCADE
    `);

    // --- Customers (in both warehouse.dim_customer and crm.customers — already ETL'd) ---
    const customerIds: string[] = [];
    for (let i = 1; i <= NUM_CUSTOMERS; i++) {
      const customerId = `CUST-${String(i).padStart(5, "0")}`;
      customerIds.push(customerId);
      const name = `Customer ${i}`;
      const email = `customer${i}@example.com`;
      const phone = `+1-555-${String(int(1000, 9999))}`;
      const country = pick(COUNTRIES);
      const customerType = pick(CUSTOMER_TYPES);
      const segment = pick(SEGMENTS);
      const signup = date(new Date("2022-01-01"), new Date("2025-06-01"));

      await client.query(
        `INSERT INTO warehouse.dim_customer (customer_id, customer_name, customer_type, country, segment, signup_date, email, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [customerId, name, customerType, country, segment, signup, email, phone],
      );
      await client.query(
        `INSERT INTO crm.customers (customer_id, name, email, phone, country, customer_type, segment, signup_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [customerId, name, email, phone, country, customerType, segment, signup],
      );

      // Source-only: preferences (~60% of customers) and interactions.
      if (rand() < 0.6) {
        await client.query(
          `INSERT INTO crm.customer_preferences (customer_id, channel, marketing_opt_in, preferred_contact_time)
           VALUES ($1,$2,$3,$4)`,
          [customerId, pick(CHANNELS), rand() < 0.5, pick(["morning", "afternoon", "evening"])],
        );
      }
      const interactionCount = int(0, 4);
      for (let k = 0; k < interactionCount; k++) {
        await client.query(
          `INSERT INTO crm.customer_interactions (customer_id, interaction_type, interaction_date, notes)
           VALUES ($1,$2,$3,$4)`,
          [customerId, pick(INTERACTION_TYPES), date(new Date("2024-01-01"), new Date("2025-09-01")), "Demo interaction record"],
        );
      }
    }
    console.log(`Seeded ${NUM_CUSTOMERS} customers (warehouse + CRM).`);

    // --- Products ---
    const productIds: string[] = [];
    for (let i = 1; i <= NUM_PRODUCTS; i++) {
      const productId = `PROD-${String(i).padStart(4, "0")}`;
      productIds.push(productId);
      await client.query(
        `INSERT INTO warehouse.dim_product (product_id, product_name, category) VALUES ($1,$2,$3)`,
        [productId, `Product ${i}`, pick(PRODUCT_CATEGORIES)],
      );
    }
    console.log(`Seeded ${NUM_PRODUCTS} products.`);

    // --- Orders + Payments (warehouse + ERP mirror) ---
    for (let i = 1; i <= NUM_ORDERS; i++) {
      const orderId = `ORD-${String(i).padStart(6, "0")}`;
      const customerId = pick(customerIds);
      const productId = pick(productIds);
      const orderDate = date(new Date("2025-01-01"), new Date("2025-12-31"));
      const quantity = int(1, 8);
      const amount = Number((quantity * int(500, 15000)).toFixed(2));
      const status = pick(ORDER_STATUSES);

      const { rows: custRows } = await client.query(
        `SELECT customer_key FROM warehouse.dim_customer WHERE customer_id = $1`,
        [customerId],
      );
      const { rows: prodRows } = await client.query(
        `SELECT product_key FROM warehouse.dim_product WHERE product_id = $1`,
        [productId],
      );

      await client.query(
        `INSERT INTO warehouse.fact_orders (order_id, customer_key, product_key, order_date, quantity, amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, custRows[0].customer_key, prodRows[0].product_key, orderDate, quantity, amount, status],
      );
      await client.query(
        `INSERT INTO erp.orders (order_id, customer_id, product_id, order_date, quantity, amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, customerId, productId, orderDate, quantity, amount, status],
      );

      if (status !== "CANCELLED") {
        const paymentId = `PAY-${String(i).padStart(6, "0")}`;
        const paymentStatus = status === "REFUNDED" ? "REFUNDED" : pick(PAYMENT_STATUSES);
        await client.query(
          `INSERT INTO warehouse.fact_payments (payment_id, order_id, payment_date, amount, payment_status)
           VALUES ($1,$2,$3,$4,$5)`,
          [paymentId, orderId, orderDate, amount, paymentStatus],
        );
        await client.query(
          `INSERT INTO erp.payments (payment_id, order_id, payment_date, amount, payment_status)
           VALUES ($1,$2,$3,$4,$5)`,
          [paymentId, orderId, orderDate, amount, paymentStatus],
        );
      }
    }
    console.log(`Seeded ${NUM_ORDERS} orders (warehouse + ERP), with payments.`);

    // --- Inventory snapshots ---
    const WAREHOUSES = ["WH-NORTH", "WH-SOUTH", "WH-EAST"];
    for (const productId of productIds) {
      const { rows: prodRows } = await client.query(
        `SELECT product_key FROM warehouse.dim_product WHERE product_id = $1`,
        [productId],
      );
      for (const wh of WAREHOUSES) {
        await client.query(
          `INSERT INTO warehouse.fact_inventory (product_key, warehouse_id, snapshot_date, quantity)
           VALUES ($1,$2,$3,$4)`,
          [prodRows[0].product_key, wh, "2025-09-01", int(0, 500)],
        );
      }
    }
    console.log(`Seeded inventory snapshots for ${productIds.length} products across ${WAREHOUSES.length} warehouses.`);

    // --- ERP suppliers + purchase orders ---
    const supplierIds: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const supplierId = `SUP-${String(i).padStart(3, "0")}`;
      supplierIds.push(supplierId);
      await client.query(`INSERT INTO erp.suppliers (supplier_id, name, country) VALUES ($1,$2,$3)`, [
        supplierId,
        `Supplier ${i}`,
        pick(COUNTRIES),
      ]);
    }
    for (let i = 1; i <= 120; i++) {
      await client.query(
        `INSERT INTO erp.purchase_orders (po_id, supplier_id, product_id, quantity, order_date)
         VALUES ($1,$2,$3,$4,$5)`,
        [`PO-${String(i).padStart(5, "0")}`, pick(supplierIds), pick(productIds), int(10, 500), date(new Date("2025-01-01"), new Date("2025-09-01"))],
      );
    }
    console.log("Seeded ERP suppliers + purchase orders.");

    // --- Maintenance (source-only, deliberately absent from warehouse) ---
    const equipmentIds: string[] = [];
    for (let i = 1; i <= 15; i++) {
      const equipmentId = `EQ-${String(i).padStart(3, "0")}`;
      equipmentIds.push(equipmentId);
      await client.query(
        `INSERT INTO maintenance.equipment (equipment_id, name, location, install_date)
         VALUES ($1,$2,$3,$4)`,
        [equipmentId, `Equipment ${i}`, pick(["Plant A", "Plant B", "Warehouse North", "Warehouse South"]), date(new Date("2019-01-01"), new Date("2023-01-01"))],
      );
    }
    const technicianIds = Array.from({ length: 8 }, (_, i) => `TECH-${String(i + 1).padStart(3, "0")}`);
    for (let i = 1; i <= 80; i++) {
      await client.query(
        `INSERT INTO maintenance.maintenance_events (event_id, equipment_id, event_date, event_type, technician_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          `EVT-${String(i).padStart(4, "0")}`,
          pick(equipmentIds),
          date(new Date("2024-01-01"), new Date("2025-09-01")),
          pick(EVENT_TYPES),
          pick(technicianIds),
          "Demo maintenance record",
        ],
      );
    }
    for (let i = 1; i <= 60; i++) {
      await client.query(
        `INSERT INTO maintenance.technician_logs (log_id, technician_id, log_date, hours, notes)
         VALUES ($1,$2,$3,$4,$5)`,
        [`LOG-${String(i).padStart(4, "0")}`, pick(technicianIds), date(new Date("2025-01-01"), new Date("2025-09-01")), int(1, 8), "Demo technician log"],
      );
    }
    console.log("Seeded maintenance source data (not mirrored to warehouse).");

    await client.query("COMMIT");
    console.log("Warehouse/source seed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pgPool.end();
  });
