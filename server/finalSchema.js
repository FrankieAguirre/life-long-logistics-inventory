import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { DB_NAME } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const upstreamRoot = path.join(projectRoot, 'Updated-Final-DB');

function readUpstream(relPath) {
  const full = path.join(upstreamRoot, relPath);
  return fs.readFileSync(full, 'utf8');
}

/**
 * Creates the normalized inventory schema (locations, medications, lots, balances, movements)
 * and views from Updated-Final-DB. Preserves the existing `users` table for bcrypt auth.
 */
export async function ensureFinalSchema() {
  const root = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true,
  });

  const safeDb = DB_NAME.replace(/`/g, '');
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${safeDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await root.query(`USE \`${safeDb}\``);

  await root.query(`SET FOREIGN_KEY_CHECKS = 0`);
  await root.query(`DROP TABLE IF EXISTS inventory_balances`);
  await root.query(`DROP TABLE IF EXISTS stock_movements`);
  await root.query(`DROP TABLE IF EXISTS medication_lots`);
  await root.query(`DROP TABLE IF EXISTS medications`);
  await root.query(`DROP TABLE IF EXISTS locations`);
  await root.query(`SET FOREIGN_KEY_CHECKS = 1`);

  const tablesSql = readUpstream('schema/001_tables.sql.txt');
  const viewsSql = readUpstream('schema/002_views.sql.txt');
  await root.query(tablesSql);
  await root.query(viewsSql);

  await root.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      display_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await root.end();
}
