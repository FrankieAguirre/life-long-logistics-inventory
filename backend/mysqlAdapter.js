import bcrypt from 'bcrypt';

function mapInventoryRow(r) {
  const expiry =
    r.expiryDate instanceof Date
      ? r.expiryDate.toISOString().slice(0, 10)
      : String(r.expiryDate || '').slice(0, 10);
  return {
    id: r.id,
    name: r.name,
    genericName: r.genericName,
    category: r.category,
    form: r.form,
    strength: r.strength,
    location: r.location || 'Unassigned',
    stock: Number(r.stock) || 0,
    reorderLevel: Number(r.reorderLevel) || 0,
    expiryDate: expiry,
    updatedAt: new Date().toISOString(),
  };
}

function aggregatedInventorySql(whereClause = '') {
  return `
SELECT
  m.med_id AS id,
  m.name,
  m.generic_name AS genericName,
  m.category,
  m.form,
  m.strength,
  COALESCE(GROUP_CONCAT(DISTINCT loc.name ORDER BY loc.name SEPARATOR ' · '), 'Unassigned') AS location,
  COALESCE(SUM(b.quantity), 0) AS stock,
  m.reorder_level AS reorderLevel,
  DATE_FORMAT(
    COALESCE(
      MIN(CASE WHEN COALESCE(b.quantity, 0) > 0 THEN l.expiry_date END),
      (SELECT MIN(ml.expiry_date) FROM medication_lots ml WHERE ml.med_id = m.med_id)
    ),
    '%Y-%m-%d'
  ) AS expiryDate
FROM medications m
LEFT JOIN inventory_balances b ON b.med_id = m.med_id
LEFT JOIN locations loc ON loc.location_id = b.location_id
LEFT JOIN medication_lots l ON l.lot_id = b.lot_id
${whereClause}
GROUP BY m.med_id, m.name, m.generic_name, m.category, m.form, m.strength, m.reorder_level
`;
}

