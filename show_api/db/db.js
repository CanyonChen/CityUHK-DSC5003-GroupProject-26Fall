const mysql = require('mysql');

const conn = mysql.createConnection({
   host: process.env.DB_HOST || '127.0.0.1',
   port: Number(process.env.DB_PORT || 3306),
   user: process.env.DB_USER || 'root',
   password: process.env.DB_PASSWORD || '',
   database: process.env.DB_NAME || 'db_show'
});
conn.connect();
module.exports = conn;
