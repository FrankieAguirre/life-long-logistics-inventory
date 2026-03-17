import { useEffect, useMemo, useState } from 'react';
import { medicines } from './data/medicines';
import './index.css';

function getDaysUntilExpiry(dateString) {
  const today = new Date();
  const expiry = new Date(dateString);
  const diff = expiry.getTime() - today.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function getStatusFlags(med) {
  const daysToExpiry = getDaysUntilExpiry(med.expiryDate);
  const isLow = med.stock <= med.reorderLevel;
  const isCritical = med.stock <= med.reorderLevel * 0.5 || daysToExpiry <= 0;
  const isExpiringSoon = daysToExpiry > 0 && daysToExpiry <= 60;
  return { daysToExpiry, isLow, isCritical, isExpiringSoon };
}

const AUTH_STORAGE_KEY = 'aurora-hospital-users';
const SESSION_STORAGE_KEY = 'aurora-hospital-session';

function loadUsers() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return [
        {
          username: 'frankie',
          displayName: 'Frankie – Frontend & UI',
          role: 'frontend',
          password: 'demo1234',
        },
      ];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return [];
}

function persistUsers(users) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));
}

function loadSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(user) {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
  }
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('frontend');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedUser = username.trim().toLowerCase();
    const trimmedDisplay = displayName.trim();
    const trimmedPass = password.trim();
    if (!trimmedUser || !trimmedPass) {
      setError('Please enter both username and password.');
      return;
    }
    if (trimmedPass.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }

    const users = loadUsers();

    if (mode === 'signup') {
      if (!trimmedDisplay) {
        setError('Please enter your full name for the account.');
        return;
      }
      const exists = users.some((u) => u.username === trimmedUser);
      if (exists) {
        setError('That username is already in use. Try logging in instead.');
        return;
      }
      const newUser = {
        username: trimmedUser,
        displayName: trimmedDisplay,
        role,
        password: trimmedPass,
      };
      const nextUsers = [...users, newUser];
      persistUsers(nextUsers);
      persistSession({ username: newUser.username, displayName: newUser.displayName, role: newUser.role });
      onAuthenticated(newUser);
    } else {
      const user = users.find((u) => u.username === trimmedUser && u.password === trimmedPass);
      if (!user) {
        setError('Invalid username or password.');
        return;
      }
      persistSession({ username: user.username, displayName: user.displayName, role: user.role });
      onAuthenticated(user);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-card" role="dialog" aria-modal="true">
        <div className="auth-header">
          <div>
            <div className="auth-kicker">Life-Long Logistics · Hospital Inventory</div>
            <h1 className="auth-title">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h1>
          </div>
          <div className="auth-toggle">
            {mode === 'login' ? (
              <>
                <span>New user? </span>
                <button type="button" onClick={() => { setMode('signup'); setError(''); }}>
                  Create account
                </button>
              </>
            ) : (
              <>
                <span>Already registered? </span>
                <button type="button" onClick={() => { setMode('login'); setError(''); }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="auth-input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., frankie"
            />
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="displayName">
                Full name
              </label>
              <input
                id="displayName"
                className="auth-input"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Frankie – Frontend & UI"
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="auth-input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
            <p className="auth-hint">
              In a production hospital system passwords would be hashed, salted, and never stored in plain text.
            </p>
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <div className="auth-label">Role</div>
              <select
                className="auth-select"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="dba">Briana – Database admin / QA</option>
                <option value="backend">Asher – Project manager / backend</option>
                <option value="frontend">Frankie – Frontend / UI</option>
                <option value="pharmacy">Pharmacist / Inventory user</option>
              </select>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit">
            {mode === 'login' ? 'Sign in' : 'Create account & continue'}
          </button>
        </form>

      </div>
    </div>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const sessionUser = loadSession();
    if (sessionUser) {
      setCurrentUser(sessionUser);
    }
  }, []);

  const enriched = useMemo(
    () =>
      medicines.map((m) => {
        const flags = getStatusFlags(m);
        return { ...m, ...flags };
      }),
    []
  );

  const totals = useMemo(() => {
    const totalStock = enriched.reduce((sum, m) => sum + m.stock, 0);
    const lowStock = enriched.filter((m) => m.isLow).length;
    const expiringSoon = enriched.filter((m) => m.isExpiringSoon || m.daysToExpiry <= 0).length;
    const categories = new Set(enriched.map((m) => m.category));
    return { totalStock, lowStock, expiringSoon, categoriesCount: categories.size };
  }, [enriched]);

  const categories = useMemo(
    () => Array.from(new Set(enriched.map((m) => m.category))).sort(),
    [enriched]
  );

  const filtered = useMemo(() => {
    return enriched.filter((m) => {
      const term = search.trim().toLowerCase();
      if (term) {
        const combined = `${m.name} ${m.genericName} ${m.id} ${m.category} ${m.location}`.toLowerCase();
        if (!combined.includes(term)) return false;
      }

      if (categoryFilter !== 'all' && m.category !== categoryFilter) {
        return false;
      }

      if (statusFilter === 'low' && !m.isLow) return false;
      if (statusFilter === 'expiring' && !(m.isExpiringSoon || m.daysToExpiry <= 0)) return false;
      if (statusFilter === 'ok' && (m.isLow || m.isExpiringSoon || m.daysToExpiry <= 0)) return false;

      return true;
    });
  }, [enriched, search, categoryFilter, statusFilter]);

  const { okCount, lowCount, criticalCount, expiryCount } = useMemo(() => {
    let ok = 0;
    let low = 0;
    let critical = 0;
    let expiry = 0;
    for (const m of enriched) {
      if (m.isCritical || m.daysToExpiry <= 0) {
        critical += 1;
        expiry += m.isExpiringSoon || m.daysToExpiry <= 0 ? 1 : 0;
      } else if (m.isLow) {
        low += 1;
      } else if (m.isExpiringSoon) {
        expiry += 1;
      } else {
        ok += 1;
      }
    }
    return { okCount: ok, lowCount: low, criticalCount: critical, expiryCount: expiry };
  }, [enriched]);

  if (!currentUser) {
    return <AuthScreen onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="app-root">
      <aside className="app-sidebar">
        <div>
          <div className="sidebar-brand">
            <div className="sidebar-logo" aria-hidden="true" />
            <div>
              <div className="sidebar-title">Life-Long Logistics</div>
              <div className="sidebar-subtitle">Inventory Dashboard</div>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="sidebar-section-label">Navigation</div>
            <div className="sidebar-nav">
              <div className="sidebar-link sidebar-link--active">
                <span>Inventory</span>
                <span className="sidebar-link-kpi">
                  {lowCount + criticalCount} alerts
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="main-header">
          <div>
            <div className="main-kicker">Hospital Inventory Management</div>
            <h1 className="main-title">Life-Long Logistics – Inventory Dashboard</h1>
          </div>
          <div className="main-header-meta">
            <div className="badge-text">
              Signed in as <span className="text-strong">{currentUser.displayName}</span>
            </div>
            <div className="pill">
              <span className="pill-dot pill-dot--ok" />
              <span>{okCount} stable items</span>
            </div>
            <div className="pill">
              <span className="pill-dot pill-dot--warn" />
              <span>{lowCount} low stock</span>
            </div>
            <div className="pill">
              <span className="pill-dot pill-dot--alert" />
              <span>{criticalCount} critical / expired</span>
            </div>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                persistSession(null);
                setCurrentUser(null);
              }}
            >
              Log out
            </button>
          </div>
        </header>

        <section className="summary-grid" aria-label="Inventory summary">
          <div className="summary-card">
            <div className="summary-label">Total stock units</div>
            <div className="summary-value">
              {totals.totalStock.toLocaleString('en-US')}
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-label">Items below reorder level</div>
            <div className="summary-value">{totals.lowStock}</div>
          </div>
        </section>

        <section className="inventory-card" aria-label="Inventory table">
          <div className="inventory-header">
            <div>
              <div className="inventory-title">Medication Master List</div>
            </div>
            <div className="inventory-controls">
              <input
                className="search-input"
                type="search"
                placeholder="Search by name, ID, category, or location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="select-input"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <div className="chip-filter-group" aria-label="Status filter">
                <button
                  type="button"
                  className={`chip-filter ${statusFilter === 'all' ? 'chip-filter--active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`chip-filter ${statusFilter === 'ok' ? 'chip-filter--active' : ''}`}
                  onClick={() => setStatusFilter('ok')}
                >
                  Stable
                </button>
                <button
                  type="button"
                  className={`chip-filter ${statusFilter === 'low' ? 'chip-filter--active' : ''}`}
                  onClick={() => setStatusFilter('low')}
                >
                  Low stock
                </button>
                <button
                  type="button"
                  className={`chip-filter ${
                    statusFilter === 'expiring' ? 'chip-filter--active' : ''
                  }`}
                  onClick={() => setStatusFilter('expiring')}
                >
                  Expiring soon
                </button>
              </div>
            </div>
          </div>

          <div className="inventory-table-wrapper" role="region" aria-label="Inventory data table">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Medication</th>
                  <th>Category</th>
                  <th>Form / Strength</th>
                  <th>Location</th>
                  <th>Stock</th>
                  <th>Reorder</th>
                  <th>Expiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const { daysToExpiry, isLow, isCritical, isExpiringSoon } = m;
                  let statusLabel = 'On track';
                  let statusClass = 'pill-status pill-status--ok';

                  if (isCritical || daysToExpiry <= 0) {
                    statusLabel = daysToExpiry <= 0 ? 'Expired' : 'Critical';
                    statusClass = 'pill-status pill-status--critical';
                  } else if (isLow) {
                    statusLabel = 'Low stock';
                    statusClass = 'pill-status pill-status--low';
                  } else if (isExpiringSoon) {
                    statusLabel = 'Expiring soon';
                    statusClass = 'pill-status pill-status--expiry';
                  }

                  return (
                    <tr key={m.id}>
                      <td className="nowrap">
                        <span className="tag">{m.id}</span>
                      </td>
                      <td>
                        <div className="text-strong">{m.name}</div>
                        <div className="text-soft">{m.genericName}</div>
                      </td>
                      <td>{m.category}</td>
                      <td>
                        {m.form} · {m.strength}
                      </td>
                      <td>{m.location}</td>
                      <td>
                        {m.stock.toLocaleString('en-US')}
                        {isLow && (
                          <span className="badge-text"> · below target</span>
                        )}
                      </td>
                      <td>{m.reorderLevel.toLocaleString('en-US')}</td>
                      <td>
                        <div>{m.expiryDate}</div>
                        <div className="badge-text">
                          {daysToExpiry > 0
                            ? `${daysToExpiry} days`
                            : 'Expired'}
                        </div>
                      </td>
                      <td>
                        <span className={statusClass}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="badge-text" style={{ marginTop: '0.4rem' }}>
            This is a front‑end prototype: updates are calculated in memory, but the design assumes a
            centralized database table capturing stock, usage events, and expiry data for each medication.
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

