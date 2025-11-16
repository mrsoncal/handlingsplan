// handlingsplan-api/db.js
const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL is not set. Remember to configure it in .env (local) and in Render."
  );
}

// Render Postgres usually needs SSL, local often doesn't.
// This tries to "do the right thing" in both cases.
const useSSL =
  process.env.PGSSL === "true" ||
  (!!process.env.RENDER && process.env.PGSSL !== "false");

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function init() {
  // Create table for ungdomsråd / councils if it doesn't exist
  const sql = `
    CREATE TABLE IF NOT EXISTS councils (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      year TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;
  await pool.query(sql);
  console.log("[db] ensured councils table exists");
}

async function getCouncils() {
  const result = await pool.query(
    `
      SELECT id, name, year, created_at
      FROM councils
      ORDER BY created_at ASC, id ASC
    `
  );

  // Add display_name helper for frontend
  return result.rows.map((row) => ({
    ...row,
    display_name: row.year ? `${row.name} (${row.year})` : row.name,
  }));
}

async function createCouncil({ name, year }) {
  if (!name || !name.trim()) {
    throw new Error("Name is required");
  }

  const result = await pool.query(
    `
      INSERT INTO councils (name, year)
      VALUES ($1, $2)
      RETURNING id, name, year, created_at
    `,
    [name.trim(), year || null]
  );

  const row = result.rows[0];
  return {
    ...row,
    display_name: row.year ? `${row.name} (${row.year})` : row.name,
  };
}

async function getCouncilById(id) {
  const result = await pool.query(
    `
      SELECT id, name, year, created_at
      FROM councils
      WHERE id = $1
    `,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...row,
    display_name: row.year ? `${row.name} (${row.year})` : row.name,
  };
}

async function deleteCouncil(id) {
  // Simple delete for now. Later we can enforce relations (suggestions, etc.)
  await pool.query(
    `DELETE FROM councils
     WHERE id = $1`,
    [id]
  );
}


module.exports = {
  init,
  getCouncils,
  createCouncil,
  getCouncilById,
  deleteCouncil,
};

