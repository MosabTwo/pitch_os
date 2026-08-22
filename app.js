import { DAYS, WARMUP, WORKOUTS, TRAINING_RULES, EQUIPMENT } from './program-data.js';

const APP_VERSION = '3.0.0';
const STORAGE_PREFIX = 'pitcher-os:v3';
const SUPABASE_MODULE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const RING_CIRCUMFERENCE = 2 * Math.PI * 49;

const ADMIN_EMAIL = 'mossab1@gmail.com';
function isAdmin() {
  const email = (state.user?.email || '').trim().toLowerCase();
  return email === ADMIN_EMAIL;
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  mode: 'boot',
  supabase: null,
  session: null,
  user: null,
  profile: null,
  selectedTodayKey: actualTodayKey(),
  selectedTodayDate: localIsoDate(new Date()),
  selectedWeekKey: 'mon',
  selectedWeekDate: dateForDayKeyInCurrentWeek('mon'),
  sessionRecords: new Map(),
  loadedSessionKeys: new Set(),
  progressEntries: [],
  recentSessions: [],
  currentMetric: 'broad_jump_cm',
  themePreference: localStorage.getItem(`${STORAGE_PREFIX}:theme`) || 'system',
  activeView: 'today',
  recoveryMode: false,
  toastTimer: null,
  flushTimer: null,
  isFlushing: false,
  currentUserId: null,
  confirmAction: null,
  templates: [],
  activeTemplateId: 'builtin'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeJsonParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function pad2(value) { return String(value).padStart(2, '0'); }

function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseLocalDate(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatDate(iso, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(undefined, options).format(parseLocalDate(iso));
}

function dayIndexToKey(index) {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][index];
}

function actualTodayKey() { return dayIndexToKey(new Date().getDay()); }

function currentWeekStart() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset, 12);
  return monday;
}

function dateForDayKeyInCurrentWeek(dayKey) {
  const offsets = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  const date = currentWeekStart();
  date.setDate(date.getDate() + offsets[dayKey]);
  return localIsoDate(date);
}

function currentWeekRange() {
  const startDate = currentWeekStart();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  return { start: localIsoDate(startDate), end: localIsoDate(endDate) };
}

function isToday(iso) { return iso === localIsoDate(new Date()); }

function dayDefinition(dayKey) { return getActiveDays().find((day) => day.key === dayKey); }

function setBusy(button, busy, label = 'Working…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.originalText;
  }
}

function showToast(message) {
  const toast = $('#toast');
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function showFeedback(message, type = '') {
  const box = $('#authFeedback');
  box.textContent = message;
  box.className = `feedback${type ? ` ${type}` : ''}`;
}

function clearFeedback() {
  const box = $('#authFeedback');
  box.textContent = '';
  box.className = 'feedback hidden';
}

function showOnlyScreen(screenId) {
  ['bootScreen', 'setupScreen', 'authScreen', 'appShell'].forEach((id) => {
    const node = document.getElementById(id);
    node.classList.toggle('hidden', id !== screenId);
  });
}

function configStatus() {
  const config = window.PITCHER_APP_CONFIG || {};
  const url = String(config.supabaseUrl || '').trim();
  const key = String(config.supabasePublishableKey || config.supabaseAnonKey || '').trim();
  const placeholder = !url || !key || url.includes('YOUR_') || key.includes('YOUR_');
  const secretKey = key.startsWith('sb_secret_') || key.toLowerCase().includes('service_role');
  return { config, url, key, valid: !placeholder && !secretKey, secretKey };
}

function resolvedTheme(preference = state.themePreference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference, { persist = true, queue = false } = {}) {
  const clean = ['light', 'dark', 'system'].includes(preference) ? preference : 'system';
  state.themePreference = clean;
  const resolved = resolvedTheme(clean);
  document.documentElement.dataset.theme = resolved;
  $('#themeColorMeta').setAttribute('content', resolved === 'dark' ? '#0b0f17' : '#f4f6f8');
  if (persist) localStorage.setItem(`${STORAGE_PREFIX}:theme`, clean);
  $$('#themeSelector [data-theme-choice]').forEach((button) => {
    button.classList.toggle('active', button.dataset.themeChoice === clean);
    button.setAttribute('aria-checked', button.dataset.themeChoice === clean ? 'true' : 'false');
  });
  if (queue && state.mode === 'cloud' && state.user) {
    state.profile = { ...(state.profile || {}), theme: clean };
    queueProfileSync();
  }
}

function toggleQuickTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next, { persist: true, queue: true });
  showToast(`${next === 'dark' ? 'Dark' : 'Light'} mode`);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (state.themePreference === 'system') applyTheme('system', { persist: false });
});

function showAuthPanel(panelId) {
  $$('.auth-panel').forEach((panel) => panel.classList.toggle('active', panel.id === panelId));
  $$('.auth-tab').forEach((tab) => {
    const active = tab.dataset.authPanel === panelId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  clearFeedback();
}

function showAuthScreen(panelId = 'signInPanel') {
  state.mode = 'auth';
  showOnlyScreen('authScreen');
  showAuthPanel(panelId);
}

async function initializeBackend() {
  const status = configStatus();
  if (!status.valid) {
    if (status.secretKey) {
      const setupCopy = $('#setupScreen .gate-card > p');
      setupCopy.textContent = 'The browser config contains a secret/service-role key. Remove it immediately. Only a publishable or legacy anon key belongs in config.js.';
    }
    showOnlyScreen('setupScreen');
    state.mode = 'setup';
    return;
  }

  try {
    const { createClient } = await import(SUPABASE_MODULE);
    state.supabase = createClient(status.url, status.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    state.supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => handleAuthEvent(event, session), 0);
    });

    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    if (data.session && state.recoveryMode) {
      state.session = data.session;
      state.user = data.session.user;
      showAuthScreen('newPasswordPanel');
    } else if (data.session) await enterCloudApp(data.session);
    else showAuthScreen('signInPanel');
  } catch (error) {
    console.error(error);
    showOnlyScreen('setupScreen');
    state.mode = 'setup';
    const setupCopy = $('#setupScreen .gate-card > p');
    setupCopy.textContent = `The backend configuration was found, but the app could not connect: ${error.message || 'unknown error'}`;
  }
}

async function handleAuthEvent(event, session) {
  if (event === 'PASSWORD_RECOVERY') {
    state.recoveryMode = true;
    state.session = session;
    state.user = session?.user || null;
    showAuthScreen('newPasswordPanel');
    return;
  }
  if (event === 'SIGNED_OUT') {
    resetUserState();
    showAuthScreen('signInPanel');
    return;
  }
  if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION'].includes(event)) {
    if (!state.recoveryMode) await enterCloudApp(session);
  }
}

async function signIn(email, password) {
  const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.session) await enterCloudApp(data.session);
}

async function signUp(name, email, password) {
  const redirect = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await state.supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirect,
      data: { display_name: name || '' }
    }
  });
  if (error) throw error;
  if (data.session) {
    await enterCloudApp(data.session);
  } else {
    showFeedback('Account created. Check your email to confirm the address, then sign in.', 'success');
  }
}

async function sendPasswordReset(email) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await state.supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
  showFeedback('Recovery email sent. Open the link on this device to choose a new password.', 'success');
}

async function updateRecoveredPassword(password) {
  const { error } = await state.supabase.auth.updateUser({ password });
  if (error) throw error;
  state.recoveryMode = false;
  showFeedback('Password updated. Opening your training log…', 'success');
  const { data } = await state.supabase.auth.getSession();
  if (data.session) await enterCloudApp(data.session);
}

function resetUserState() {
  state.session = null;
  state.user = null;
  state.profile = null;
  state.currentUserId = null;
  state.sessionRecords.clear();
  state.loadedSessionKeys.clear();
  state.progressEntries = [];
  state.recentSessions = [];
}

async function enterCloudApp(session) {
  if (!session?.user) return;
  const sameUser = state.currentUserId === session.user.id && state.mode === 'cloud';
  state.mode = 'cloud';
  state.session = session;
  state.user = session.user;
  state.currentUserId = session.user.id;
  if (!sameUser) {
    state.sessionRecords.clear();
    state.loadedSessionKeys.clear();
    migrateLegacyLocalData();
    state.progressEntries = readLocalProgress();
    state.recentSessions = readLocalRecentSessions();
    loadTemplates();
  }
  await loadProfile();
  updateAccountUi();
  showOnlyScreen('appShell');
  renderApp();
  updateSyncStatus('saved', 'Saved');
  await Promise.allSettled([
    loadWeekSessionsFromCloud(),
    loadProgressFromCloud(),
    loadRecentSessionsFromCloud()
  ]);
  ensureSessionLoaded(state.selectedTodayDate, state.selectedTodayKey);
  ensureSessionLoaded(state.selectedWeekDate, state.selectedWeekKey);
  flushPending();
}

