const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const db = new sqlite3.Database('./data.db');

app.use(cors());
app.use(bodyParser.json());

console.log("📦 Starting Handlingsplan backend...");

// Create tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`, () => {
    console.log("✅ 'admins' table ready");
  });

  db.run(`CREATE TABLE IF NOT EXISTS vedtak (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    row_id TEXT UNIQUE,
    tema TEXT,
    timestamp TEXT
  )`, () => {
    console.log("✅ 'vedtak' table ready");
  });
});

// Endpoint: login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log(`🔐 Login attempt for: ${username}`);

  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('❌ DB error during login:', err);
      return res.status(500).send('Internal error');
    }
    if (!user) {
      console.warn('❌ User not found');
      return res.status(401).send('Unauthorized');
    }

    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        console.log('✅ Login successful');
        res.sendStatus(200);
      } else {
        console.warn('❌ Invalid password');
        res.status(401).send('Unauthorized');
      }
    });
  });
});

// Endpoint: save vedtatt
app.post('/vedtak', (req, res) => {
  const { row_id, tema, timestamp } = req.body;
  console.log(`💾 Marking row as vedtatt: ${row_id} | Tema: ${tema} | ${timestamp}`);

  db.run(
    'INSERT OR IGNORE INTO vedtak (row_id, tema, timestamp) VALUES (?, ?, ?)',
    [row_id, tema, timestamp],
    function (err) {
      if (err) {
        console.error('❌ Failed to save vedtak:', err);
        return res.status(500).send('DB error');
      }
      console.log(`✅ Vedtak saved: ${row_id}`);
      res.sendStatus(200);
    }
  );
});

// Endpoint: get vedtatt rows
app.get('/vedtak', (req, res) => {
  console.log('📥 Fetching all vedtatt row_ids');

  db.all('SELECT row_id FROM vedtak', [], (err, rows) => {
    if (err) {
      console.error('❌ Error fetching vedtak:', err);
      return res.status(500).send('DB error');
    }
    const ids = rows.map(r => r.row_id);
    console.log(`✅ Fetched ${ids.length} vedtatt rows`);
    res.json(ids);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
