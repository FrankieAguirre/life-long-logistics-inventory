-- Life-Long Logistics — main MySQL database (matches .env DB_NAME)
-- Create manually or run: npm run db:seed (creates DB + tables + seed data)

CREATE DATABASE IF NOT EXISTS `life-long-logistics-inventory-main`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `life-long-logistics-inventory-main`;

CREATE TABLE IF NOT EXISTS medications (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255) NOT NULL,
  category VARCHAR(128) NOT NULL,
  form VARCHAR(128) NOT NULL,
  strength VARCHAR(64) NOT NULL,
  location VARCHAR(255) NOT NULL,
  stock INT NOT NULL,
  reorder_level INT NOT NULL,
  expiry_date DATE NOT NULL,
  lot_number VARCHAR(64) NOT NULL,
  INDEX idx_category (category),
  INDEX idx_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
