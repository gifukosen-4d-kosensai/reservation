const express = require('express');
const helmet = require('helmet');
const crypto = require('node:crypto');
const path = require('node:path');
const { rateLimit } = require('express-rate-limit');
const { decryptText, verifyPassphrase } = require('./security');
const { ensureFamilyCode, getFamilyCode } = require('./booking-policy');

// This app is served on a separate HTTPS listener, never by the public API tunnel.
function createAdminApp({ db, broadcast = () => {} }) {
  ensureFamilyCode(db);
  const app = express();
  const sessions = new Map();
  const lifetime = 8 * 60 * 60 * 1000;
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '4kb' }));
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const origin = req.get('origin');
      if (!origin || origin !== `https://${req.get('host')}`) return res.status(403).json({ message: 'アクセス元が不正です。' });
    }
    next();
  });
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  function getSession(req) {
    const token = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('admin_session='))?.slice(14);
    const expires = sessions.get(token);
    if (!expires || expires <= Date.now()) { if (token) sessions.delete(token); return null; }
    return token;
  }
  app.post('/admin-api/login', loginLimit, async (req, res, next) => {
    try {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (password.length > 256 || !(await verifyPassphrase(password, process.env.ADMIN_PASSWORD_HASH))) return res.status(401).json({ message: 'パスワードが違います。' });
      for (const [token, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(token);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, Date.now() + lifetime);
      res.set('Set-Cookie', `admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${lifetime / 1000}`);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.use('/admin-api', (req, res, next) => getSession(req) ? next() : res.status(401).json({ message: 'ログインしてください。' }));
  app.post('/admin-api/logout', (req, res) => {
    sessions.delete(getSession(req));
    res.set('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  app.get('/admin-api/dashboard', (_req, res, next) => {
    try {
      const slots = db.prepare(`SELECT s.*, COALESCE(SUM(CASE WHEN r.status='confirmed' THEN r.party_size ELSE 0 END),0) reserved,
        COALESCE(SUM(CASE WHEN c.reservation_id IS NOT NULL THEN r.party_size ELSE 0 END),0) checked_in
        FROM slots s LEFT JOIN reservations r ON r.slot_id=s.id LEFT JOIN checkins c ON c.reservation_id=r.id
        GROUP BY s.id ORDER BY s.start_at`).all();
      const reservations = db.prepare(`SELECT r.id, r.slot_id, r.party_size, r.booking_type, r.status, r.email_status, r.created_at, r.cancelled_at,
        r.email_ciphertext, c.checked_in_at FROM reservations r LEFT JOIN checkins c ON c.reservation_id=r.id ORDER BY r.created_at DESC`).all()
        .map(({ email_ciphertext, ...row }) => ({ ...row, email: decryptText(email_ciphertext) }));
      res.json({ serverTime: new Date().toISOString(), slots, reservations, familyCode: getFamilyCode(db) });
    } catch (error) { next(error); }
  });
  app.post('/admin-api/checkin', (req, res) => {
    const { id, checkedIn } = req.body || {};
    if (typeof id !== 'string' || id.length > 100 || typeof checkedIn !== 'boolean') return res.status(400).json({ message: '入力が不正です。' });
    const row = db.prepare("SELECT id FROM reservations WHERE id=? AND status='confirmed'").get(id);
    if (!row) return res.status(404).json({ message: '有効な予約が見つかりません。' });
    if (checkedIn) db.prepare('INSERT OR IGNORE INTO checkins(reservation_id) VALUES(?)').run(id);
    else db.prepare('DELETE FROM checkins WHERE reservation_id=?').run(id);
    res.json({ ok: true });
  });
  const deleteReservation = db.transaction((id) => {
    const reservation = db.prepare('SELECT id FROM reservations WHERE id=?').get(id);
    if (!reservation) return false;
    db.prepare('DELETE FROM checkins WHERE reservation_id=?').run(id);
    db.prepare('DELETE FROM reservations WHERE id=?').run(id);
    return true;
  });
  app.post('/admin-api/delete', (req, res, next) => {
    const { id } = req.body || {};
    if (typeof id !== 'string' || !id || id.length > 100) return res.status(400).json({ message: '予約IDが不正です。' });
    try {
      if (!deleteReservation(id)) return res.status(404).json({ message: '予約が見つかりません。' });
      broadcast();
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  app.use(express.static(path.resolve(__dirname, '../admin'), { index: 'index.html', fallthrough: false }));
  app.use((error, _req, res, _next) => {
    console.error('Admin error:', error.message);
    res.status(error.status || 500).json({ message: '管理画面でエラーが発生しました。' });
  });
  return app;
}
module.exports = { createAdminApp };

