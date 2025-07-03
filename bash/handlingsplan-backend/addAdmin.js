const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./data.db');
const username = 'admin';
const password = 'your-password';

bcrypt.hash(password, 10, (err, hash) => {
  db.run('INSERT INTO admins (username, password) VALUES (?, ?)', [username, hash], () => {
    console.log('Admin added.');
    db.close();
  });
});
