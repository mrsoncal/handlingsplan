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
const useSSL =
  process.env.PGSSL === "true" ||
  (!!process.env.RENDER && process.env.PGSSL !== "false");

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function init() {
  // Base table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS councils (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      year TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // New columns for per-råd admin + handlingsplan
  await pool.query(`
    ALTER TABLE councils
    ADD COLUMN IF NOT EXISTS admin_password TEXT;
  `);

  await pool.query(`
    ALTER TABLE councils
    ADD COLUMN IF NOT EXISTS handlingsplan_path TEXT;
  `);

    // Innspill per ungdomsråd
  await pool.query(`
    CREATE TABLE IF NOT EXISTS innspill (
      id SERIAL PRIMARY KEY,
      council_id INTEGER NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      action_type TEXT NOT NULL,
      tema TEXT NOT NULL,
      punkt_nr INTEGER NOT NULL,
      underpunkt_nr INTEGER,
      formuler_punkt TEXT,
      endre_fra TEXT,
      endre_til TEXT
    );
  `);


  console.log("[db] ensured councils table & columns exist");
}

async function getCouncils() {
  const result = await pool.query(
    `
      SELECT id, name, year, created_at, handlingsplan_path, logo_path
      FROM councils
      ORDER BY created_at ASC, id ASC
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    year: row.year,
    created_at: row.created_at,
    handlingsplan_path: row.handlingsplan_path || null,
    logo_path: row.logo_path || null,
    // display_name if you have it
  }));
}


async function createCouncil({ name, password }) {
  if (!name || !name.trim()) {
    throw new Error("Name is required");
  }
  if (!password || !password.trim()) {
    throw new Error("Password is required");
  }

  const result = await pool.query(
    `
      INSERT INTO councils (name, admin_password)
      VALUES ($1, $2)
      RETURNING id, name, year, created_at, handlingsplan_path
    `,
    [name.trim(), password.trim()]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    created_at: row.created_at,
    handlingsplan_path: row.handlingsplan_path || null,
    display_name: row.name,
  };
}

async function getCouncilById(id) {
  const result = await pool.query(
    `
      SELECT id, name, year, created_at, handlingsplan_path, logo_path
      FROM councils
      WHERE id = $1
    `,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    created_at: row.created_at,
    handlingsplan_path: row.handlingsplan_path || null,
    logo_path: row.logo_path || null,
    display_name: row.name,
  };
}


// used internally, we do NOT expose password via API
async function getCouncilWithPassword(id) {
  const result = await pool.query(
    `
      SELECT id, name, year, created_at, handlingsplan_path, admin_password
      FROM councils
      WHERE id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function deleteCouncil(id) {
  await pool.query(
    `DELETE FROM councils
     WHERE id = $1`,
    [id]
  );
}

async function setCouncilHandlingsplanPath(id, path) {
  await pool.query(
    `
      UPDATE councils
      SET handlingsplan_path = $1
      WHERE id = $2
    `,
    [path, id]
  );
}

async function setCouncilLogoPath(id, logoPath) {
  await pool.query(
    `
      UPDATE councils
      SET logo_path = $2
      WHERE id = $1
    `,
    [id, logoPath]
  );
}


async function createInnspill({
  councilId,
  actionType,
  tema,
  punktNr,
  underpunktNr,
  nyttPunkt,
  endreFra,
  endreTil,
}) {
  const result = await pool.query(
    `
      INSERT INTO innspill (
        council_id,
        action_type,
        tema,
        punkt_nr,
        underpunkt_nr,
        formuler_punkt,
        endre_fra,
        endre_til
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING
        id,
        council_id,
        created_at,
        action_type,
        tema,
        punkt_nr,
        underpunkt_nr,
        formuler_punkt,
        endre_fra,
        endre_til
    `,
    [
      councilId,
      actionType,
      tema,
      punktNr,
      underpunktNr || null,
      nyttPunkt || null,
      endreFra || null,
      endreTil || null,
    ]
  );

  return result.rows[0];
}

async function getInnspillForCouncil(councilId) {
  const result = await pool.query(
    `
      SELECT
        id,
        council_id,
        created_at,
        action_type,
        tema,
        punkt_nr,
        underpunkt_nr,
        formuler_punkt,
        endre_fra,
        endre_til
      FROM innspill
      WHERE council_id = $1
      ORDER BY tema ASC, punkt_nr ASC, created_at ASC
    `,
    [councilId]
  );

  return result.rows;
}


module.exports = {
  init,
  getCouncils,
  createCouncil,
  getCouncilById,
  getCouncilWithPassword,
  deleteCouncil,
  setCouncilHandlingsplanPath,
  setCouncilLogoPath,
  createInnspill,
  getInnspillForCouncil,
};