function enterPreviewMode() {
  resetUserState();
  state.mode = 'guest';
  state.user = { id: 'guest', email: null, user_metadata: {} };
  state.currentUserId = 'guest';
  const guestName = localStorage.getItem(`${STORAGE_PREFIX}:guest-name`) || 'Athlete';
  state.profile = { display_name: guestName, theme: state.themePreference };
  migrateLegacyLocalData();
  state.progressEntries = readLocalProgress();
  state.recentSessions = readLocalRecentSessions();
  loadTemplates();
  updateAccountUi();
  showOnlyScreen('appShell');
  renderApp();
  updateSyncStatus('saved', 'On device');
}

function scopeId() { return state.user?.id || 'guest'; }
function storageKey(kind, suffix = '') { return `${STORAGE_PREFIX}:${scopeId()}:${kind}${suffix ? `:${suffix}` : ''}`; }
function recordKey(date, dayKey) { return `${date}|${dayKey}`; }
function sessionStorageKey(date, dayKey) { return storageKey('session', recordKey(date, dayKey)); }
function pendingStorageKey() { return storageKey('pending'); }

function defaultPendingQueue() {
  return { sessions: {}, progress: {}, progressDeletes: [], profile: null };
}

function readPendingQueue() {
  const pending = safeJsonParse(localStorage.getItem(pendingStorageKey()), defaultPendingQueue());
  return {
    sessions: pending.sessions || {},
    progress: pending.progress || {},
    progressDeletes: Array.isArray(pending.progressDeletes) ? pending.progressDeletes : [],
    profile: pending.profile || null
  };
}

function writePendingQueue(queue) {
  localStorage.setItem(pendingStorageKey(), JSON.stringify(queue));
}

function hasPendingWork(queue = readPendingQueue()) {
  return Object.keys(queue.sessions).length > 0 ||
    Object.keys(queue.progress).length > 0 ||
    queue.progressDeletes.length > 0 ||
    Boolean(queue.profile);
}

function createEmptySession(date, dayKey) {
  const now = new Date().toISOString();
  return {
    session_date: date,
    workout_key: dayKey,
    completed_sets: {},
    status: 'in_progress',
    notes: '',
    started_at: now,
    completed_at: null,
    updated_at: now
  };
}

function normalizeSession(record, date, dayKey) {
  const base = createEmptySession(date, dayKey);
  return {
    ...base,
    ...(record || {}),
    session_date: record?.session_date || date,
    workout_key: record?.workout_key || dayKey,
    completed_sets: record?.completed_sets && typeof record.completed_sets === 'object' ? record.completed_sets : {},
    status: record?.status === 'complete' ? 'complete' : 'in_progress'
  };
}

function readLocalSession(date, dayKey) {
  return normalizeSession(safeJsonParse(localStorage.getItem(sessionStorageKey(date, dayKey)), null), date, dayKey);
}

function writeLocalSession(record) {
  const normalized = normalizeSession(record, record.session_date, record.workout_key);
  localStorage.setItem(sessionStorageKey(normalized.session_date, normalized.workout_key), JSON.stringify(normalized));
  state.sessionRecords.set(recordKey(normalized.session_date, normalized.workout_key), normalized);
  return normalized;
}

function getSessionRecord(date, dayKey) {
  const key = recordKey(date, dayKey);
  if (state.sessionRecords.has(key)) return state.sessionRecords.get(key);
  const local = readLocalSession(date, dayKey);
  state.sessionRecords.set(key, local);
  return local;
}

function sessionPayload(record) {
  return {
    user_id: state.user.id,
    session_date: record.session_date,
    workout_key: record.workout_key,
    completed_sets: record.completed_sets || {},
    status: record.status || 'in_progress',
    notes: record.notes || '',
    started_at: record.started_at || new Date().toISOString(),
    completed_at: record.completed_at || null,
    updated_at: record.updated_at || new Date().toISOString()
  };
}

function queueSessionSync(record) {
  const saved = writeLocalSession(record);
  if (state.mode !== 'cloud') {
    refreshAfterSessionChange(saved);
    return;
  }
  const queue = readPendingQueue();
  queue.sessions[recordKey(saved.session_date, saved.workout_key)] = sessionPayload(saved);
  writePendingQueue(queue);
  updateSyncStatus(navigator.onLine ? 'pending' : 'offline', navigator.onLine ? 'Sync pending' : 'Offline • saved local');
  scheduleFlush();
  refreshAfterSessionChange(saved);
}

function readLocalProgress() {
  const data = safeJsonParse(localStorage.getItem(storageKey('progress')), []);
  return Array.isArray(data) ? data : [];
}

function writeLocalProgress(entries) {
  state.progressEntries = [...entries].sort((a, b) => String(b.measured_on).localeCompare(String(a.measured_on)));
  localStorage.setItem(storageKey('progress'), JSON.stringify(state.progressEntries));
}

function readLocalRecentSessions() {
  const data = safeJsonParse(localStorage.getItem(storageKey('recent-sessions')), []);
  return Array.isArray(data) ? data : [];
}

function writeLocalRecentSessions(entries) {
  state.recentSessions = [...entries]
    .sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)))
    .slice(0, 60);
  localStorage.setItem(storageKey('recent-sessions'), JSON.stringify(state.recentSessions));
}

function queueProgressSync(entry) {
  const existing = state.progressEntries.filter((item) => item.id !== entry.id && item.measured_on !== entry.measured_on);
  writeLocalProgress([entry, ...existing]);
  if (state.mode !== 'cloud') {
    renderProgress();
    showToast('Check-in saved on this device');
    return;
  }
  const queue = readPendingQueue();
  queue.progress[entry.id] = { ...entry, user_id: state.user.id };
  queue.progressDeletes = queue.progressDeletes.filter((id) => id !== entry.id);
  writePendingQueue(queue);
  updateSyncStatus(navigator.onLine ? 'pending' : 'offline', navigator.onLine ? 'Sync pending' : 'Offline • saved local');
  scheduleFlush();
  renderProgress();
  showToast('Check-in saved');
}

function queueProgressDelete(id) {
  writeLocalProgress(state.progressEntries.filter((entry) => entry.id !== id));
  if (state.mode === 'cloud') {
    const queue = readPendingQueue();
    delete queue.progress[id];
    if (!queue.progressDeletes.includes(id)) queue.progressDeletes.push(id);
    writePendingQueue(queue);
    updateSyncStatus(navigator.onLine ? 'pending' : 'offline', navigator.onLine ? 'Sync pending' : 'Offline • saved local');
    scheduleFlush();
  }
  renderProgress();
  showToast('Check-in deleted');
}

function queueProfileSync() {
  if (state.mode === 'guest') {
    localStorage.setItem(`${STORAGE_PREFIX}:guest-name`, state.profile?.display_name || 'Athlete');
    updateAccountUi();
    return;
  }
  if (state.mode !== 'cloud' || !state.user) return;
  const queue = readPendingQueue();
  queue.profile = {
    id: state.user.id,
    display_name: state.profile?.display_name || '',
    theme: state.profile?.theme || state.themePreference,
    updated_at: new Date().toISOString()
  };
  writePendingQueue(queue);
  updateSyncStatus(navigator.onLine ? 'pending' : 'offline', navigator.onLine ? 'Sync pending' : 'Offline • saved local');
  scheduleFlush();
}

function scheduleFlush(delay = 650) {
  clearTimeout(state.flushTimer);
  state.flushTimer = setTimeout(() => flushPending(), delay);
}

async function flushPending() {
  if (state.mode !== 'cloud' || !state.supabase || !state.user || state.isFlushing) return;
  const queue = readPendingQueue();
  if (!hasPendingWork(queue)) {
    updateSyncStatus(navigator.onLine ? 'saved' : 'offline', navigator.onLine ? 'Saved' : 'Offline');
    return;
  }
  if (!navigator.onLine) {
    updateSyncStatus('offline', 'Offline • saved local');
    return;
  }

  state.isFlushing = true;
  updateSyncStatus('syncing', 'Syncing');
  try {
    const sessions = Object.values(queue.sessions);
    if (sessions.length) {
      const { error } = await state.supabase
        .from('workout_sessions')
        .upsert(sessions, { onConflict: 'user_id,session_date,workout_key' });
      if (error) throw error;
    }

    const progress = Object.values(queue.progress);
    if (progress.length) {
      const { error } = await state.supabase
        .from('progress_entries')
        .upsert(progress, { onConflict: 'user_id,measured_on' });
      if (error) throw error;
    }

    if (queue.progressDeletes.length) {
      const { error } = await state.supabase
        .from('progress_entries')
        .delete()
        .in('id', queue.progressDeletes);
      if (error) throw error;
    }

    if (queue.profile) {
      const { error } = await state.supabase
        .from('profiles')
        .upsert(queue.profile, { onConflict: 'id' });
      if (error) throw error;
    }

    writePendingQueue(defaultPendingQueue());
    updateSyncStatus('saved', 'Saved');
    await Promise.allSettled([loadRecentSessionsFromCloud(), loadProgressFromCloud(), loadWeekSessionsFromCloud()]);
  } catch (error) {
    console.error('Sync failed', error);
    updateSyncStatus('error', 'Sync failed');
    showToast(`Sync failed: ${error.message || 'try again'}`);
  } finally {
    state.isFlushing = false;
  }
}

