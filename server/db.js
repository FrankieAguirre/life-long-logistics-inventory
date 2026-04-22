import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/** Canonical database name for Life-Long Logistics inventory */
export const DB_NAME =
  process.env.DB_NAME || 'life-long-logistics-inventory-main';

export function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });
}
