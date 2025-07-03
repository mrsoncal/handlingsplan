const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const db = new sqlite3.Database('./data.db');

app.use(cors());
app.use(bodyParser.json());

// Create tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS vedtak (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    row_id TEXT UNIQUE,
    tema TEXT,
    timestamp TEXT
  )`);
});

// Endpoint: login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, user) => {
    if (err || !user) return res.status(401).send('Unauthorized');
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) res.sendStatus(200);
      else res.status(401).send('Unauthorized');
    });
  });
});

// Endpoint: mark row as vedtatt
app.post('/vedtak', (req, res) => {
  const { row_id, tema, timestamp } = req.body;
  db.run('INSERT OR IGNORE INTO vedtak (row_id, tema, timestamp) VALUES (?, ?, ?)', [row_id, tema, timestamp], function (err) {
    if (err) return res.status(500).send('DB error');
    res.sendStatus(200);
  });
});

// Endpoint: fetch vedtatt rows
app.get('/vedtak', (req, res) => {
  db.all('SELECT row_id FROM vedtak', [], (err, rows) => {
    if (err) return res.status(500).send('DB error');
    res.json(rows.map(r => r.row_id));
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