function updateSyncStatus(kind, label) {
  const status = $('#syncStatus');
  status.className = `sync-status ${kind || ''}`.trim();
  $('span', status).textContent = label;
}

async function loadProfile() {
  const cached = safeJsonParse(localStorage.getItem(storageKey('profile')), null);
  const metadataName = state.user?.user_metadata?.display_name || '';
  state.profile = {
    display_name: cached?.display_name || metadataName || 'Athlete',
    theme: cached?.theme || state.themePreference
  };
  applyTheme(state.profile.theme || state.themePreference, { persist: true });

  try {
    const { data, error } = await state.supabase
      .from('profiles')
      .select('display_name, theme')
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) throw error;
    const pending = readPendingQueue().profile;
    if (data && !pending) {
      state.profile = {
        display_name: data.display_name || metadataName || 'Athlete',
        theme: data.theme || state.themePreference
      };
    } else if (!data) {
      queueProfileSync();
    }
    localStorage.setItem(storageKey('profile'), JSON.stringify(state.profile));
    applyTheme(state.profile.theme || state.themePreference, { persist: true });
  } catch (error) {
    console.error('Profile load failed', error);
  }
}

function updateAccountUi() {
  const email = state.mode === 'cloud' ? state.user?.email || '' : 'Preview mode • device only';
  const name = state.profile?.display_name?.trim() || state.user?.user_metadata?.display_name || 'Athlete';
  const initial = name.charAt(0).toUpperCase() || 'A';
  $('#avatarInitial').textContent = initial;
  $('#accountInitial').textContent = initial;
  $('#accountDisplayName').textContent = name;
  $('#accountEmail').textContent = email;
  $('#profileName').value = name === 'Athlete' ? '' : name;
  $('#signOutBtn').textContent = state.mode === 'cloud' ? 'Sign out' : 'Exit preview mode';
  $('#dataPanelTitle').textContent = state.mode === 'cloud' ? 'Cloud sync enabled' : 'Preview mode: device only';
  $('#dataPanelCopy').textContent = state.mode === 'cloud'
    ? 'Workout sessions, preferences and check-ins follow your account. A local cache keeps the app responsive.'
    : 'This preview stores data only in this browser. Connect Supabase and create an account for cross-device sync.';
  applyTheme(state.profile?.theme || state.themePreference, { persist: true });
}

async function saveProfileSettings() {
  const name = $('#profileName').value.trim().slice(0, 40) || 'Athlete';
  state.profile = { ...(state.profile || {}), display_name: name, theme: state.themePreference };
  localStorage.setItem(storageKey('profile'), JSON.stringify(state.profile));
  if (state.mode === 'cloud') {
    try {
      await state.supabase.auth.updateUser({ data: { display_name: name } });
    } catch (error) {
      console.warn('Auth metadata update failed', error);
    }
  }
  // Save program selection (admin only)
  if (isAdmin()) {
    const selected = $('#programSelect').value;
    if (selected && selected !== state.activeTemplateId) {
      setActiveTemplateId(selected);
      renderApp();
      renderTemplates();
    }
  }
  queueProfileSync();
  updateAccountUi();
  closeAccountSheet();
  showToast('Settings saved');
}

function totalSetsForWorkout(dayKey) {
  return (getActiveWorkouts()[dayKey]?.exercises || []).reduce((sum, exercise) => sum + Number(exercise.sets || 0), 0);
}

function completedSetCount(record) {
  return Object.values(record?.completed_sets || {}).filter(Boolean).length;
}

function sessionHasWork(record) {
  return record?.status === 'complete' || completedSetCount(record) > 0;
}

function sessionCompletion(record, dayKey) {
  const total = totalSetsForWorkout(dayKey);
  const done = Math.min(completedSetCount(record), total || completedSetCount(record));
  const percent = total ? Math.round((done / total) * 100) : (record?.status === 'complete' ? 100 : 0);
  return { total, done, percent };
}

function renderApp() {
  renderStaticContent();
  renderToday(state.selectedTodayKey);
  renderWeekWorkout(state.selectedWeekKey);
  renderProgress();
  updateAccountUi();
  navTo(state.activeView, { scroll: false });
}

