// Database adapter boundary for backend routes.
// Swap createInMemoryAdapter with createMysqlAdapter without changing route logic.

function clone(item) {
  return JSON.parse(JSON.stringify(item));
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function createInMemoryAdapter() {
  const users = [
    {
      id: 'u_1',
      username: 'frankie',
      displayName: 'Frankie',
      role: 'frontend',
      password: 'demo1234',
      createdAt: new Date().toISOString(),
    },
  ];

  const inventory = [
    {
      id: 'MED-0003',
      name: 'Amoxicillin',
      genericName: 'Amoxicillin',
      category: 'Antibiotic',
      form: 'Capsule',
      strength: '500 mg',
      location: 'Antibiotics · Bay B1',
      stock: 420,
      reorderLevel: 600,
      expiryDate: '2026-05-12',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'MED-0011',
      name: 'Omeprazole',
      genericName: 'Omeprazole',
      category: 'Gastrointestinal',
      form: 'Capsule (Delayed Release)',
      strength: '20 mg',
      location: 'GI · Shelf G1',
      stock: 980,
      reorderLevel: 700,
      expiryDate: '2027-08-14',
      updatedAt: new Date().toISOString(),
    },
  ];

  return {
    async findUserByCredentials(username, password) {
      const normalized = String(username || '').trim().toLowerCase();
      const pass = String(password || '').trim();
      const user = users.find((u) => u.username === normalized && u.password === pass);
      return user ? clone(user) : null;
    },

    async findUserByUsername(username) {
      const normalized = String(username || '').trim().toLowerCase();
      const user = users.find((u) => u.username === normalized);
      return user ? clone(user) : null;
    },

    async listUsers() {
      return users.map(clone);
    },

    async createUser({ username, displayName, role, password }) {
      const normalized = String(username || '').trim().toLowerCase();
      if (users.some((u) => u.username === normalized)) return null;

      const newUser = {
        id: `u_${users.length + 1}`,
        username: normalized,
        displayName: String(displayName || '').trim(),
        role: normalizeRole(role),
        password: String(password || ''),
        createdAt: new Date().toISOString(),
      };

      users.push(newUser);
      return {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        role: newUser.role,
      };
    },

    async listInventory({ search, category, status }) {
      const term = String(search || '').trim().toLowerCase();
      const categoryValue = String(category || 'all').trim();
      const statusValue = String(status || 'all').trim();
      const now = new Date();
      const dayMs = 1000 * 60 * 60 * 24;

      return inventory
        .filter((m) => {
          if (term) {
            const combined = `${m.name} ${m.genericName} ${m.id} ${m.category} ${m.location}`.toLowerCase();
            if (!combined.includes(term)) return false;
          }

          if (categoryValue !== 'all' && m.category !== categoryValue) {
            return false;
          }

          if (statusValue !== 'all') {
            const days = Math.round((new Date(m.expiryDate).getTime() - now.getTime()) / dayMs);
            const isLow = m.stock <= m.reorderLevel;
            const isExpiring = days > 0 && days <= 60;
            const isExpired = days <= 0;
            const isAlert = isLow || isExpiring || isExpired;

            if (statusValue === 'low' && !isLow) return false;
            if (statusValue === 'expiring' && !(isExpiring || isExpired)) return false;
            if (statusValue === 'ok' && isAlert) return false;
          }

          return true;
        })
        .map(clone);
    },

    async getInventoryById(id) {
      const value = inventory.find((m) => m.id === id);
      return value ? clone(value) : null;
    },

    async createInventoryItem(item) {
      const id = String(item.id || '').trim();
      if (inventory.some((m) => m.id === id)) return null;

      const newItem = {
        id,
        name: String(item.name),
        genericName: String(item.genericName),
        category: String(item.category),
        form: String(item.form),
        strength: String(item.strength),
        location: String(item.location),
        stock: Number(item.stock),
        reorderLevel: Number(item.reorderLevel),
        expiryDate: String(item.expiryDate),
        updatedAt: new Date().toISOString(),
      };

      inventory.push(newItem);
      return clone(newItem);
    },

    async updateInventoryItem(id, patch) {
      const index = inventory.findIndex((m) => m.id === id);
      if (index === -1) return null;

      const existing = inventory[index];
      const updated = {
        ...existing,
        ...patch,
        stock: patch.stock !== undefined ? Number(patch.stock) : existing.stock,
        reorderLevel: patch.reorderLevel !== undefined ? Number(patch.reorderLevel) : existing.reorderLevel,
        updatedAt: new Date().toISOString(),
      };

      inventory[index] = updated;
      return clone(updated);
    },

    async deleteInventoryItem(id) {
      const index = inventory.findIndex((m) => m.id === id);
      if (index === -1) return false;
      inventory.splice(index, 1);
      return true;
    },
  };
}
