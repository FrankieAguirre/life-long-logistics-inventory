import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { medicines } from './data/medicines';
import { authApi, inventoryApi, setAuthToken } from './services/apiClient';
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
const USE_LIVE_API = import.meta.env.VITE_USE_LIVE_API !== 'false';

function csvEscape(value) {
  const t = String(value ?? '');
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function buildInventoryCsv(rows) {
  const headers = [
    'id',
    'name',
    'genericName',
    'category',
    'form',
    'strength',
    'location',
    'stock',
    'reorderLevel',
    'expiryDate',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      headers.map((h) => csvEscape(r[h])).join(',')
    );
  }
  return `\ufeff${lines.join('\n')}`;
}

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
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.user) return parsed;
    if (parsed?.username) {
      return {
        user: {
          username: parsed.username,
          displayName: parsed.displayName,
          role: parsed.role,
        },
        token: parsed.token || null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function persistSession(session) {
  if (typeof window === 'undefined') return;
  if (!session) {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

function HospitalLogoMark({ className = '', title = 'Life-Long Logistics' }) {
  const gradId = `lllLogoGrad-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={`hospital-logo ${className}`.trim()}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="14" fill={`url(#${gradId})`} />
      <path
        d="M32 18v28M18 32h28"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AuthScreen({ onAuthenticated, useLiveApi }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('frontend');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

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

    setError('');
    setIsSubmitting(true);

    try {
      if (useLiveApi) {
        if (mode === 'signup') {
          if (!trimmedDisplay) {
            setError('Please enter your full name for the account.');
            setIsSubmitting(false);
            return;
          }
          await authApi.register({
            username: trimmedUser,
            displayName: trimmedDisplay,
            password: trimmedPass,
            role,
          });
        }

        const loginResult = await authApi.login(trimmedUser, trimmedPass);
        const nextSession = { user: loginResult.user, token: loginResult.token };
        setAuthToken(loginResult.token);
        persistSession(nextSession);
        onAuthenticated(nextSession);
        return;
      }

      const users = loadUsers();

      if (mode === 'signup') {
        if (!trimmedDisplay) {
          setError('Please enter your full name for the account.');
          setIsSubmitting(false);
          return;
        }
        const exists = users.some((u) => u.username === trimmedUser);
        if (exists) {
          setError('That username is already in use. Try logging in instead.');
          setIsSubmitting(false);
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
        const nextSession = {
          user: { username: newUser.username, displayName: newUser.displayName, role: newUser.role },
          token: null,
        };
        persistSession(nextSession);
        onAuthenticated(nextSession);
      } else {
        const user = users.find((u) => u.username === trimmedUser && u.password === trimmedPass);
        if (!user) {
          setError('Invalid username or password.');
          setIsSubmitting(false);
          return;
        }
        const nextSession = {
          user: { username: user.username, displayName: user.displayName, role: user.role },
          token: null,
        };
        persistSession(nextSession);
        onAuthenticated(nextSession);
      }
    } catch (err) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <a href="#auth-main" className="skip-link">
        Skip to sign in form
      </a>
      <div className="auth-root">
        <div className="auth-card" id="auth-main" role="dialog" aria-modal="true">
        <div className="auth-header">
          <div>
            <div className="auth-kicker">Life-Long Logistics · Hospital Inventory</div>
            <HospitalLogoMark className="auth-brand-logo" />
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

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account & continue'}
          </button>
        </form>
        </div>
      </div>
    </>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authToken, setAuthTokenState] = useState(null);
  const [inventoryItems, setInventoryItems] = useState(() => (USE_LIVE_API ? [] : medicines));
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [apiSummary, setApiSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [livePagination, setLivePagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [reloadTick, setReloadTick] = useState(0);
  const [createError, setCreateError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');
  const [newItem, setNewItem] = useState({
    id: '',
    name: '',
    category: 'General',
    stock: '0',
    reorderLevel: '0',
    expiryDate: '',
  });

  const toastIdRef = useRef(0);
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((message, variant = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const deleteDialogRef = useRef(null);
  const navDialogRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManageInventory = currentUser?.role === 'backend' || currentUser?.role === 'dba';

  useEffect(() => {
    document.title = currentUser
      ? `Inventory · Life-Long Logistics`
      : `Sign in · Life-Long Logistics`;
  }, [currentUser]);

  useEffect(() => {
    const session = loadSession();
    if (session?.user) {
      setCurrentUser(session.user);
      setAuthTokenState(session.token || null);
      setAuthToken(session.token || null);
    }
  }, []);

  useEffect(() => {
    if (!USE_LIVE_API || !currentUser) return;
    if (!authToken) {
      setApiSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await inventoryApi.summary();
        if (!cancelled) setApiSummary(s);
      } catch {
        if (!cancelled) setApiSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, authToken, reloadTick]);

  useEffect(() => {
    if (!USE_LIVE_API || !currentUser) return;

    if (!authToken) {
      setInventoryError('Missing session token. Please sign in again.');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setInventoryLoading(true);
        setInventoryError('');
        const result = await inventoryApi.list({
          search,
          category: categoryFilter,
          status: statusFilter,
          page,
          pageSize,
          signal: controller.signal,
        });
        setInventoryItems(result.items || []);
        const nextPagination = result.pagination || {
          page,
          pageSize,
          total: result.items?.length || 0,
          totalPages: 1,
        };
        setLivePagination(nextPagination);
        if (nextPagination.page !== page) {
          setPage(nextPagination.page);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setInventoryError(err?.message || 'Unable to load inventory data.');
        }
      } finally {
        setInventoryLoading(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [currentUser, authToken, search, categoryFilter, statusFilter, page, pageSize, reloadTick]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter, pageSize]);

  const enriched = useMemo(
    () =>
      inventoryItems.map((m) => {
        const flags = getStatusFlags(m);
        return { ...m, ...flags };
      }),
    [inventoryItems]
  );

  const totals = useMemo(() => {
    if (USE_LIVE_API && apiSummary) {
      return {
        totalStock: apiSummary.totalStock,
        lowStock: apiSummary.lowStock,
        expiringSoon: apiSummary.expiringSoon,
        categoriesCount: apiSummary.categoriesCount,
      };
    }
    const totalStock = enriched.reduce((sum, m) => sum + m.stock, 0);
    const lowStock = enriched.filter((m) => m.isLow).length;
    const expiringSoon = enriched.filter((m) => m.isExpiringSoon || m.daysToExpiry <= 0).length;
    const categories = new Set(enriched.map((m) => m.category));
    return { totalStock, lowStock, expiringSoon, categoriesCount: categories.size };
  }, [enriched, apiSummary]);

  const categories = useMemo(() => {
    if (USE_LIVE_API && apiSummary?.categories?.length) {
      return apiSummary.categories;
    }
    return Array.from(new Set(enriched.map((m) => m.category))).sort();
  }, [enriched, apiSummary]);

  const filtered = useMemo(() => {
    if (USE_LIVE_API) {
      return enriched;
    }

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

  const mockTotalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered, pageSize]);

  useEffect(() => {
    if (USE_LIVE_API) return;
    if (page > mockTotalPages) {
      setPage(mockTotalPages);
    }
  }, [page, mockTotalPages]);

  const pagedRows = useMemo(() => {
    if (USE_LIVE_API) {
      return filtered;
    }

    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const totalItemsDisplay = USE_LIVE_API ? livePagination.total : filtered.length;
  const totalPagesDisplay = USE_LIVE_API ? livePagination.totalPages : mockTotalPages;
  const currentPageDisplay = USE_LIVE_API ? livePagination.page : page;

  const exportCurrentPageCsv = useCallback(() => {
    if (!pagedRows.length) {
      pushToast('No rows on this page to export.', 'error');
      return;
    }
    const blob = new Blob([buildInventoryCsv(pagedRows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-page-${currentPageDisplay}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Exported ${pagedRows.length} row(s) from this page.`, 'success');
  }, [pagedRows, currentPageDisplay, pushToast]);

  const closeDeleteDialog = useCallback(() => {
    deleteDialogRef.current?.close();
    setDeleteTarget(null);
  }, []);

  const requestDelete = useCallback((item) => {
    setDeleteTarget({ id: item.id, name: item.name });
    window.queueMicrotask(() => deleteDialogRef.current?.showModal());
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id: itemId, name } = deleteTarget;
    setActionBusyId(itemId);
    try {
      if (USE_LIVE_API) {
        await inventoryApi.remove(itemId);
        setReloadTick((v) => v + 1);
      } else {
        setInventoryItems((prev) => prev.filter((x) => x.id !== itemId));
      }
      pushToast(`Removed ${name} (${itemId})`, 'success');
    } catch (err) {
      const msg = err?.message || 'Unable to delete item.';
      setInventoryError(msg);
      pushToast(msg, 'error');
    } finally {
      setActionBusyId('');
      closeDeleteDialog();
    }
  }, [deleteTarget, pushToast, closeDeleteDialog]);

  const { okCount, lowCount, criticalCount, expiryCount } = useMemo(() => {
    if (USE_LIVE_API && apiSummary) {
      return {
        okCount: apiSummary.okCount,
        lowCount: apiSummary.lowCount,
        criticalCount: apiSummary.criticalCount,
        expiryCount: apiSummary.expiryCount,
      };
    }
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
  }, [enriched, apiSummary]);

  const handleCreateItem = async (event) => {
    event.preventDefault();
    if (createBusy) return;

    const id = newItem.id.trim();
    const name = newItem.name.trim();
    const category = newItem.category.trim();
    const stock = Number(newItem.stock);
    const reorderLevel = Number(newItem.reorderLevel);
    const expiryDate = newItem.expiryDate;

    if (!id || !name || !category || !expiryDate) {
      setCreateError('ID, name, category, and expiry date are required.');
      return;
    }

    if (Number.isNaN(stock) || Number.isNaN(reorderLevel) || stock < 0 || reorderLevel < 0) {
      setCreateError('Stock and reorder level must be non-negative numbers.');
      return;
    }

    const payload = {
      id,
      name,
      genericName: name,
      category,
      form: 'Tablet',
      strength: 'N/A',
      location: 'Main Warehouse',
      stock,
      reorderLevel,
      expiryDate,
    };

    setCreateError('');
    setCreateBusy(true);

    try {
      if (USE_LIVE_API) {
        await inventoryApi.create(payload);
        setPage(1);
        setReloadTick((value) => value + 1);
      } else {
        setInventoryItems((prev) => [{ ...payload, updatedAt: new Date().toISOString() }, ...prev]);
      }

      pushToast(`Added ${name} (${id}) to inventory.`, 'success');

      setNewItem({
        id: '',
        name: '',
        category: newItem.category,
        stock: '0',
        reorderLevel: '0',
        expiryDate: '',
      });
    } catch (err) {
      setCreateError(err?.message || 'Unable to create item.');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleAdjustStock = async (item, delta) => {
    if (actionBusyId) return;
    const nextStock = Math.max(0, Number(item.stock) + delta);
    setActionBusyId(item.id);

    try {
      if (USE_LIVE_API) {
        await inventoryApi.update(item.id, { stock: nextStock });
        setReloadTick((value) => value + 1);
      } else {
        setInventoryItems((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, stock: nextStock, updatedAt: new Date().toISOString() } : x
          )
        );
      }
      pushToast(`Stock for ${item.name} set to ${nextStock.toLocaleString('en-US')}.`, 'success');
    } catch (err) {
      setInventoryError(err?.message || 'Unable to update stock.');
    } finally {
      setActionBusyId('');
    }
  };

  if (!currentUser) {
    return (
      <AuthScreen
        useLiveApi={USE_LIVE_API}
        onAuthenticated={(session) => {
          setCurrentUser(session.user);
          setAuthTokenState(session.token || null);
        }}
      />
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="app-root">
      <aside className="app-sidebar" aria-label="Main navigation">
        <div>
          <div className="sidebar-brand">
            <div className="sidebar-brand-text">
              <div className="sidebar-title">Life-Long Logistics</div>
              <div className="sidebar-subtitle">Inventory Dashboard</div>
            </div>
            <HospitalLogoMark className="sidebar-brand-logo" />
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

      <main id="main-content" className="app-main">
        <header className="main-header">
          <div className="main-header__lead">
            <button
              type="button"
              className="menu-trigger"
              aria-label="Open navigation menu"
              onClick={() => navDialogRef.current?.showModal()}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div>
            <div className="main-kicker">Hospital Inventory Management</div>
            <h1 className="main-title">Life-Long Logistics – Inventory Dashboard</h1>
            </div>
          </div>
          <div className="main-header-meta">
            <div className="badge-text">
              Signed in as <span className="text-strong">{currentUser.displayName}</span>
            </div>
            <div className="badge-text">
              Data source:{' '}
              <span className="text-strong">{USE_LIVE_API ? 'Live API' : 'Mock data'}</span>
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
            <div className="pill">
              <span className="pill-dot pill-dot--warn" />
              <span>{expiryCount} expiring window</span>
            </div>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                persistSession(null);
                setAuthToken(null);
                setCurrentUser(null);
                setAuthTokenState(null);
                setApiSummary(null);
              }}
            >
              Log out
            </button>
          </div>
        </header>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {USE_LIVE_API && inventoryLoading ? 'Loading inventory data.' : ''}
        </div>

        {inventoryError && (
          <div className="auth-error" style={{ marginBottom: '0.75rem' }} role="alert">
            {inventoryError}
          </div>
        )}

        {canManageInventory && (
          <section className="inventory-card" aria-labelledby="add-med-heading">
            <div className="inventory-title" id="add-med-heading">
              Add medication
            </div>
            <form className="inventory-create-row" onSubmit={handleCreateItem}>
              <input
                className="search-input"
                type="text"
                name="newMedId"
                autoComplete="off"
                placeholder="ID (e.g., MED-9001)"
                aria-label="Medication ID"
                value={newItem.id}
                onChange={(e) => setNewItem((prev) => ({ ...prev, id: e.target.value }))}
              />
              <input
                className="search-input"
                type="text"
                name="newMedName"
                autoComplete="off"
                placeholder="Medication name"
                aria-label="Medication name"
                value={newItem.name}
                onChange={(e) => setNewItem((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="search-input"
                type="text"
                name="newMedCategory"
                autoComplete="off"
                placeholder="Category"
                aria-label="Category"
                value={newItem.category}
                onChange={(e) => setNewItem((prev) => ({ ...prev, category: e.target.value }))}
              />
              <input
                className="search-input"
                type="number"
                min="0"
                name="newMedStock"
                placeholder="Stock"
                aria-label="Stock on hand"
                value={newItem.stock}
                onChange={(e) => setNewItem((prev) => ({ ...prev, stock: e.target.value }))}
              />
              <input
                className="search-input"
                type="number"
                min="0"
                name="newMedReorder"
                placeholder="Reorder"
                aria-label="Reorder level"
                value={newItem.reorderLevel}
                onChange={(e) => setNewItem((prev) => ({ ...prev, reorderLevel: e.target.value }))}
              />
              <input
                className="search-input"
                type="date"
                name="newMedExpiry"
                aria-label="Expiry date"
                value={newItem.expiryDate}
                onChange={(e) => setNewItem((prev) => ({ ...prev, expiryDate: e.target.value }))}
              />
              <button type="submit" className="btn-outline" disabled={createBusy}>
                {createBusy ? 'Adding…' : 'Add item'}
              </button>
            </form>
            {createError && (
              <div id="add-med-errors" className="auth-error" role="alert">
                {createError}
              </div>
            )}
          </section>
        )}

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

          <div className="summary-card">
            <div className="summary-label">Categories tracked</div>
            <div className="summary-value">{totals.categoriesCount}</div>
          </div>
        </section>

        <section className="inventory-card" aria-labelledby="master-list-heading">
          <div className="inventory-header">
            <div>
              <div className="inventory-title" id="master-list-heading">
                Medication master list
              </div>
            </div>
            <div className="inventory-controls">
              <label htmlFor="inventory-search" className="sr-only">
                Search inventory
              </label>
              <input
                id="inventory-search"
                className="search-input"
                type="search"
                placeholder="Search by name, ID, category, or location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label htmlFor="inventory-category" className="sr-only">
                Filter by category
              </label>
              <select
                id="inventory-category"
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
              <div className="chip-filter-group" role="group" aria-label="Filter by stock status">
                <button
                  type="button"
                  className={`chip-filter ${statusFilter === 'all' ? 'chip-filter--active' : ''}`}
                  aria-pressed={statusFilter === 'all'}
                  onClick={() => setStatusFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`chip-filter ${statusFilter === 'ok' ? 'chip-filter--active' : ''}`}
                  aria-pressed={statusFilter === 'ok'}
                  onClick={() => setStatusFilter('ok')}
                >
                  Stable
                </button>
                <button
                  type="button"
                  className={`chip-filter ${statusFilter === 'low' ? 'chip-filter--active' : ''}`}
                  aria-pressed={statusFilter === 'low'}
                  onClick={() => setStatusFilter('low')}
                >
                  Low stock
                </button>
                <button
                  type="button"
                  className={`chip-filter ${statusFilter === 'expiring' ? 'chip-filter--active' : ''}`}
                  aria-pressed={statusFilter === 'expiring'}
                  onClick={() => setStatusFilter('expiring')}
                >
                  Expiring soon
                </button>
              </div>
            </div>
          </div>

          <div className="inventory-toolbar">
            <button type="button" className="btn-ghost" onClick={exportCurrentPageCsv}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export page (CSV)
            </button>
            <button type="button" className="btn-ghost" onClick={() => window.print()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Print report
            </button>
          </div>

          <div
            className="inventory-table-wrapper"
            role="region"
            aria-labelledby="master-list-heading"
            aria-busy={USE_LIVE_API && inventoryLoading ? 'true' : 'false'}
          >
            {USE_LIVE_API && inventoryLoading ? (
              <div className="table-skeleton" aria-hidden="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={`sk-${i}`} className="table-skeleton__row">
                    <div className="table-skeleton__cell" style={{ width: '14%' }} />
                    <div className="table-skeleton__cell" style={{ flex: '1 1 22%' }} />
                    <div className="table-skeleton__cell" style={{ width: '14%' }} />
                    <div className="table-skeleton__cell" style={{ width: '16%' }} />
                    <div className="table-skeleton__cell" style={{ width: '18%' }} />
                    <div className="table-skeleton__cell" style={{ width: '10%' }} />
                  </div>
                ))}
              </div>
            ) : pagedRows.length === 0 ? (
              <div className="empty-state">
                <svg className="empty-state__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <h2 className="empty-state__title">No medications match</h2>
                <p className="empty-state__hint">
                  Try clearing the search box, setting category to &quot;All categories&quot;, or choosing
                  &quot;All&quot; in the status filters.
                </p>
                <button
                  type="button"
                  className="btn-outline empty-state__reset"
                  onClick={() => {
                    setSearch('');
                    setCategoryFilter('all');
                    setStatusFilter('all');
                  }}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <table className="inventory-table">
                <caption>
                  Current results — page {currentPageDisplay} of {totalPagesDisplay} ({totalItemsDisplay} items
                  total).
                </caption>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Medication</th>
                    <th scope="col">Category</th>
                    <th scope="col">Form / strength</th>
                    <th scope="col">Location</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Reorder</th>
                    <th scope="col">Expiry</th>
                    <th scope="col">Status</th>
                    {canManageInventory && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                {pagedRows.map((m) => {
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
                        {isLow && <span className="badge-text"> · below target</span>}
                      </td>
                      <td>{m.reorderLevel.toLocaleString('en-US')}</td>
                      <td>
                        <div>{m.expiryDate}</div>
                        <div className="badge-text">
                          {daysToExpiry > 0 ? `${daysToExpiry} days` : 'Expired'}
                        </div>
                      </td>
                      <td>
                        <span className={statusClass}>{statusLabel}</span>
                      </td>
                      {canManageInventory && (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn-outline"
                              disabled={actionBusyId === m.id}
                              onClick={() => handleAdjustStock(m, 10)}
                            >
                              +10
                            </button>
                            <button
                              type="button"
                              className="btn-outline"
                              disabled={actionBusyId === m.id || m.stock <= 0}
                              onClick={() => handleAdjustStock(m, -10)}
                            >
                              -10
                            </button>
                            <button
                              type="button"
                              className="btn-outline"
                              disabled={actionBusyId === m.id}
                              onClick={() => requestDelete(m)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                </tbody>
              </table>
            )}
          </div>

          <div className="inventory-pagination" aria-label="Inventory pagination controls">
            <div className="badge-text">
              Page {currentPageDisplay} of {totalPagesDisplay} · {totalItemsDisplay} items
            </div>
            <div className="inventory-pagination-controls">
              <label className="badge-text" htmlFor="pageSizeSelect">
                Rows
              </label>
              <select
                id="pageSizeSelect"
                className="select-input"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button
                type="button"
                className="btn-outline"
                disabled={currentPageDisplay <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn-outline"
                disabled={currentPageDisplay >= totalPagesDisplay}
                onClick={() => setPage((value) => Math.min(totalPagesDisplay, value + 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="badge-text footer-hint">
            {USE_LIVE_API
              ? 'Live mode: inventory and auth go through the Node API (MySQL when USE_MYSQL=true). Run npm run dev:full and npm run db:seed for the full stack.'
              : 'Mock mode: set VITE_USE_LIVE_API=true to use the API with npm run dev:full.'}
          </div>
        </section>
      </main>
      </div>

      <dialog ref={navDialogRef} id="nav-menu-dialog" className="lll-dialog" aria-labelledby="nav-menu-title">
        <div className="lll-dialog__inner">
          <h2 id="nav-menu-title" className="lll-dialog__title">
            Navigation
          </h2>
          <p className="lll-dialog__body">Life-Long Logistics · Hospital inventory dashboard</p>
          <div className="lll-dialog__actions">
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                navDialogRef.current?.close();
                document
                  .getElementById('main-content')
                  ?.querySelector('#master-list-heading')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Go to inventory
            </button>
            <button type="button" className="btn-outline" onClick={() => navDialogRef.current?.close()}>
              Close
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        className="lll-dialog"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-desc"
        onClose={() => setDeleteTarget(null)}
      >
        <div className="lll-dialog__inner">
          <h2 id="delete-dialog-title" className="lll-dialog__title">
            Remove medication?
          </h2>
          <p id="delete-dialog-desc" className="lll-dialog__body">
            {deleteTarget
              ? `This will remove ${deleteTarget.name} (${deleteTarget.id}) from the catalog. This action cannot be undone.`
              : ''}
          </p>
          <div className="lll-dialog__actions">
            <button type="button" className="btn-outline" onClick={closeDeleteDialog}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={confirmDelete} disabled={Boolean(actionBusyId)}>
              Delete
            </button>
          </div>
        </div>
      </dialog>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.variant === 'error' ? 'toast--error' : t.variant === 'success' ? 'toast--success' : ''}`}
            role="status"
          >
            <span className="toast__icon" aria-hidden="true">
              {t.variant === 'success' ? '✓' : t.variant === 'error' ? '!' : '·'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