function navTo(view, { scroll = true } = {}) {
  const safeView = ['today', 'week', 'progress', 'more'].includes(view) ? view : 'today';
  state.activeView = safeView;
  $$('.view').forEach((node) => node.classList.toggle('active', node.dataset.view === safeView));
  $$('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === safeView));
  if (safeView === 'progress') renderProgress();
  if (safeView === 'more') renderTemplates();
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderStaticContent() {
  const schedule = $('#schedule');
  if (!schedule.dataset.rendered) {
    schedule.innerHTML = getActiveDays().map((day) => `
      <article class="schedule-row">
        <div class="schedule-day">${escapeHtml(day.short)}</div>
        <div><strong>${escapeHtml(day.title)}</strong><p>${escapeHtml(day.desc)}</p></div>
      </article>`).join('');
    schedule.dataset.rendered = 'true';
  }

  const rulesList = $('#rulesList');
  if (!rulesList.dataset.rendered) {
    rulesList.innerHTML = TRAINING_RULES.map(([title, copy]) => `
      <article class="rule-card"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></article>`).join('');
    rulesList.dataset.rendered = 'true';
  }

  const equipmentGrid = $('#equipmentGrid');
  if (!equipmentGrid.dataset.rendered) {
    equipmentGrid.innerHTML = EQUIPMENT.map(([title, copy], index) => `
      <article class="equipment-card" data-index="${index + 1}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></article>`).join('');
    equipmentGrid.dataset.rendered = 'true';
  }
}

function weekStripHtml(activeKey, { compact = false } = {}) {
  const activeDays = getActiveDays();
  const activeWorkouts = getActiveWorkouts();
  const days = compact ? activeDays.filter((day) => activeWorkouts[day.key]) : activeDays;
  return days.map((day) => {
    const date = dateForDayKeyInCurrentWeek(day.key);
    const record = getSessionRecord(date, day.key);
    const hasWork = sessionHasWork(record);
    return `
      <button class="day-chip${day.key === activeKey ? ' active' : ''}${hasWork ? ' has-work' : ''}" data-day-key="${day.key}" type="button" aria-label="${escapeHtml(day.long)} ${escapeHtml(day.kind)}">
        <strong>${escapeHtml(day.short)}</strong>
        <span>${escapeHtml(day.kind)}</span>
        <i aria-hidden="true"></i>
      </button>`;
  }).join('');
}

function bindWeekStrip(container, onSelect) {
  $$('[data-day-key]', container).forEach((button) => {
    button.addEventListener('click', () => onSelect(button.dataset.dayKey));
  });
}

function renderToday(dayKey) {
  const days = getActiveDays();
  // Fall back to first available day if requested key isn't in the active template
  const validKey = days.find((d) => d.key === dayKey) ? dayKey : (days[0]?.key || 'mon');
  const day = dayDefinition(validKey);
  const date = dateForDayKeyInCurrentWeek(validKey);
  state.selectedTodayKey = validKey;
  state.selectedTodayDate = date;

  $('#todayEyebrow').textContent = isToday(date) ? 'Today’s session' : `${day.long} plan`;
  $('#selectedSessionDate').textContent = formatDate(date);
  $('#todayTitle').textContent = day.title;
  $('#todayDesc').textContent = day.desc;

  const strip = $('#weekStrip');
  strip.innerHTML = weekStripHtml(validKey);
  bindWeekStrip(strip, renderToday);

  renderWorkout('todayWorkout', validKey, date, 'today');
  updateHeroProgress();
  ensureSessionLoaded(date, validKey);
}

function renderWeekWorkout(dayKey) {
  const days = getActiveDays();
  // Fall back to first available day if requested key isn't in the active template
  const validKey = days.find((d) => d.key === dayKey) ? dayKey : (days[0]?.key || 'mon');
  const date = dateForDayKeyInCurrentWeek(validKey);
  state.selectedWeekKey = validKey;
  state.selectedWeekDate = date;
  const strip = $('#strengthStrip');
  strip.innerHTML = weekStripHtml(validKey, { compact: true });
  bindWeekStrip(strip, renderWeekWorkout);
  renderWorkout('weekWorkout', validKey, date, 'week');
  ensureSessionLoaded(date, validKey);
}

function renderWorkout(targetId, dayKey, date, context) {
  const target = document.getElementById(targetId);

  // Save which <details> cards are currently open so they survive the re-render
  const openExerciseIndexes = new Set(
    $$('details[data-exercise-index][open]', target).map((d) => d.dataset.exerciseIndex)
  );
  const warmupWasOpen = Boolean($('details.warmup-card[open]', target));

  const day = dayDefinition(dayKey);
  const workout = getActiveWorkouts()[dayKey];
  const record = getSessionRecord(date, dayKey);

  if (!workout) {
    target.innerHTML = `
      <article class="empty-workout">
        <strong>${escapeHtml(day.title)}</strong>
        ${escapeHtml(day.desc)}
      </article>`;
    return;
  }

  const { total, done, percent } = sessionCompletion(record, dayKey);
  const statusLabel = record.status === 'complete' ? 'Complete' : workout.badge;
  const completionButtonLabel = record.status === 'complete' ? 'Reopen session' : 'Mark session complete';
  const completionButtonClass = record.status === 'complete' ? 'btn--surface' : 'btn--primary';

  let html = `
    <div class="workout-shell" data-session-date="${date}" data-workout-key="${dayKey}" data-context="${context}">
      <article class="workout-summary">
        <div class="workout-summary-head">
          <div><h3>${escapeHtml(workout.title)}</h3><p>${escapeHtml(workout.subtitle)} • ${escapeHtml(formatDate(date, { day: 'numeric', month: 'short' }))}</p></div>
          <span class="badge">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="progress-line">
          <div class="progress-copy"><strong class="progressText">${done} of ${total} sets</strong><span>${percent}% complete</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        </div>
        <div class="summary-actions">
          <button class="btn ${completionButtonClass} btn--small" data-action="toggle-session-complete" type="button">${completionButtonLabel}</button>
        </div>
      </article>`;

  if (workout.warmup) {
    html += `
      <details class="exercise-card warmup-card">
        <summary>
          <span class="exercise-number">W</span>
          <div class="exercise-main"><div class="exercise-name">Warm-up</div><div class="exercise-volume">7 movements • about 8 minutes</div></div>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>
        </summary>
        <div class="exercise-body"><div class="warmup-list">
          ${WARMUP.map(([name, volume, cue]) => `
            <div class="warmup-item"><div><strong>${escapeHtml(name)}</strong><p>${escapeHtml(cue)}</p></div><span class="warmup-volume">${escapeHtml(volume)}</span></div>`).join('')}
        </div></div>
      </details>`;
  }

  workout.exercises.forEach((exercise, exerciseIndex) => {
    const allSetsComplete = exercise.sets > 0 && Array.from({ length: exercise.sets }, (_, setIndex) => Boolean(record.completed_sets?.[`${exerciseIndex}:${setIndex}`])).every(Boolean);
    html += `
      <details class="exercise-card${allSetsComplete ? ' complete' : ''}" data-exercise-index="${exerciseIndex}">
        <summary>
          <span class="exercise-number">${exerciseIndex + 1}</span>
          <div class="exercise-main"><div class="exercise-name">${escapeHtml(exercise.name)}</div><div class="exercise-volume">${escapeHtml(exercise.volume)}</div></div>
          <span class="rest-pill">${escapeHtml(exercise.rest)}</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>
        </summary>
        <div class="exercise-body">
          <div class="cue-box">${escapeHtml(exercise.cue)}</div>`;

    if (exercise.sets > 0) {
      html += `<div class="set-label">Working sets</div><div class="set-row">`;
      for (let setIndex = 0; setIndex < exercise.sets; setIndex += 1) {
        const checked = Boolean(record.completed_sets?.[`${exerciseIndex}:${setIndex}`]);
        const inputId = `${targetId}-${date}-${dayKey}-${exerciseIndex}-${setIndex}`;
        html += `
          <span class="set-check">
            <input id="${inputId}" type="checkbox" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" ${checked ? 'checked' : ''}>
            <label for="${inputId}" aria-label="Set ${setIndex + 1}">${setIndex + 1}</label>
          </span>`;
      }
      html += `</div>`;
    }

    html += `
          <div class="timer-row">
            <span class="timer-display">00:00</span>
            <button class="btn btn--surface btn--small" data-action="start-timer" data-seconds="${restToSeconds(exercise.rest)}" type="button">Start rest</button>
            <button class="btn btn--surface btn--small" data-action="reset-timer" type="button">Reset</button>
          </div>
          ${exercise.note ? `<p class="exercise-note">${escapeHtml(exercise.note)}</p>` : ''}
        </div>
      </details>`;
  });

  html += `</div>`;
  target.innerHTML = html;

  // Restore open state so checking a set doesn't collapse the card
  if (warmupWasOpen) {
    const warmupCard = $('details.warmup-card', target);
    if (warmupCard) warmupCard.open = true;
  }
  $$('details[data-exercise-index]', target).forEach((d) => {
    if (openExerciseIndexes.has(d.dataset.exerciseIndex)) d.open = true;
  });

  bindWorkoutEvents(target);
}

function bindWorkoutEvents(target) {
  $$('input[type="checkbox"][data-exercise-index]', target).forEach((input) => {
    input.addEventListener('change', () => {
      const root = input.closest('.workout-shell');
      const date = root.dataset.sessionDate;
      const dayKey = root.dataset.workoutKey;
      const record = { ...getSessionRecord(date, dayKey), completed_sets: { ...getSessionRecord(date, dayKey).completed_sets } };
      const key = `${input.dataset.exerciseIndex}:${input.dataset.setIndex}`;
      if (input.checked) record.completed_sets[key] = true;
      else delete record.completed_sets[key];
      record.status = 'in_progress';
      record.completed_at = null;
      record.updated_at = new Date().toISOString();
      queueSessionSync(record);
    });
  });

  $('[data-action="toggle-session-complete"]', target)?.addEventListener('click', () => {
    const root = $('.workout-shell', target);
    const date = root.dataset.sessionDate;
    const dayKey = root.dataset.workoutKey;
    const current = getSessionRecord(date, dayKey);
    const nextComplete = current.status !== 'complete';
    const record = {
      ...current,
      status: nextComplete ? 'complete' : 'in_progress',
      completed_at: nextComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    queueSessionSync(record);
    showToast(nextComplete ? 'Session marked complete' : 'Session reopened');
  });

  $$('[data-action="start-timer"]', target).forEach((button) => {
    button.addEventListener('click', () => startTimer(button));
  });
  $$('[data-action="reset-timer"]', target).forEach((button) => {
    button.addEventListener('click', () => resetTimer(button));
  });
}

function restToSeconds(text) {
  if (text.includes('2–3') || text.includes('2-3')) return 150;
  if (text.includes('60–120') || text.includes('60-120')) return 90;
  if (text.includes('60–90') || text.includes('60-90')) return 75;
  if (text.includes('90')) return 90;
  if (text.includes('2 min')) return 120;
  if (text.includes('60')) return 60;
  return 60;
}

function playRestAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beepTimes = [0, 0.28, 0.56];
    beepTimes.forEach((startOffset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime + startOffset);
      gain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + startOffset + 0.02);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startOffset + 0.18);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + 0.2);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Silently fail if Web Audio is unavailable
  }
}

function startTimer(button) {
  const row = button.closest('.timer-row');
  const display = $('.timer-display', row);
  clearInterval(display._timer);
  let remaining = Number(button.dataset.seconds || 60);
  const tick = () => {
    display.textContent = `${pad2(Math.floor(remaining / 60))}:${pad2(remaining % 60)}`;
    if (remaining <= 0) {
      clearInterval(display._timer);
      showToast('Rest complete ✓');
      playRestAlarm();
      navigator.vibrate?.([120, 80, 120, 80, 120]);
      return;
    }
    remaining -= 1;
  };
  tick();
  display._timer = setInterval(tick, 1000);
}

function resetTimer(button) {
  const display = $('.timer-display', button.closest('.timer-row'));
  clearInterval(display._timer);
  display.textContent = '00:00';
}

function refreshAfterSessionChange(record) {
  const key = recordKey(record.session_date, record.workout_key);
  state.sessionRecords.set(key, record);
  const recent = state.recentSessions.filter((item) => !(item.session_date === record.session_date && item.workout_key === record.workout_key));
  if (sessionHasWork(record)) recent.unshift(record);
  writeLocalRecentSessions(recent);

  if (state.selectedTodayDate === record.session_date && state.selectedTodayKey === record.workout_key) {
    renderWorkout('todayWorkout', record.workout_key, record.session_date, 'today');
    updateHeroProgress();
  }
  if (state.selectedWeekDate === record.session_date && state.selectedWeekKey === record.workout_key) {
    renderWorkout('weekWorkout', record.workout_key, record.session_date, 'week');
  }
  const todayStrip = $('#weekStrip');
  if (todayStrip) {
    todayStrip.innerHTML = weekStripHtml(state.selectedTodayKey);
    bindWeekStrip(todayStrip, renderToday);
  }
  const strengthStrip = $('#strengthStrip');
  if (strengthStrip) {
    strengthStrip.innerHTML = weekStripHtml(state.selectedWeekKey, { compact: true });
    bindWeekStrip(strengthStrip, renderWeekWorkout);
  }
  renderSessionHistory();
  renderProgressSummary();
}

function updateHeroProgress() {
  const record = getSessionRecord(state.selectedTodayDate, state.selectedTodayKey);
  const { percent } = sessionCompletion(record, state.selectedTodayKey);
  $('#heroProgressPercent').textContent = `${percent}%`;
  $('#heroProgressLabel').textContent = record.status === 'complete' ? 'complete' : percent ? 'in progress' : 'not started';
  $('#heroProgressRing').style.strokeDasharray = String(RING_CIRCUMFERENCE);
  $('#heroProgressRing').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - percent / 100));
}

