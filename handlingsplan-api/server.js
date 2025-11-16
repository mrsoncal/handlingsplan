// handlingsplan-api/server.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  init,
  getCouncils,
  createCouncil,
  getCouncilById,
  getCouncilWithPassword,
  deleteCouncil,
  setCouncilHandlingsplanPath,
} = require("./db");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer for file uploads
const upload = multer({ dest: uploadsDir });

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

// GET /api/ungdomsrad/:id  -> fetch single council (no password)
app.get("/api/ungdomsrad/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const council = await getCouncilById(id);

    if (!council) {
      return res.status(404).json({ error: "Ungdomsråd ikke funnet." });
    }

    res.json(council);
  } catch (err) {
    console.error("Error getting council by id:", err);
    res.status(500).json({ error: "Kunne ikke hente ungdomsråd." });
  }
});

// DELETE /api/ungdomsrad/:id  -> delete a council
app.delete("/api/ungdomsrad/:id", async (req, res) => {
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
  upload.single("file"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const { password } = req.body || {};

      const council = await getCouncilWithPassword(id);
      if (!council) {
        return res.status(404).json({ error: "Ungdomsråd ikke funnet." });
      }

      if (!password || password.trim() !== (council.admin_password || "").trim()) {
        return res
          .status(401)
          .json({ error: "Feil passord for dette ungdomsrådet." });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ error: "Ingen fil ble lastet opp. Velg en PDF eller et bilde." });
      }

      const relativePath = `/uploads/${req.file.filename}`;
      await setCouncilHandlingsplanPath(id, relativePath);

      const updated = await getCouncilById(id);
      res.json(updated);
    } catch (err) {
      console.error("Error uploading handlingsplan:", err);
      res
        .status(500)
        .json({ error: "Kunne ikke laste opp handlingsplan for dette ungdomsrådet." });
    }
  }
);

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
