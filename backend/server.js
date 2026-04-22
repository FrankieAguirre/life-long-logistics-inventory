// Life-Long Logistics inventory API — run: node backend/server.js
import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import { createInMemoryAdapter } from './dbAdapter.js';
import { createMysqlAdapter } from './mysqlAdapter.js';
import { createPool } from '../server/db.js';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4000);
const useMysql = process.env.USE_MYSQL === 'true' || process.env.USE_MYSQL === '1';

let db;
let mysqlPool = null;
if (useMysql) {
  mysqlPool = createPool();
  db = createMysqlAdapter(mysqlPool);
  mysqlPool
    .query('SELECT 1')
    .then(() => console.log('MySQL adapter connected.'))
    .catch((err) => {
      console.error('MySQL connection failed:', err.message);
      console.error('Set USE_MYSQL=false for in-memory mode, or fix DB_* in .env');
      process.exit(1);
    });
} else {
  db = createInMemoryAdapter();
  console.log('Using in-memory database (set USE_MYSQL=true for MySQL).');
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function writeError(res, status, code, message, details = []) {
  writeJson(res, status, {
    error: {
      code,
      message,
      details,
    },
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.socket.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function getTokenUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const username = token.replace(/^demo-token-/i, '');
  return db.findUserByUsername(username);
}

async function requireRole(req, res, allowedRoles) {
  const user = await getTokenUser(req);
  if (!user) {
    writeError(res, 401, 'UNAUTHORIZED', 'Missing or invalid token');
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    writeError(res, 403, 'FORBIDDEN', 'Insufficient role permissions');
    return null;
  }

  return user;
}

function getSummary(items) {
  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;
  let totalStock = 0;
  let lowStock = 0;
  let expiringSoon = 0;
  let okCount = 0;
  let lowCount = 0;
  let criticalCount = 0;
  let expiryCount = 0;

  for (const item of items) {
    totalStock += item.stock;
    const expiry = new Date(item.expiryDate);
    const days = Math.round((expiry.getTime() - now.getTime()) / dayMs);
    const isLow = item.stock <= item.reorderLevel;
    const isCritical = item.stock <= item.reorderLevel * 0.5 || days <= 0;
    const isExpiringSoon = days > 0 && days <= 60;

    if (isLow) lowStock += 1;
    if (isExpiringSoon || days <= 0) expiringSoon += 1;

    if (isCritical || days <= 0) {
      criticalCount += 1;
      if (isExpiringSoon || days <= 0) expiryCount += 1;
    } else if (isLow) {
      lowCount += 1;
    } else if (isExpiringSoon) {
      expiryCount += 1;
    } else {
      okCount += 1;
    }
  }

  const categoriesCount = new Set(items.map((i) => i.category)).size;
  const categories = [...new Set(items.map((i) => i.category))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );

  return {
    totalStock,
    lowStock,
    expiringSoon,
    categoriesCount,
    okCount,
    lowCount,
    criticalCount,
    expiryCount,
    categories,
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/health') {
    const payload = {
      status: 'ok',
      service: 'backend',
      mode: useMysql ? 'mysql' : 'memory',
      timestamp: new Date().toISOString(),
    };
    if (useMysql && mysqlPool) {
      try {
        await mysqlPool.query('SELECT 1');
        payload.database = process.env.DB_NAME || 'life-long-logistics-inventory-main';
      } catch (e) {
        payload.databaseError = e.message;
      }
    }
    writeJson(res, 200, payload);
    return;
  }

  if (req.method === 'POST' && path === '/api/auth/login') {
    try {
      const body = await parseBody(req);
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      const user = await db.findUserByCredentials(username, password);
      if (!user) {
        writeError(res, 401, 'AUTH_INVALID', 'Invalid username or password');
        return;
      }
      writeJson(res, 200, {
        user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
        token: `demo-token-${user.username}`,
      });
      return;
    } catch (err) {
      writeError(res, 400, 'VALIDATION_ERROR', err.message);
      return;
    }
  }

  if (req.method === 'POST' && path === '/api/auth/register') {
    try {
      const body = await parseBody(req);
      const username = String(body.username || '').trim().toLowerCase();
      const displayName = String(body.displayName || '').trim();
      const password = String(body.password || '').trim();
      const role = String(body.role || '').trim();

      if (!username || !displayName || !password || !role) {
        writeError(res, 400, 'VALIDATION_ERROR', 'username, displayName, password, and role are required');
        return;
      }
      if (password.length < 8) {
        writeError(res, 400, 'VALIDATION_ERROR', 'Password must be at least 8 characters');
        return;
      }
      const newUser = await db.createUser({ username, displayName, role, password });
      if (!newUser) {
        writeError(res, 409, 'CONFLICT', 'Username already exists');
        return;
      }

      writeJson(res, 201, {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        role: newUser.role,
      });
      return;
    } catch (err) {
      writeError(res, 400, 'VALIDATION_ERROR', err.message);
      return;
    }
  }

  if (req.method === 'GET' && path === '/api/auth/me') {
    const user = await getTokenUser(req);
    if (!user) {
      writeError(res, 401, 'UNAUTHORIZED', 'Missing or invalid token');
      return;
    }
    writeJson(res, 200, {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/inventory') {
    const user = await requireRole(req, res, ['backend', 'dba', 'frontend', 'pharmacy']);
    if (!user) return;

    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const category = String(url.searchParams.get('category') || 'all').trim();
    const status = String(url.searchParams.get('status') || 'all').trim();
    const requestedPage = parsePositiveInt(url.searchParams.get('page'), 1);
    const requestedPageSize = parsePositiveInt(url.searchParams.get('pageSize'), 10);
    const pageSize = Math.min(requestedPageSize, 100);

    const filteredItems = await db.listInventory({ search, category, status });
    const total = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const startIndex = (page - 1) * pageSize;
    const items = filteredItems.slice(startIndex, startIndex + pageSize);

    writeJson(res, 200, {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/inventory/summary') {
    const user = await requireRole(req, res, ['backend', 'dba', 'frontend', 'pharmacy']);
    if (!user) return;

    const items = await db.listInventory({});
    writeJson(res, 200, getSummary(items));
    return;
  }

  if (req.method === 'POST' && path === '/api/inventory') {
    const user = await requireRole(req, res, ['backend', 'dba']);
    if (!user) return;

    try {
      const body = await parseBody(req);
      const required = ['id', 'name', 'genericName', 'category', 'form', 'strength', 'location', 'stock', 'reorderLevel', 'expiryDate'];
      const missing = required.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
      if (missing.length) {
        writeError(res, 400, 'VALIDATION_ERROR', 'Missing required fields', missing);
        return;
      }
      const newItem = await db.createInventoryItem(body);
      if (!newItem) {
        writeError(res, 409, 'CONFLICT', 'Inventory id already exists');
        return;
      }

      writeJson(res, 201, newItem);
      return;
    } catch (err) {
      writeError(res, 400, 'VALIDATION_ERROR', err.message);
      return;
    }
  }

  if (req.method === 'PUT' && /^\/api\/inventory\/.+/.test(path)) {
    const user = await requireRole(req, res, ['backend', 'dba']);
    if (!user) return;

    try {
      const id = decodeURIComponent(path.split('/').pop());
      const existing = await db.getInventoryById(id);
      if (!existing) {
        writeError(res, 404, 'NOT_FOUND', 'Inventory item not found');
        return;
      }

      const body = await parseBody(req);
      const updated = await db.updateInventoryItem(id, body);
      writeJson(res, 200, updated);
      return;
    } catch (err) {
      writeError(res, 400, 'VALIDATION_ERROR', err.message);
      return;
    }
  }

  if (req.method === 'DELETE' && /^\/api\/inventory\/.+/.test(path)) {
    const user = await requireRole(req, res, ['backend', 'dba']);
    if (!user) return;

    const id = decodeURIComponent(path.split('/').pop());
    const deleted = await db.deleteInventoryItem(id);
    if (!deleted) {
      writeError(res, 404, 'NOT_FOUND', 'Inventory item not found');
      return;
    }

    writeJson(res, 200, { deleted: true, id });
    return;
  }

  writeError(res, 404, 'NOT_FOUND', 'Route not found');
});

server.listen(PORT, HOST, () => {
  console.log(`Life-Long backend listening on http://${HOST}:${PORT}`);
  console.log('Health: GET /api/health');
});