async function ensureSessionLoaded(date, dayKey) {
  const key = recordKey(date, dayKey);
  if (state.mode !== 'cloud' || state.loadedSessionKeys.has(key)) return;
  state.loadedSessionKeys.add(key);
  const pending = readPendingQueue().sessions[key];
  try {
    const { data, error } = await state.supabase
      .from('workout_sessions')
      .select('*')
      .eq('user_id', state.user.id)
      .eq('session_date', date)
      .eq('workout_key', dayKey)
      .maybeSingle();
    if (error) throw error;
    if (data && !pending) {
      const record = writeLocalSession(normalizeSession(data, date, dayKey));
      refreshAfterSessionChange(record);
    }
  } catch (error) {
    console.error('Session load failed', error);
    state.loadedSessionKeys.delete(key);
  }
}

async function loadWeekSessionsFromCloud() {
  if (state.mode !== 'cloud') return;
  const { start, end } = currentWeekRange();
  const { data, error } = await state.supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', state.user.id)
    .gte('session_date', start)
    .lte('session_date', end);
  if (error) throw error;
  const queue = readPendingQueue();
  (data || []).forEach((row) => {
    const key = recordKey(row.session_date, row.workout_key);
    if (!queue.sessions[key]) writeLocalSession(normalizeSession(row, row.session_date, row.workout_key));
    state.loadedSessionKeys.add(key);
  });
  renderToday(state.selectedTodayKey);
  renderWeekWorkout(state.selectedWeekKey);
}

