// handlingsplan-api/server.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");
const {
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
} = require("./db");


dotenv.config();


const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_PASSWORD) {
  console.warn(
    "WARNING: ADMIN_PASSWORD is not set. /api/admin/login will always fail."
  );
}

const adminTokens = new Set();

function generateAdminToken() {
  return crypto.randomBytes(32).toString("hex");
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: "Ikke autorisert." });
  }

  next();
}


const app = express();
const PORT = process.env.PORT || 4000;

const upload = multer({ storage: multer.memoryStorage() });

// Middlewares
app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// Simple health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Handlingsplan API is running",
  });
});

// GET /api/ungdomsrad  -> list councils
app.get("/api/ungdomsrad", async (req, res) => {
  try {
    const councils = await getCouncils();
    res.json(councils);
  } catch (err) {
    console.error("Error getting councils:", err);
    res.status(500).json({ error: "Kunne ikke hente ungdomsråd." });
  }
});

// POST /api/ungdomsrad  -> create council (with admin password)
app.post("/api/ungdomsrad", async (req, res) => {
  try {
    const { name, password } = req.body || {};

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ error: "Feltet 'name' (navn på ungdomsråd) er påkrevd." });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({
        error: "Feltet 'password' (passord for ungdomsråd) er påkrevd.",
      });
    }

    const council = await createCouncil({ name, password });
    res.status(201).json(council);
  } catch (err) {
    console.error("Error creating council:", err);
    res.status(500).json({ error: "Kunne ikke opprette ungdomsråd." });
  }
});

// POST /api/admin/login  -> global admin login for råd-oversikt
app.post("/api/admin/login", (req, res) => {
  try {
    const { password } = req.body || {};

    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Feil passord." });
    }

    const token = generateAdminToken();
    adminTokens.add(token);

    res.json({ token });
  } catch (err) {
    console.error("Error in /api/admin/login:", err);
    res.status(500).json({ error: "Kunne ikke logge inn." });
  }
});


// GET /api/ungdomsrad/:id  -> fetch single council
app.get("/api/ungdomsrad/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const council = await getCouncilById(id);
    if (!council) {
      return res
        .status(404)
        .json({ error: "Ungdomsråd ikke funnet." });
    }

    const temaer = await getTemaerForCouncil(id);

    // Slå sammen council og temaer til ett svar
    res.json({
      ...council,
      temaer,
    });
  } catch (err) {
    console.error("Error fetching council:", err);
    res
      .status(500)
      .json({ error: "Kunne ikke hente ungdomsråd." });
  }
});


// GET /api/ungdomsrad/:id/innspill  -> alle innspill for ett ungdomsråd
app.get("/api/ungdomsrad/:id/innspill", async (req, res) => {
  try {
    const id = req.params.id;
    const council = await getCouncilById(id);

    if (!council) {
      return res.status(404).json({ error: "Ungdomsråd ikke funnet." });
    }

    const innspill = await getInnspillForCouncil(id);
    res.json({ items: innspill });
  } catch (err) {
    console.error("Error getting innspill:", err);
    res.status(500).json({ error: "Kunne ikke hente innspill." });
  }
});

app.get("/api/ungdomsrad/:id/handlingsplan-file", async (req, res) => {
  try {
    const { id } = req.params;
    const file = await getCouncilHandlingsplanFile(id);
    if (!file) {
      return res.status(404).send("Ingen handlingsplan funnet.");
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.originalName}"`
    );
    res.send(file.data);
  } catch (err) {
    console.error("Feil ved henting av handlingsplan:", err);
    res.status(500).send("Kunne ikke hente handlingsplan.");
  }
});

app.get("/api/ungdomsrad/:id/logo-file", async (req, res) => {
  try {
    const { id } = req.params;
    const file = await getCouncilLogoFile(id);
    if (!file) {
      return res.status(404).send("Ingen logo funnet.");
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.originalName}"`
    );
    res.send(file.data);
  } catch (err) {
    console.error("Feil ved henting av logo:", err);
    res.status(500).send("Kunne ikke hente logo.");
  }
});



// DELETE /api/ungdomsrad/:id  -> delete a council (global admin only)
app.delete("/api/ungdomsrad/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await deleteCouncil(id);
    res.status(204).send();
  } catch (err) {
    console.error("Error deleting council:", err);
    res.status(500).json({ error: "Kunne ikke slette ungdomsråd." });
  }
});