export function createMysqlAdapter(pool) {
  const api = {
    async findUserByCredentials(username, password) {
      const u = String(username || '').trim().toLowerCase();
      const p = String(password || '').trim();
      const [rows] = await pool.query(
        `SELECT id, username, display_name AS displayName, role, password_hash AS passwordHash FROM users WHERE username = ?`,
        [u]
      );
      if (!rows.length) return null;
      const row = rows[0];
      const ok = await bcrypt.compare(p, row.passwordHash);
      if (!ok) return null;
      return {
        id: String(row.id),
        username: row.username,
        displayName: row.displayName,
        role: String(row.role || '').trim().toLowerCase(),
      };
    },

    async findUserByUsername(username) {
      const u = String(username || '').trim().toLowerCase();
      const [rows] = await pool.query(
        `SELECT id, username, display_name AS displayName, role FROM users WHERE username = ?`,
        [u]
      );
      if (!rows.length) return null;
      const row = rows[0];
      return {
        id: String(row.id),
        username: row.username,
        displayName: row.displayName,
        role: String(row.role || '').trim().toLowerCase(),
      };
    },

    async listUsers() {
      const [rows] = await pool.query(
        `SELECT id, username, display_name AS displayName, role FROM users ORDER BY id`
      );
      return rows.map((row) => ({
        id: String(row.id),
        username: row.username,
        displayName: row.displayName,
        role: String(row.role || '').trim().toLowerCase(),
      }));
    },

    async createUser({ username, displayName, role, password }) {
      const normalized = String(username || '').trim().toLowerCase();
      const hash = await bcrypt.hash(String(password || ''), 10);
      try {
        const [result] = await pool.query(
          `INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)`,
          [normalized, String(displayName || '').trim(), String(role || '').trim().toLowerCase(), hash]
        );
        return {
          id: String(result.insertId),
          username: normalized,
          displayName: String(displayName || '').trim(),
          role: String(role || '').trim().toLowerCase(),
        };
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return null;
        throw e;
      }
    },

    async listInventory(filters) {
      const [rows] = await pool.query(aggregatedInventorySql());
      const items = rows.map((r) =>
        mapInventoryRow({
          id: r.id,
          name: r.name,
          genericName: r.genericName,
          category: r.category,
          form: r.form,
          strength: r.strength,
          location: r.location,
          stock: r.stock,
          reorderLevel: r.reorderLevel,
          expiryDate: r.expiryDate,
        })
      );

      const term = String(filters.search || '').trim().toLowerCase();
      const categoryValue = String(filters.category || 'all').trim();
      const statusValue = String(filters.status || 'all').trim();
      const now = new Date();
      const dayMs = 1000 * 60 * 60 * 24;

      return items.filter((m) => {
        if (term) {
          const combined = `${m.name} ${m.genericName} ${m.id} ${m.category} ${m.location}`.toLowerCase();
          if (!combined.includes(term)) return false;
        }
        if (categoryValue !== 'all' && m.category !== categoryValue) return false;
        if (statusValue !== 'all') {
          const days = Math.round((new Date(m.expiryDate).getTime() - now.getTime()) / dayMs);
          const isLow = m.stock <= m.reorderLevel;
          const isExpiring = days > 0 && days <= 60;
          const isExpired = days <= 0;
          if (statusValue === 'low' && !isLow) return false;
          if (statusValue === 'expiring' && !(isExpiring || isExpired)) return false;
          if (statusValue === 'ok' && (isLow || isExpiring || isExpired)) return false;
        }
        return true;
      });
    },

    async getInventoryById(id) {
      const [rows] = await pool.query(aggregatedInventorySql('WHERE m.med_id = ?'), [id]);
      if (!rows.length) return null;
      const r = rows[0];
      return mapInventoryRow({
        id: r.id,
        name: r.name,
        genericName: r.genericName,
        category: r.category,
        form: r.form,
        strength: r.strength,
        location: r.location,
        stock: r.stock,
        reorderLevel: r.reorderLevel,
        expiryDate: r.expiryDate,
      });
    },

    async createInventoryItem(item) {
      const id = String(item.id || '').trim();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [dupRows] = await conn.query(`SELECT med_id FROM medications WHERE med_id = ?`, [id]);
        if (dupRows.length) {
          await conn.rollback();
          return null;
        }

        await conn.query(
          `INSERT INTO medications (med_id, name, generic_name, category, form, strength, reorder_level, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            id,
            String(item.name),
            String(item.genericName || item.name),
            String(item.category),
            String(item.form),
            String(item.strength),
            Number(item.reorderLevel) || 0,
          ]
        );

        const locationName = String(item.location || 'Main Warehouse').trim() || 'Main Warehouse';
        const [locRows] = await conn.query(`SELECT location_id FROM locations WHERE name = ?`, [locationName]);
        let locationId = locRows[0]?.location_id;
        if (!locationId) {
          const [ins] = await conn.query(`INSERT INTO locations (name) VALUES (?)`, [locationName]);
          locationId = ins.insertId;
        }

        const lotNo = `API-${Date.now()}`;
        const [lotRes] = await conn.query(
          `INSERT INTO medication_lots (med_id, lot_number, expiry_date) VALUES (?, ?, ?)`,
          [id, lotNo, String(item.expiryDate).slice(0, 10)]
        );

        await conn.query(
          `INSERT INTO inventory_balances (med_id, location_id, lot_id, quantity) VALUES (?, ?, ?, ?)`,
          [id, locationId, lotRes.insertId, Number(item.stock) || 0]
        );

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      return api.getInventoryById(id);
    },

    async updateInventoryItem(id, patch) {
      const existing = await api.getInventoryById(id);
      if (!existing) return null;

      const merged = {
        ...existing,
        name: patch.name !== undefined ? String(patch.name) : existing.name,
        genericName: patch.genericName !== undefined ? String(patch.genericName) : existing.genericName,
        category: patch.category !== undefined ? String(patch.category) : existing.category,
        form: patch.form !== undefined ? String(patch.form) : existing.form,
        strength: patch.strength !== undefined ? String(patch.strength) : existing.strength,
        location: patch.location !== undefined ? String(patch.location) : existing.location,
        stock: patch.stock !== undefined ? Number(patch.stock) : existing.stock,
        reorderLevel: patch.reorderLevel !== undefined ? Number(patch.reorderLevel) : existing.reorderLevel,
        expiryDate: patch.expiryDate !== undefined ? String(patch.expiryDate).slice(0, 10) : existing.expiryDate,
      };

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `UPDATE medications SET name = ?, generic_name = ?, category = ?, form = ?, strength = ?, reorder_level = ? WHERE med_id = ?`,
          [
            merged.name,
            merged.genericName,
            merged.category,
            merged.form,
            merged.strength,
            merged.reorderLevel,
            id,
          ]
        );

        await conn.query(`DELETE FROM inventory_balances WHERE med_id = ?`, [id]);
        await conn.query(`DELETE FROM medication_lots WHERE med_id = ?`, [id]);

        const locationName = merged.location.trim() || 'Main Warehouse';
        const [locRows2] = await conn.query(`SELECT location_id FROM locations WHERE name = ?`, [locationName]);
        let locationId = locRows2[0]?.location_id;
        if (!locationId) {
          const [ins] = await conn.query(`INSERT INTO locations (name) VALUES (?)`, [locationName]);
          locationId = ins.insertId;
        }

        const lotNo = `API-${Date.now()}`;
        const [lotRes2] = await conn.query(
          `INSERT INTO medication_lots (med_id, lot_number, expiry_date) VALUES (?, ?, ?)`,
          [id, lotNo, merged.expiryDate]
        );
        await conn.query(
          `INSERT INTO inventory_balances (med_id, location_id, lot_id, quantity) VALUES (?, ?, ?, ?)`,
          [id, locationId, lotRes2.insertId, merged.stock]
        );

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      return api.getInventoryById(id);
    },

    async deleteInventoryItem(id) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(`DELETE FROM inventory_balances WHERE med_id = ?`, [id]);
        await conn.query(`DELETE FROM stock_movements WHERE med_id = ?`, [id]);
        await conn.query(`DELETE FROM medication_lots WHERE med_id = ?`, [id]);
        const [r] = await conn.query(`DELETE FROM medications WHERE med_id = ?`, [id]);
        await conn.commit();
        return r.affectedRows > 0;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
  };
  return api;
}