async function loadRecentSessionsFromCloud() {
  if (state.mode !== 'cloud') return;
  const { data, error } = await state.supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', state.user.id)
    .order('session_date', { ascending: false })
    .limit(60);
  if (error) throw error;
  const queue = readPendingQueue();
  const map = new Map((data || []).map((row) => [recordKey(row.session_date, row.workout_key), normalizeSession(row, row.session_date, row.workout_key)]));
  Object.entries(queue.sessions).forEach(([key, row]) => map.set(key, normalizeSession(row, row.session_date, row.workout_key)));
  writeLocalRecentSessions([...map.values()].filter(sessionHasWork));
  renderSessionHistory();
  renderProgressSummary();
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function progressPayloadFromForm() {
  const existing = state.progressEntries.find((entry) => entry.measured_on === $('#pDate').value);
  return {
    id: existing?.id || makeUuid(),
    user_id: state.mode === 'cloud' ? state.user.id : 'guest',
    measured_on: $('#pDate').value,
    broad_jump_cm: numberOrNull($('#pBroad').value),
    pullups: numberOrNull($('#pPull').value),
    split_squat_load_kg: numberOrNull($('#pSplitLoad').value),
    split_squat_reps: numberOrNull($('#pSplitReps').value),
    single_leg_target_cm: numberOrNull($('#pSingleHeight').value),
    single_leg_load_kg: numberOrNull($('#pSingleLoad').value),
    bodyweight_kg: numberOrNull($('#pWeight').value),
    notes: $('#pNotes').value.trim().slice(0, 500),
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function progressHasValue(entry) {
  return [
    entry.broad_jump_cm,
    entry.pullups,
    entry.split_squat_load_kg,
    entry.split_squat_reps,
    entry.single_leg_target_cm,
    entry.single_leg_load_kg,
    entry.bodyweight_kg
  ].some((value) => value !== null && value !== undefined) || Boolean(entry.notes);
}

function resetProgressForm() {
  $('#progressForm').reset();
  $('#pDate').value = localIsoDate(new Date());
}

async function loadProgressFromCloud() {
  if (state.mode !== 'cloud') return;
  const { data, error } = await state.supabase
    .from('progress_entries')
    .select('*')
    .eq('user_id', state.user.id)
    .order('measured_on', { ascending: false })
    .limit(100);
  if (error) throw error;

  const queue = readPendingQueue();
  const deleted = new Set(queue.progressDeletes);
  const byDate = new Map();
  (data || []).filter((entry) => !deleted.has(entry.id)).forEach((entry) => byDate.set(entry.measured_on, entry));
  Object.values(queue.progress).forEach((entry) => byDate.set(entry.measured_on, entry));
  writeLocalProgress([...byDate.values()]);
  renderProgress();
}

function renderProgress() {
  renderProgressSummary();
  renderTrendChart();
  renderProgressList();
  renderSessionHistory();
}

function metricValue(entry, key) {
  const value = entry?.[key];
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function formatMetricValue(value, unit, decimals = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return `${number.toFixed(decimals).replace(/\.0$/, '')}${unit ? ` ${unit}` : ''}`;
}

function metricDelta(entries, key, unit, decimals = 0, inverse = false) {
  const valid = entries.filter((entry) => metricValue(entry, key) !== null);
  if (valid.length < 2) return { text: 'No comparison yet', className: '' };
  const delta = metricValue(valid[0], key) - metricValue(valid[1], key);
  if (Math.abs(delta) < 0.0001) return { text: `No change`, className: '' };
  const positive = inverse ? delta < 0 : delta > 0;
  const prefix = delta > 0 ? '+' : '';
  return {
    text: `${prefix}${delta.toFixed(decimals).replace(/\.0$/, '')}${unit ? ` ${unit}` : ''} vs previous`,
    className: positive ? 'positive' : 'negative'
  };
}

function renderProgressSummary() {
  const entries = state.progressEntries;
  const latestFor = (key) => entries.find((entry) => metricValue(entry, key) !== null) || null;
  const latestJump = latestFor('broad_jump_cm');
  const latestPullups = latestFor('pullups');
  const latestWeight = latestFor('bodyweight_kg');
  const completedSessions = state.recentSessions.filter((session) => {
    if (session.status !== 'complete') return false;
    const ageDays = (Date.now() - parseLocalDate(session.session_date).getTime()) / 86400000;
    return ageDays >= -1 && ageDays <= 28;
  }).length;
  const jumpDelta = metricDelta(entries, 'broad_jump_cm', 'cm', 1);
  const pullDelta = metricDelta(entries, 'pullups', 'reps', 0);
  const weightDelta = metricDelta(entries, 'bodyweight_kg', 'kg', 1, false);

  $('#progressSummary').innerHTML = `
    <article class="metric-card"><span>Sessions • 28 days</span><strong>${completedSessions}</strong><small>Marked complete</small></article>
    <article class="metric-card"><span>Broad jump</span><strong>${formatMetricValue(metricValue(latestJump, 'broad_jump_cm'), 'cm', 1)}</strong><small class="${jumpDelta.className}">${escapeHtml(jumpDelta.text)}</small></article>
    <article class="metric-card"><span>Pull-ups</span><strong>${formatMetricValue(metricValue(latestPullups, 'pullups'), '', 0)}</strong><small class="${pullDelta.className}">${escapeHtml(pullDelta.text)}</small></article>
    <article class="metric-card"><span>Bodyweight</span><strong>${formatMetricValue(metricValue(latestWeight, 'bodyweight_kg'), 'kg', 1)}</strong><small class="${weightDelta.className}">${escapeHtml(weightDelta.text)}</small></article>`;
}

const METRIC_META = {
  broad_jump_cm: { label: 'Broad jump', unit: 'cm', decimals: 1 },
  pullups: { label: 'Pull-ups', unit: 'reps', decimals: 0 },
  bodyweight_kg: { label: 'Bodyweight', unit: 'kg', decimals: 1 }
};

function renderTrendChart() {
  const meta = METRIC_META[state.currentMetric];
  const points = state.progressEntries
    .filter((entry) => metricValue(entry, state.currentMetric) !== null)
    .slice()
    .reverse()
    .slice(-12)
    .map((entry) => ({ date: entry.measured_on, value: metricValue(entry, state.currentMetric) }));

  const chart = $('#trendChart');
  if (!points.length) {
    chart.innerHTML = `<div class="chart-empty">No ${escapeHtml(meta.label.toLowerCase())} data yet. Save a check-in to start the trend.</div>`;
    return;
  }

  const width = 760;
  const height = 250;
  const padding = { left: 48, right: 24, top: 30, bottom: 38 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const spread = max - min;
  min -= spread * 0.12;
  max += spread * 0.12;

  const x = (index) => padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value) => padding.top + ((max - value) / (max - min)) * innerHeight;
  const linePoints = points.length === 1
    ? `${padding.left},${y(points[0].value)} ${padding.left + innerWidth},${y(points[0].value)}`
    : points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const areaPoints = `${padding.left},${padding.top + innerHeight} ${linePoints} ${padding.left + innerWidth},${padding.top + innerHeight}`;
  const gridValues = Array.from({ length: 4 }, (_, index) => min + ((max - min) * index) / 3).reverse();

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(meta.label)} trend chart">
      <defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".24"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${gridValues.map((value, index) => {
        const gridY = padding.top + (index / 3) * innerHeight;
        return `<line class="chart-grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${gridY}" y2="${gridY}"/><text class="chart-label" x="${padding.left - 9}" y="${gridY + 4}" text-anchor="end">${value.toFixed(meta.decimals)}</text>`;
      }).join('')}
      <polygon class="chart-area" points="${areaPoints}"/>
      <polyline class="chart-line" points="${linePoints}"/>
      ${points.map((point, index) => `
        <circle class="chart-dot" cx="${x(index)}" cy="${y(point.value)}" r="4"/>
        ${index === points.length - 1 ? `<text class="chart-value" x="${x(index)}" y="${Math.max(15, y(point.value) - 12)}" text-anchor="middle">${point.value.toFixed(meta.decimals)} ${meta.unit}</text>` : ''}
        ${(index === 0 || index === points.length - 1) ? `<text class="chart-label" x="${x(index)}" y="${height - 14}" text-anchor="${index === 0 ? 'start' : 'end'}">${escapeHtml(formatDate(point.date, { day: 'numeric', month: 'short' }))}</text>` : ''}
      `).join('')}
    </svg>`;
}

function progressSummaryLine(entry) {
  const parts = [];
  if (entry.broad_jump_cm !== null && entry.broad_jump_cm !== undefined) parts.push(`Jump ${formatMetricValue(entry.broad_jump_cm, 'cm', 1)}`);
  if (entry.pullups !== null && entry.pullups !== undefined) parts.push(`Pull-ups ${formatMetricValue(entry.pullups, '', 0)}`);
  if (entry.bodyweight_kg !== null && entry.bodyweight_kg !== undefined) parts.push(`BW ${formatMetricValue(entry.bodyweight_kg, 'kg', 1)}`);
  return parts.length ? parts.join(' • ') : (entry.notes || 'Check-in saved');
}

function progressStrengthLine(entry) {
  const parts = [];
  if (entry.split_squat_load_kg !== null && entry.split_squat_load_kg !== undefined) {
    parts.push(`${formatMetricValue(entry.split_squat_load_kg, 'kg', 1)} × ${formatMetricValue(entry.split_squat_reps, '', 0)}`);
  }
  if (entry.single_leg_target_cm !== null && entry.single_leg_target_cm !== undefined) {
    parts.push(`SL ${formatMetricValue(entry.single_leg_target_cm, 'cm', 1)}`);
  }
  return parts.join(' • ') || '—';
}

function renderProgressList() {
  const list = $('#progressList');
  if (!state.progressEntries.length) {
    list.innerHTML = `<div class="empty-state">No check-ins yet. Record a baseline, then repeat under similar conditions in roughly four weeks.</div>`;
    return;
  }
  list.innerHTML = state.progressEntries.slice(0, 12).map((entry) => `
    <article class="history-row">
      <div><strong>${escapeHtml(formatDate(entry.measured_on, { day: 'numeric', month: 'short', year: 'numeric' }))}</strong><p>${escapeHtml(progressSummaryLine(entry))}</p></div>
      <div class="history-actions"><span class="history-value">${escapeHtml(progressStrengthLine(entry))}</span><button class="delete-icon" data-delete-progress="${escapeHtml(entry.id)}" type="button" aria-label="Delete check-in">×</button></div>
    </article>`).join('');
  $$('[data-delete-progress]', list).forEach((button) => {
    button.addEventListener('click', () => {
      openConfirm({
        title: 'Delete this check-in?',
        copy: 'This removes the entry from your account and local cache.',
        confirmLabel: 'Delete',
        action: () => queueProgressDelete(button.dataset.deleteProgress)
      });
    });
  });
}

function renderSessionHistory() {
  const list = $('#sessionHistory');
  const sessions = state.recentSessions.filter(sessionHasWork).slice(0, 12);
  if (!sessions.length) {
    list.innerHTML = `<div class="empty-state">No logged sessions yet. Check sets or mark a workout complete to start the training log.</div>`;
    return;
  }
  list.innerHTML = sessions.map((session) => {
    const day = dayDefinition(session.workout_key) || { title: session.workout_key };
    const completion = sessionCompletion(session, session.workout_key);
    const right = session.status === 'complete' ? 'Complete' : `${completion.done}/${completion.total} sets`;
    return `
      <article class="history-row">
        <div><strong>${escapeHtml(day.title)}</strong><p>${escapeHtml(formatDate(session.session_date, { weekday: 'short', day: 'numeric', month: 'short' }))}</p></div>
        <span class="history-value">${escapeHtml(right)}</span>
      </article>`;
  }).join('');
}

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function exportProgressCsv() {
  if (!state.progressEntries.length) {
    showToast('No progress data yet');
    return;
  }
  const headers = ['Date', 'Broad jump (cm)', 'Pull-ups', 'Split squat load (kg)', 'Split squat reps', 'Single-leg target (cm)', 'Single-leg load (kg)', 'Bodyweight (kg)', 'Notes'];
  const rows = state.progressEntries.slice().reverse().map((entry) => [
    entry.measured_on,
    entry.broad_jump_cm,
    entry.pullups,
    entry.split_squat_load_kg,
    entry.split_squat_reps,
    entry.single_leg_target_cm,
    entry.single_leg_load_kg,
    entry.bodyweight_kg,
    entry.notes
  ]);
  downloadBlob([headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n'), 'pitcher-os-progress.csv', 'text/csv');
}

function exportAllData() {
  const payload = {
    exported_at: new Date().toISOString(),
    app_version: APP_VERSION,
    account: state.mode === 'cloud' ? { email: state.user?.email || null, display_name: state.profile?.display_name || null } : { mode: 'preview' },
    profile: state.profile,
    progress_entries: state.progressEntries,
    workout_sessions: state.recentSessions
  };
  downloadBlob(JSON.stringify(payload, null, 2), 'pitcher-os-data.json', 'application/json');
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ── Workout template system ───────────────────────────────────────────────────

function templateStorageKey() { return storageKey('templates'); }
function activeTemplateStorageKey() { return storageKey('active-template'); }

function readLocalTemplates() {
  const data = safeJsonParse(localStorage.getItem(templateStorageKey()), []);
  return Array.isArray(data) ? data : [];
}

function writeLocalTemplates(templates) {
  state.templates = templates;
  localStorage.setItem(templateStorageKey(), JSON.stringify(templates));
}

function getActiveTemplateId() {
  return localStorage.getItem(activeTemplateStorageKey()) || 'builtin';
}

function setActiveTemplateId(id) {
  state.activeTemplateId = id;
  localStorage.setItem(activeTemplateStorageKey(), id);
  const schedule = $('#schedule');
  if (schedule) delete schedule.dataset.rendered;

  // Reset selected days to valid keys for the new template
  const days = getActiveDaysForId(id);
  const validKeys = days.map((d) => d.key);
  if (!validKeys.includes(state.selectedTodayKey)) {
    state.selectedTodayKey = validKeys[0] || 'mon';
    state.selectedTodayDate = dateForDayKeyInCurrentWeek(state.selectedTodayKey);
  }
  if (!validKeys.includes(state.selectedWeekKey)) {
    state.selectedWeekKey = validKeys[0] || 'mon';
    state.selectedWeekDate = dateForDayKeyInCurrentWeek(state.selectedWeekKey);
  }
}

// Helper used before state.activeTemplateId is updated (in setActiveTemplateId itself)
function getActiveDaysForId(id) {
  if (id === 'builtin') return DAYS;
  const template = state.templates.find((t) => t.id === id);
  return template?.days || DAYS;
}

function getActiveDays() {
  if (state.activeTemplateId === 'builtin') return DAYS;
  const template = state.templates.find((t) => t.id === state.activeTemplateId);
  return template?.days || DAYS;
}

function getActiveWorkouts() {
  if (state.activeTemplateId === 'builtin') return WORKOUTS;
  const template = state.templates.find((t) => t.id === state.activeTemplateId);
  return template?.workouts || WORKOUTS;
}

function loadTemplates() {
  state.templates = readLocalTemplates();
  state.activeTemplateId = getActiveTemplateId();
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

const TEMPLATE_CSV_HEADERS = [
  'program_name', 'program_description',
  'day_key', 'day_short', 'day_long', 'day_title', 'day_kind', 'day_desc',
  'workout_title', 'workout_badge', 'workout_subtitle', 'warmup',
  'exercise_order', 'exercise_name', 'exercise_volume', 'exercise_rest',
  'exercise_sets', 'exercise_cue', 'exercise_note'
];

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseTemplateCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (row, name) => {
    const index = headers.indexOf(name);
    return index >= 0 ? (row[index] ?? '').trim() : '';
  };

  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  const programName = col(rows[0], 'program_name') || 'Imported Program';
  const programDesc = col(rows[0], 'program_description') || '';
  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayMap = new Map();
  const workoutsMap = {};

  rows.forEach((row) => {
    const dayKey = col(row, 'day_key').toLowerCase();
    if (!dayKey) return;
    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        key: dayKey,
        short: col(row, 'day_short') || (dayKey.charAt(0).toUpperCase() + dayKey.slice(1)),
        long: col(row, 'day_long') || dayKey,
        title: col(row, 'day_title') || dayKey,
        kind: col(row, 'day_kind') || 'Strength',
        desc: col(row, 'day_desc') || ''
      });
    }
    const exerciseName = col(row, 'exercise_name');
    if (!exerciseName) return;
    if (!workoutsMap[dayKey]) {
      workoutsMap[dayKey] = {
        title: col(row, 'workout_title') || dayKey,
        badge: col(row, 'workout_badge') || '',
        subtitle: col(row, 'workout_subtitle') || '',
        warmup: col(row, 'warmup').toLowerCase() === 'true',
        exercises: []
      };
    }
    workoutsMap[dayKey].exercises.push({
      name: exerciseName,
      volume: col(row, 'exercise_volume') || '',
      rest: col(row, 'exercise_rest') || '60 sec',
      sets: Number(col(row, 'exercise_sets')) || 0,
      cue: col(row, 'exercise_cue') || '',
      note: col(row, 'exercise_note') || ''
    });
  });

  const days = [...dayMap.values()].sort((a, b) => {
    const ai = dayOrder.indexOf(a.key);
    const bi = dayOrder.indexOf(b.key);
    return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
  });

  return { id: makeUuid(), name: programName, description: programDesc, created_at: new Date().toISOString(), days, workouts: workoutsMap };
}

function exportTemplateCsv(templateOrBuiltin, customName) {
  const isBuiltin = templateOrBuiltin === 'builtin';
  const days = isBuiltin ? DAYS : templateOrBuiltin.days;
  const workouts = isBuiltin ? WORKOUTS : templateOrBuiltin.workouts;
  const name = customName || (isBuiltin ? 'Pitcher Off-season' : templateOrBuiltin.name);
  const desc = isBuiltin ? 'Built-in pitcher off-season strength program' : (templateOrBuiltin.description || '');

  const headerRow = TEMPLATE_CSV_HEADERS.map(csvEscape).join(',');
  const dataRows = [];

  days.forEach((day) => {
    const workout = workouts[day.key];
    const baseDay = [name, desc, day.key, day.short, day.long, day.title, day.kind, day.desc];
    if (!workout) {
      dataRows.push([...baseDay, '', '', '', '', '', '', '', '', ''].map(csvEscape).join(','));
      return;
    }
    const baseWorkout = [workout.title, workout.badge, workout.subtitle, workout.warmup ? 'true' : 'false'];
    if (!workout.exercises || !workout.exercises.length) {
      dataRows.push([...baseDay, ...baseWorkout, '', '', '', '', '', ''].map(csvEscape).join(','));
      return;
    }
    workout.exercises.forEach((exercise, index) => {
      dataRows.push([
        ...baseDay, ...baseWorkout,
        index + 1, exercise.name, exercise.volume, exercise.rest,
        exercise.sets, exercise.cue, exercise.note || ''
      ].map(csvEscape).join(','));
    });
  });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  downloadBlob([headerRow, ...dataRows].join('\n'), `pitcher-os-template-${slug}.csv`, 'text/csv');
}

function downloadBlankTemplate() {
  const headerRow = TEMPLATE_CSV_HEADERS.map(csvEscape).join(',');
  const exampleRows = [
    ['My Program', 'Description of my program', 'mon', 'Mon', 'Monday', 'Day 1 — Strength', 'Strength', 'Main strength day', 'Monday Strength', 'Force', '60–75 min', 'true', '1', 'Back Squat', '4 × 5', '3 min', '4', 'Brace the core and sit back into the squat', 'Add weight each week'],
    ['My Program', 'Description of my program', 'mon', 'Mon', 'Monday', 'Day 1 — Strength', 'Strength', 'Main strength day', 'Monday Strength', 'Force', '60–75 min', 'true', '2', 'Bench Press', '4 × 8', '2 min', '4', 'Keep shoulder blades pinched', ''],
    ['My Program', 'Description of my program', 'tue', 'Tue', 'Tuesday', 'Active Recovery', 'Recover', 'Light movement day', '', '', '', '', '', '', '', '', '', '', ''],
    ['My Program', 'Description of my program', 'wed', 'Wed', 'Wednesday', 'Day 2 — Power', 'Strength', 'Explosive work', 'Wednesday Power', 'Power', '45–60 min', 'false', '1', 'Box Jump', '4 × 3', '90 sec', '4', 'Land quietly and absorb the force', 'Focus on quality not speed']
  ].map((row) => row.map(csvEscape).join(','));

  downloadBlob([headerRow, ...exampleRows].join('\n'), 'pitcher-os-template-BLANK.csv', 'text/csv');
}

function handleCsvImport(file) {
  if (!file || !file.name.toLowerCase().endsWith('.csv')) {
    showToast('Please select a .csv file');
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const template = parseTemplateCsv(event.target.result);
      const existing = readLocalTemplates();
      writeLocalTemplates([...existing, template]);
      setActiveTemplateId(template.id);
      renderApp();
      renderTemplates();
      showToast(`"${template.name}" imported and activated`);
    } catch (error) {
      showToast(`Import failed: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

function renderTemplates() {
  const container = $('#templateList');
  if (!container) return;
  const templates = readLocalTemplates();
  const allTemplates = [
    { id: 'builtin', name: 'Pitcher Off-season', description: 'Built-in pitcher off-season strength program', builtIn: true },
    ...templates
  ];

  container.innerHTML = allTemplates.map((t) => {
    const isActive = state.activeTemplateId === t.id;
    return `
      <article class="template-card${isActive ? ' template-card--active' : ''}">
        <div class="template-card-body">
          <strong>${escapeHtml(t.name)}</strong>
          ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ''}
          ${isActive ? `<span class="badge">Active</span>` : ''}
        </div>
        <div class="template-card-actions">
          <button class="btn btn--surface btn--small" data-export-template="${escapeHtml(t.id)}" type="button">Export CSV</button>
          ${!isActive ? `<button class="btn btn--primary btn--small" data-activate-template="${escapeHtml(t.id)}" type="button">Use</button>` : ''}
          ${!t.builtIn ? `<button class="btn btn--danger btn--small" data-delete-template="${escapeHtml(t.id)}" type="button">Delete</button>` : ''}
        </div>
      </article>`;
  }).join('');

  $$('[data-export-template]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.exportTemplate;
      const tpl = id === 'builtin' ? 'builtin' : state.templates.find((t) => t.id === id);
      if (tpl !== undefined) openExportNameDialog(tpl);
    });
  });

  $$('[data-activate-template]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      setActiveTemplateId(btn.dataset.activateTemplate);
      state.templates = readLocalTemplates();
      renderApp();
      renderTemplates();
      showToast('Template activated');
    });
  });

  $$('[data-delete-template]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      openConfirm({
        title: 'Delete this template?',
        copy: 'This removes the custom program from your device.',
        confirmLabel: 'Delete',
        action: () => {
          const id = btn.dataset.deleteTemplate;
          writeLocalTemplates(state.templates.filter((t) => t.id !== id));
          if (state.activeTemplateId === id) {
            setActiveTemplateId('builtin');
            renderApp();
          }
          renderTemplates();
          showToast('Template deleted');
        }
      });
    });
  });
}