// POST /api/ungdomsrad/:id/handlingsplan -> upload PDF/image for a council
// expects multipart/form-data with fields:
//  - password (admin password for this råd)
//  - file (PDF/image)
app.post(
  "/api/ungdomsrad/:id/handlingsplan",
  upload.single("handlingsplan"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body || {};
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "Ingen fil lastet opp." });
      }

      // sjekk passord
      const council = await getCouncilWithPassword(id);
      if (
        !council ||
        !council.admin_password ||
        council.admin_password.trim() !== (password || "").trim()
      ) {
        return res
          .status(403)
          .json({ error: "Feil passord for dette ungdomsrådet." });
      }

      // lagre filen i databasen
      await updateCouncilHandlingsplanFile(
        id,
        file.buffer,
        file.mimetype,
        file.originalname
      );

      const updated = await getCouncilById(id);
      res.json(updated);
    } catch (err) {
      console.error("Feil ved opplasting av handlingsplan:", err);
      res.status(500).json({ error: "Kunne ikke lagre handlingsplan." });
    }
  }
);


// POST /api/ungdomsrad/:id/logo -> upload logo image for a council
app.post(
  "/api/ungdomsrad/:id/logo",
  upload.single("logo"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body || {};
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "Ingen fil lastet opp." });
      }

      const council = await getCouncilWithPassword(id);
      if (
        !council ||
        !council.admin_password ||
        council.admin_password.trim() !== (password || "").trim()
      ) {
        return res
          .status(403)
          .json({ error: "Feil passord for dette ungdomsrådet." });
      }

      await updateCouncilLogoFile(
        id,
        file.buffer,
        file.mimetype,
        file.originalname
      );

      const updated = await getCouncilById(id);
      res.json(updated);
    } catch (err) {
      console.error("Feil ved opplasting av logo:", err);
      res.status(500).json({ error: "Kunne ikke lagre logo." });
    }
  }
);



// POST /api/ungdomsrad/:id/innspill  -> lagre ett nytt innspill
app.post("/api/ungdomsrad/:id/innspill", async (req, res) => {
  try {
    const id = req.params.id;
    const council = await getCouncilById(id);

    if (!council) {
      return res.status(404).json({ error: "Ungdomsråd ikke funnet." });
    }

    const {
      actionType,
      tema,
      punktNr,
      underpunktNr,
      nyttPunkt,
      endreFra,
      endreTil,
    } = req.body || {};

    if (!actionType || !tema || !punktNr) {
      return res.status(400).json({
        error:
          "Feltet 'actionType', 'tema' og 'punktNr' er påkrevd for å lagre et innspill.",
      });
    }

    const created = await createInnspill({
      councilId: id,
      actionType,
      tema,
      punktNr: Number(punktNr),
      underpunktNr: underpunktNr ? Number(underpunktNr) : null,
      nyttPunkt,
      endreFra,
      endreTil,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("Error creating innspill:", err);
    res.status(500).json({ error: "Kunne ikke lagre innspill." });
  }
});

// POST /api/ungdomsrad/:id/admin-config
// - endrer display_name
// - lagrer tema-oppsett (navn, farger, tillatelser)
app.post("/api/ungdomsrad/:id/admin-config", async (req, res) => {
  try {
    const id = req.params.id;
    const { password, displayName, temaer } = req.body || {};

    if (!password) {
      return res
        .status(400)
        .json({ error: "Passord er påkrevd." });
    }

    // Sjekk at passordet stemmer for dette rådet
    const council = await getCouncilWithPassword(id, password);
    if (!council) {
      return res
        .status(403)
        .json({ error: "Feil passord for dette ungdomsrådet." });
    }

    // Oppdater visningsnavn hvis sendt
    if (typeof displayName === "string") {
      await updateCouncilDisplayName(id, displayName.trim() || null);
    }

    // Normaliser temaer-array (i tilfelle klient sender tull)
    const cleanedTemaer = Array.isArray(temaer)
      ? temaer.map((t, index) => {
          const name = (t.name || "").trim();
          if (!name) return null;

          return {
            name,
            color: t.color || null,
            allowAdd: t.allowAdd !== false,
            allowChange: t.allowChange !== false,
            allowRemove: t.allowRemove !== false,
            position:
              typeof t.position === "number" ? t.position : index,
          };
        }).filter(Boolean)
      : [];

    await saveTemaerForCouncil(id, cleanedTemaer);

    // Hent oppdatert council + temaer og send tilbake
    const updatedCouncil = await getCouncilById(id);
    const updatedTemaer = await getTemaerForCouncil(id);

    res.json({
      ...updatedCouncil,
      temaer: updatedTemaer,
    });
  } catch (err) {
    console.error("Error saving admin-config:", err);
    res
      .status(500)
      .json({ error: "Kunne ikke lagre admin-oppsett." });
  }
});




// Start server only after DB init
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Handlingsplan API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
