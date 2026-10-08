import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
const { Pool } = pg;
export const pool = new Pool({
  max: 1,
  connectionString:
    process.env.TASKFLOW_DATABASE_URL ?? process.env.DATABASE_URL,
});
export async function migrate() {
  const sql = await fs.readFile(
    path.resolve(process.cwd(), "sql/001_init.sql"),
    "utf8",
  );
  await pool.query(sql);
}
