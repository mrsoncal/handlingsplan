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

  // Allow a separate display_name (visningsnavn)
  await pool.query(`
    ALTER TABLE councils
    ADD COLUMN IF NOT EXISTS display_name TEXT;
  `);

  // Make sure we have logo_path (har du det fra før, gjør IF NOT EXISTS at det ikke krasjer)
  await pool.query(`
    ALTER TABLE councils
    ADD COLUMN IF NOT EXISTS logo_path TEXT;
  `);

  // Tema-oppsett per råd
  await pool.query(`
    CREATE TABLE IF NOT EXISTS council_tema (
      id SERIAL PRIMARY KEY,
      council_id INTEGER NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT,
      allow_add BOOLEAN NOT NULL DEFAULT TRUE,
      allow_change BOOLEAN NOT NULL DEFAULT TRUE,
      allow_remove BOOLEAN NOT NULL DEFAULT TRUE,
      position INTEGER NOT NULL DEFAULT 0
    );
  `);



  console.log("[db] ensured councils table & columns exist");
}


async function updateCouncilHandlingsplanFile(id, buffer, mimeType, originalName) {
  await pool.query(
    `
      UPDATE councils
      SET
        handlingsplan_data = $2,
        handlingsplan_mime_type = $3,
        handlingsplan_original_name = $4
      WHERE id = $1
    `,
    [id, buffer, mimeType || null, originalName || null]
  );
}

async function updateCouncilLogoFile(id, buffer, mimeType, originalName) {
  await pool.query(
    `
      UPDATE councils
      SET
        logo_data = $2,
        logo_mime_type = $3,
        logo_original_name = $4
      WHERE id = $1
    `,
    [id, buffer, mimeType || null, originalName || null]
  );
}

async function getCouncilHandlingsplanFile(id) {
  const result = await pool.query(
    `
      SELECT handlingsplan_data, handlingsplan_mime_type, handlingsplan_original_name
      FROM councils
      WHERE id = $1
    `,
    [id]
  );

  if (result.rows.length === 0 || !result.rows[0].handlingsplan_data) return null;
  const row = result.rows[0];
  return {
    data: row.handlingsplan_data,
    mimeType: row.handlingsplan_mime_type || "application/octet-stream",
    originalName: row.handlingsplan_original_name || "handlingsplan.pdf",
  };
}

async function getCouncilLogoFile(id) {
  const result = await pool.query(
    `
      SELECT logo_data, logo_mime_type, logo_original_name
      FROM councils
      WHERE id = $1
    `,
    [id]
  );

  if (result.rows.length === 0 || !result.rows[0].logo_data) return null;
  const row = result.rows[0];
  return {
    data: row.logo_data,
    mimeType: row.logo_mime_type || "image/png",
    originalName: row.logo_original_name || "logo.png",
  };
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
      SELECT
        id,
        name,
        display_name,
        year,
        created_at,
        handlingsplan_data IS NOT NULL AS has_handlingsplan,
        logo_data IS NOT NULL AS has_logo
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
    display_name: row.display_name || row.name,
    has_handlingsplan: row.has_handlingsplan,
    has_logo: row.has_logo,
  };
}

async function getCouncils() {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        display_name,
        year,
        created_at,
        handlingsplan_data IS NOT NULL AS has_handlingsplan,
        logo_data IS NOT NULL AS has_logo
      FROM councils
      ORDER BY created_at ASC, id ASC
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    display_name: row.display_name || row.name,
    year: row.year,
    created_at: row.created_at,
    has_handlingsplan: row.has_handlingsplan,
    has_logo: row.has_logo,
  }));
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

async function getTemaerForCouncil(councilId) {
  const result = await pool.query(
    `
      SELECT
        id,
        council_id,
        name,
        color,
        allow_add,
        allow_change,
        allow_remove,
        position
      FROM council_tema
      WHERE council_id = $1
      ORDER BY position ASC, id ASC
    `,
    [councilId]
  );

  // Map DB-column names -> API shape
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    allowAdd: row.allow_add,
    allowChange: row.allow_change,
    allowRemove: row.allow_remove,
    position: row.position,
  }));
}

async function saveTemaerForCouncil(councilId, temaer) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Slett eksisterende
    await client.query(
      "DELETE FROM council_tema WHERE council_id = $1",
      [councilId]
    );

    const insertSql = `
      INSERT INTO council_tema (
        council_id,
        name,
        color,
        allow_add,
        allow_change,
        allow_remove,
        position
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    for (const t of temaer || []) {
      const name = (t.name || "").trim();
      if (!name) continue;

      const color = t.color || null;
      const allowAdd = t.allowAdd !== false;
      const allowChange = t.allowChange !== false;
      const allowRemove = t.allowRemove !== false;
      const position =
        typeof t.position === "number" ? t.position : 0;

      await client.query(insertSql, [
        councilId,
        name,
        color,
        allowAdd,
        allowChange,
        allowRemove,
        position,
      ]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateCouncilDisplayName(id, displayName) {
  await pool.query(
    `
      UPDATE councils
      SET display_name = $2
      WHERE id = $1
    `,
    [id, displayName || null]
  );
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
  getTemaerForCouncil,
  saveTemaerForCouncil,
  updateCouncilDisplayName,
  updateCouncilHandlingsplanFile,
  updateCouncilLogoFile,
  getCouncilHandlingsplanFile,
  getCouncilLogoFile,
};