let _exportNameTarget = null;

function openExportNameDialog(templateOrBuiltin) {
  _exportNameTarget = templateOrBuiltin;
  const defaultName = templateOrBuiltin === 'builtin' ? 'Pitcher Off-season' : (templateOrBuiltin.name || '');
  $('#exportNameInput').value = defaultName;
  const dialog = $('#exportNameDialog');
  dialog.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { $('#exportNameInput').select(); }, 30);
}

function closeExportNameDialog() {
  _exportNameTarget = null;
  const dialog = $('#exportNameDialog');
  dialog.classList.add('hidden');
  dialog.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function openAccountSheet() {
  updateAccountUi();

  // Program selector — admin only
  const group = $('#programSelectorGroup');
  const select = $('#programSelect');
  if (isAdmin()) {
    const allTemplates = [
      { id: 'builtin', name: 'Pitcher Off-season (built-in)' },
      ...readLocalTemplates()
    ];
    select.innerHTML = allTemplates.map((t) =>
      `<option value="${escapeHtml(t.id)}"${t.id === state.activeTemplateId ? ' selected' : ''}>${escapeHtml(t.name)}</option>`
    ).join('');
    group.style.display = '';
  } else {
    group.style.display = 'none';
  }

  const sheet = $('#accountSheet');
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#profileName').focus(), 30);
}

function closeAccountSheet() {
  const sheet = $('#accountSheet');
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function openConfirm({ title, copy, confirmLabel = 'Confirm', action }) {
  state.confirmAction = action;
  $('#confirmTitle').textContent = title;
  $('#confirmCopy').textContent = copy;
  $('#confirmOkBtn').textContent = confirmLabel;
  const dialog = $('#confirmDialog');
  dialog.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeConfirm() {
  state.confirmAction = null;
  const dialog = $('#confirmDialog');
  dialog.classList.add('hidden');
  dialog.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function resetSelectedSession() {
  const date = state.selectedTodayDate;
  const dayKey = state.selectedTodayKey;
  const current = getSessionRecord(date, dayKey);
  const reset = {
    ...current,
    completed_sets: {},
    status: 'in_progress',
    completed_at: null,
    updated_at: new Date().toISOString()
  };
  queueSessionSync(reset);
  showToast('Session reset');
}

async function leaveAccount() {
  closeAccountSheet();
  if (state.mode === 'guest') {
    resetUserState();
    state.mode = 'setup';
    showOnlyScreen('setupScreen');
    return;
  }
  const button = $('#signOutBtn');
  setBusy(button, true, 'Signing out…');
  try {
    const { error } = await state.supabase.auth.signOut();
    if (error) throw error;
    resetUserState();
    showAuthScreen('signInPanel');
  } catch (error) {
    showToast(error.message || 'Could not sign out');
  } finally {
    setBusy(button, false);
  }
}

function bindGlobalEvents() {
  $$('.auth-tab').forEach((tab) => tab.addEventListener('click', () => showAuthPanel(tab.dataset.authPanel)));
  $('#forgotPasswordBtn').addEventListener('click', () => {
    $('#resetEmail').value = $('#signInEmail').value;
    showAuthPanel('resetRequestPanel');
  });
  $('#resetBackBtn').addEventListener('click', () => showAuthPanel('signInPanel'));

  $('#signInForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback();
    const button = $('button[type="submit"]', event.currentTarget);
    setBusy(button, true, 'Signing in…');
    try {
      await signIn($('#signInEmail').value.trim(), $('#signInPassword').value);
    } catch (error) {
      showFeedback(error.message || 'Sign-in failed.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#signUpForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback();
    const button = $('button[type="submit"]', event.currentTarget);
    setBusy(button, true, 'Creating account…');
    try {
      await signUp($('#signUpName').value.trim(), $('#signUpEmail').value.trim(), $('#signUpPassword').value);
    } catch (error) {
      showFeedback(error.message || 'Account creation failed.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#resetRequestForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback();
    const button = $('button[type="submit"]', event.currentTarget);
    setBusy(button, true, 'Sending…');
    try {
      await sendPasswordReset($('#resetEmail').value.trim());
    } catch (error) {
      showFeedback(error.message || 'Could not send the recovery email.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#newPasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback();
    const button = $('button[type="submit"]', event.currentTarget);
    setBusy(button, true, 'Updating…');
    try {
      await updateRecoveredPassword($('#newPassword').value);
    } catch (error) {
      showFeedback(error.message || 'Could not update the password.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  $('#previewModeBtn').addEventListener('click', enterPreviewMode);
  $('#retryBackendBtn').addEventListener('click', () => window.location.reload());
  $('#homeBrandBtn').addEventListener('click', () => navTo('today'));
  $('#quickThemeBtn').addEventListener('click', toggleQuickTheme);
  $('#accountBtn').addEventListener('click', openAccountSheet);
  $('#closeAccountBtn').addEventListener('click', closeAccountSheet);
  $('#closeAccountBackdrop').addEventListener('click', closeAccountSheet);
  $('#profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#saveProfileBtn');
    setBusy(button, true, 'Saving…');
    await saveProfileSettings();
    setBusy(button, false);
  });
  $$('#themeSelector [data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => applyTheme(button.dataset.themeChoice, { persist: true, queue: true }));
  });
  $('#signOutBtn').addEventListener('click', leaveAccount);

  $$('.nav-button').forEach((button) => button.addEventListener('click', () => navTo(button.dataset.viewTarget)));
  $('#jumpToWorkout').addEventListener('click', () => $('#todayWorkout').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('#resetToday').addEventListener('click', () => openConfirm({
    title: 'Reset this session?',
    copy: `This clears checked sets for ${formatDate(state.selectedTodayDate, { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    confirmLabel: 'Reset',
    action: resetSelectedSession
  }));

  $('#progressForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = progressPayloadFromForm();
    if (!progressHasValue(payload)) {
      showToast('Enter at least one measurement or note');
      return;
    }
    queueProgressSync(payload);
    resetProgressForm();
  });

  $('#exportProgress').addEventListener('click', exportProgressCsv);
  $('#exportAllBtn').addEventListener('click', exportAllData);

  // Template import / export
  const templateCsvInput = $('#templateCsvInput');
  $('#importTemplateBtn').addEventListener('click', () => templateCsvInput.click());
  templateCsvInput.addEventListener('change', () => {
    if (templateCsvInput.files[0]) handleCsvImport(templateCsvInput.files[0]);
    templateCsvInput.value = '';
  });
  $('#downloadBlankTemplateBtn').addEventListener('click', downloadBlankTemplate);

  $('#manualSyncBtn').addEventListener('click', async () => {
    if (state.mode !== 'cloud') {
      showToast('Preview data is already saved on this device');
      return;
    }
    await flushPending();
    await Promise.allSettled([loadProgressFromCloud(), loadRecentSessionsFromCloud(), loadWeekSessionsFromCloud()]);
    showToast('Sync checked');
  });

  $$('#metricTabs [data-metric]').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentMetric = button.dataset.metric;
      $$('#metricTabs [data-metric]').forEach((item) => item.classList.toggle('active', item === button));
      renderTrendChart();
    });
  });

  $('#confirmCancelBtn').addEventListener('click', closeConfirm);
  $('#confirmBackdrop').addEventListener('click', closeConfirm);
  $('#confirmOkBtn').addEventListener('click', () => {
    const action = state.confirmAction;
    closeConfirm();
    action?.();
  });

  // Export-name dialog
  $('#exportNameBackdrop').addEventListener('click', closeExportNameDialog);
  $('#exportNameCancelBtn').addEventListener('click', closeExportNameDialog);
  $('#exportNameForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!_exportNameTarget) return;
    const customName = $('#exportNameInput').value.trim();
    let tpl = _exportNameTarget;
    if (customName && tpl !== 'builtin') tpl = { ...tpl, name: customName };
    closeExportNameDialog();
    exportTemplateCsv(tpl, customName || undefined);
  });

  window.addEventListener('online', () => {
    if (state.mode === 'cloud') {
      updateSyncStatus('pending', 'Back online');
      flushPending();
    }
  });
  window.addEventListener('offline', () => {
    if (state.mode === 'cloud') updateSyncStatus('offline', 'Offline • saved local');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#exportNameDialog').classList.contains('hidden')) closeExportNameDialog();
    else if (!$('#confirmDialog').classList.contains('hidden')) closeConfirm();
    else if (!$('#accountSheet').classList.contains('hidden')) closeAccountSheet();
  });
}

function migrateLegacyLocalData() {
  const marker = storageKey('legacy-checked');
  if (localStorage.getItem(marker)) return;
  const legacyProgress = safeJsonParse(localStorage.getItem('progress'), []);
  if (Array.isArray(legacyProgress) && legacyProgress.length && !readLocalProgress().length) {
    const migrated = legacyProgress.map((entry, index) => {
      const broadRaw = String(entry.broad || '');
      const broadNumber = Number.parseFloat(broadRaw);
      const broadCm = Number.isFinite(broadNumber) ? (broadRaw.toLowerCase().includes('m') && !broadRaw.toLowerCase().includes('cm') ? broadNumber * 100 : broadNumber) : null;
      const dateCandidate = new Date(entry.date || Date.now());
      return {
        id: makeUuid(),
        user_id: scopeId(),
        measured_on: Number.isNaN(dateCandidate.getTime()) ? localIsoDate(new Date(Date.now() - index * 86400000)) : localIsoDate(dateCandidate),
        broad_jump_cm: broadCm,
        pullups: numberOrNull(String(entry.pull || '').match(/\d+(?:\.\d+)?/)?.[0] || null),
        split_squat_load_kg: numberOrNull(String(entry.split || '').match(/\d+(?:\.\d+)?/)?.[0] || null),
        split_squat_reps: numberOrNull(String(entry.split || '').match(/[x×]\s*(\d+)/i)?.[1] || null),
        single_leg_target_cm: null,
        single_leg_load_kg: null,
        bodyweight_kg: numberOrNull(String(entry.weight || '').match(/\d+(?:\.\d+)?/)?.[0] || null),
        notes: entry.single ? `Legacy single-leg squat: ${String(entry.single).slice(0, 300)}` : '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });
    writeLocalProgress(migrated);
  }
  localStorage.setItem(marker, '1');
}

async function init() {
  const authFragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const authQuery = new URLSearchParams(window.location.search);
  state.recoveryMode = authFragment.get('type') === 'recovery' || authQuery.get('type') === 'recovery';
  applyTheme(state.themePreference, { persist: true });
  bindGlobalEvents();
  renderStaticContent();
  $('#pDate').value = localIsoDate(new Date());
  $('#seasonLabel').textContent = 'September–April';
  $('#heroProgressRing').style.strokeDasharray = String(RING_CIRCUMFERENCE);

  // Safety net: if init takes more than 8 seconds, force show setup screen
  const bootTimeout = setTimeout(() => {
    if (document.getElementById('bootScreen') && !document.getElementById('bootScreen').classList.contains('hidden')) {
      console.warn('Boot timeout — forcing setup screen');
      showOnlyScreen('setupScreen');
      state.mode = 'setup';
    }
  }, 8000);

  try {
    await initializeBackend();
  } finally {
    clearTimeout(bootTimeout);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker unavailable', error));
  }
}

init();
