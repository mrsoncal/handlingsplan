// handlingsplan-api/server.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const {
  init,
  getCouncils,
  createCouncil,
  getCouncilById,
} = require("./db");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json());

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

// POST /api/ungdomsrad  -> create council
app.post("/api/ungdomsrad", async (req, res) => {
  try {
    const { name, year } = req.body || {};

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ error: "Feltet 'name' (navn på ungdomsråd) er påkrevd." });
    }

    const council = await createCouncil({ name, year });
    res.status(201).json(council);
  } catch (err) {
    console.error("Error creating council:", err);
    res.status(500).json({ error: "Kunne ikke opprette ungdomsråd." });
  }
});

// GET /api/ungdomsrad/:id  -> fetch single council
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
