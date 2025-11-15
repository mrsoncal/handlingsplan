const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[db] DATABASE_URL is not set. Remember to configure it in .env (local) and in Render."
  );
}

const pool = new Pool({
  connectionString,
  // Render Postgres usually requires SSL; local often doesn't.
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

// Run migrations (create tables) on startup
async function init() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS councils (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        year TEXT,
        slug TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("[db] Councils table ensured.");
  } finally {
    client.release();
  }
}

function makeSlug(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

async function getCouncils() {
  const result = await pool.query(
    `SELECT id, name, year, slug, created_at
     FROM councils
     ORDER BY created_at DESC`
  );

  return result.rows.map((r) => ({
    ...r,
    display_name: r.year ? `${r.name} (${r.year})` : r.name,
  }));
}

async function createCouncil({ name, year }) {
  const cleanName = name.trim();
  const slug = makeSlug(cleanName);

  const result = await pool.query(
    `INSERT INTO councils (name, year, slug)
     VALUES ($1, $2, $3)
     RETURNING id, name, year, slug, created_at`,
    [cleanName, year || null, slug]
  );

  const row = result.rows[0];
  return {
    ...row,
    display_name: row.year ? `${row.name} (${row.year})` : row.name,
  };
}

async function getCouncilById(id) {
  const result = await pool.query(
    `SELECT id, name, year, slug, created_at
     FROM councils
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...row,
    display_name: row.year ? `${row.name} (${row.year})` : row.name,
  };
}

module.exports = {
  init,
  getCouncils,
  createCouncil,
  getCouncilById,
};
