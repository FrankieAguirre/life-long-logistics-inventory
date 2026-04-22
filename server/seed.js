import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { createPool } from './db.js';
import { ensureFinalSchema } from './finalSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const upstreamRoot = path.join(projectRoot, 'Updated-Final-DB');

function readUpstream(relPath) {
  return fs.readFileSync(path.join(upstreamRoot, relPath), 'utf8');
}

/** Parse a single-line SQL tuple like ('MED-0001', 'Name', 'Cat', 'Form', '500', 'mg'), */
function parseSqlValuesLine(line) {
  const s0 = line.trim().replace(/,$/, '').replace(/;$/, '');
  if (!s0.startsWith('(') || !s0.endsWith(')')) return null;
  const s = s0.slice(1, -1);
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== "'") return null;
    i++;
    let buf = '';
    while (i < s.length) {
      if (s[i] === '\\' && s[i + 1] === "'") {
        buf += "'";
        i += 2;
        continue;
      }
      if (s[i] === "'" && s[i + 1] === "'") {
        buf += "'";
        i += 2;
        continue;
      }
      if (s[i] === "'") {
        i++;
        break;
      }
      buf += s[i++];
    }
    out.push(buf);
    while (i < s.length && /[,\s]/.test(s[i])) i++;
  }
  return out.length >= 6 ? out : null;
}

function parseMedicationSeed(sqlText) {
  const rows = [];
  for (const rawLine of sqlText.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('(') || !line.includes('MED-')) continue;
    const parts = parseSqlValuesLine(line);
    if (!parts) continue;
    const [medId, name, category, form, strength, unit] = parts;
    if (!/^MED-/.test(medId)) continue;
    const strengthCombined = `${strength} ${unit}`.trim();
    rows.push({
      medId,
      name,
      genericName: name,
      category,
      form,
      strength: strengthCombined,
      reorderLevel: 100,
    });
  }
  return rows;
}

async function seed() {
  console.log('Applying normalized schema (Updated-Final-DB)…');
  await ensureFinalSchema();

  const pool = createPool();
  const conn = await pool.getConnection();
  try {
    await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);

    const locSql = readUpstream('seed/001_locations.sql');
    await conn.query(locSql);

    const medSqlRaw = readUpstream('seed/002_medications.sql');
    const medRows = parseMedicationSeed(medSqlRaw);
    console.log(`Inserting ${medRows.length} medications…`);
    const chunkSize = 40;
    for (let i = 0; i < medRows.length; i += chunkSize) {
      const chunk = medRows.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, 1)').join(', ');
      const flat = chunk.flatMap((r) => [
        r.medId,
        r.name,
        r.genericName,
        r.category,
        r.form,
        r.strength,
        r.reorderLevel,
      ]);
      await conn.query(
        `INSERT INTO medications (med_id, name, generic_name, category, form, strength, reorder_level, is_active) VALUES ${placeholders}`,
        flat
      );
    }

    const lotsSql = readUpstream('seed/003_lots.sql');
    await conn.query(lotsSql);

    const balSql = readUpstream('seed/004_inventory_balances.sql');
    await conn.query(balSql);

    await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);

    const [urows] = await conn.query('SELECT id FROM users WHERE username = ?', ['frankie']);
    if (urows.length === 0) {
      const hash = await bcrypt.hash('demo1234', 10);
      await conn.query(
        `INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)`,
        ['frankie', 'Frankie – Frontend & UI', 'frontend', hash]
      );
      console.log('Demo user frankie / demo1234 created.');
    } else {
      console.log('Demo user frankie already exists — skipping.');
    }
  } finally {
    conn.release();
    await pool.end();
  }

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
