const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { createApp } = require('../src/app');
const { validateReservationInput } = require('../src/validation');
process.env.DATA_ENCRYPTION_KEY_B64 = crypto.randomBytes(32).toString('base64');
process.env.IDENTIFIER_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ALLOWED_ORIGINS = 'https://allowed.example';
process.env.TRUST_PROXY = '0';
const payload = (n, extra = {}) => ({
  slotId: 'test',
  partySize: 1,
  email: `user${n}@example.com`,
  passphrase: 'test-password',
  deviceId: `device-test-${String(n).padStart(4, '0')}`,
  ...extra,
});

test('入力検証: 空欄・整数でない人数・過大人数を拒否', () => {
  for (const patch of [
    { email: 'bad' },
    { partySize: 1.5 },
    { partySize: 7 },
    { passphrase: 'short' },
    { deviceId: 'bad' },
    { slotId: '' },
  ]) {
    assert.throws(
      () => validateReservationInput(payload(1, patch)),
      (e) => e.status === 400,
    );
  }
  assert.equal(
    validateReservationInput(payload(1, { email: ' USER@EXAMPLE.COM ' })).email,
    'user@example.com',
  );
});

test('HTTP経由: 同意後API契約、重複、照会、取消、定員競合、メール障害、SSE', async (t) => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../src/schema.sql'), 'utf8'));
  const insert = db.prepare(
    'INSERT INTO slots(id,title,start_at,end_at,capacity) VALUES(?,?,?,?,?)',
  );
  insert.run('test', '発表', '2099-01-01T10:00:00+09:00', '2099-01-01T11:00:00+09:00', 6);
  insert.run('race', '同時予約', '2099-01-01T10:00:00+09:00', '2099-01-01T11:00:00+09:00', 1);
  insert.run('past', '終了', '2000-01-01T10:00:00+09:00', '2000-01-01T11:00:00+09:00', 6);
  insert.run('started', '開催中', new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString(), 6);
  let mailFail = false;
  const mailer = { sendBookedEmail: async () => !mailFail, sendCancelledEmail: async () => true };
  const { app, close } = createApp({
    db,
    mailer,
    verifyTurnstile: async (token) => token !== 'invalid',
    now: () => Math.max(Date.now(), Date.parse('2026-10-30T19:00:00+09:00')),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(route, body, origin = 'https://allowed.example') {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  }
  const book = (body) => post('/api/reservations', body);
  assert.equal((await book(payload(0, { turnstileToken: 'invalid' }))).code, 'BOT_CHECK_FAILED');
  assert.equal((await post('/api/reservations', payload(0), 'https://evil.example')).status, 403);
  assert.equal((await book(payload(0, { slotId: 'past' }))).code, 'SLOT_CLOSED');
  assert.equal((await book(payload(0, { slotId: 'started' }))).code, 'SLOT_CLOSED');
  const stream = await fetch(base + '/api/events');
  const reader = stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
  const created = await book(payload(1, { partySize: 2 }));
  assert.equal(created.status, 201);
  assert.equal(created.emailSent, true);
  assert.match(new TextDecoder().decode((await reader.read()).value), /slots-updated/);
  await reader.cancel();
  assert.equal((await book(payload(2, { email: 'user1@example.com' }))).code, 'DUPLICATE_EMAIL');
  assert.equal(
    (await book(payload(2, { deviceId: payload(1).deviceId }))).code,
    'DUPLICATE_DEVICE',
  );
  const credentials = { email: 'user1@example.com', passphrase: 'test-password' };
  assert.equal(
    (await post('/api/reservations/lookup', { ...credentials, passphrase: 'wrong-password' }))
      .status,
    404,
  );
  const found = await post('/api/reservations/lookup', credentials);
  assert.equal(found.reservation.id, created.reservation.id);
  assert.equal(found.reservation.partySize, 2);
  assert.equal((await post('/api/reservations/cancel', credentials)).ok, true);
  assert.equal((await post('/api/reservations/lookup', credentials)).status, 404);
  const results = await Promise.all([
    book(payload(3, { slotId: 'race' })),
    book(payload(4, { slotId: 'race' })),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  mailFail = true;
  const failed = await book(payload(1));
  assert.equal(failed.status, 201);
  assert.equal(failed.emailSent, false);
  const stored = db.prepare('SELECT * FROM reservations WHERE id=?').get(failed.reservation.id);
  assert.equal(stored.email_status, 'failed');
  assert.notEqual(stored.email_ciphertext, credentials.email);
  assert.notEqual(stored.passphrase_hash, credentials.passphrase);
  const slots = await (await fetch(base + '/api/slots')).json();
  assert.equal(slots.slots.find((s) => s.id === 'race').remaining, 0);
  assert.ok(Number.isFinite(Date.parse(slots.serverTime)));
  assert.equal(slots.booking.familyOpensAt, '2026-10-30T11:30:00+09:00');
  assert.equal(slots.booking.generalOpensAt, '2026-10-30T19:00:00+09:00');
  assert.equal(JSON.stringify(slots).includes(require('../src/booking-policy').getFamilyCode(db)), false);
});

test('先行予約と一般予約の開始時刻・共通コード・定員', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../src/schema.sql'), 'utf8'));
  db.prepare('INSERT INTO slots(id,title,start_at,end_at,capacity) VALUES(?,?,?,?,?)')
    .run('test', '発表', '2099-01-01T10:00:00+09:00', '2099-01-01T11:00:00+09:00', 2);
  const { ensureFamilyCode, getFamilyCode } = require('../src/booking-policy');
  ensureFamilyCode(db);
  const code = getFamilyCode(db);
  ensureFamilyCode(db);
  assert.equal(getFamilyCode(db), code);
  assert.notEqual(db.prepare('SELECT code_ciphertext FROM family_code').get().code_ciphertext, code);
  let now = Date.parse('2026-10-30T11:29:59.999+09:00');
  const repo = require('../src/repositories/reservations')(db, () => now);
  const book = (id, priorityCode) => repo.create({ slotId: 'test', partySize: 1, priorityCode }, { reservationId: id, emailHash: id, deviceHash: id, emailCiphertext: id, passphraseHash: id });
  assert.throws(() => book('before', code), { code: 'BOOKING_NOT_OPEN' });
  now = Date.parse('2026-10-30T11:30:00+09:00');
  assert.throws(() => book('missing', ''), { code: 'FAMILY_CODE_REQUIRED' });
  assert.throws(() => book('bad', 'wrong'), { code: 'INVALID_FAMILY_CODE' });
  book('family', code);
  assert.equal(db.prepare('SELECT booking_type FROM reservations WHERE id=?').get('family').booking_type, 'family');
  now = Date.parse('2026-10-30T18:59:59.999+09:00');
  assert.throws(() => book('early', ''), { code: 'FAMILY_CODE_REQUIRED' });
  now = Date.parse('2026-10-30T19:00:00+09:00');
  assert.throws(() => book('bad-after', 'wrong'), { code: 'INVALID_FAMILY_CODE' });
  book('general', '');
  assert.equal(db.prepare('SELECT booking_type FROM reservations WHERE id=?').get('general').booking_type, 'general');
  assert.throws(() => book('full', ''), { code: 'NOT_ENOUGH_SEATS' });
  db.close();
});

