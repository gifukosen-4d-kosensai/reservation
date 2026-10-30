const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const createSlotRepository = require('./repositories/slots');
const createReservationRepository = require('./repositories/reservations');
const { createReservationService } = require('./services/reservations');
const { createEvents } = require('./events');
const { ensureFamilyCode, familyOpensAt, generalOpensAt } = require('./booking-policy');
/** 起動と分離し、テストでは一時DB・偽メール送信を注入できます。 */
function createApp({
  db,
  mailer = require('./mailer'),
  verifyTurnstile = require('./turnstile').verifyTurnstile,
  now = Date.now,
}) {
  ensureFamilyCode(db);
  const app = express();
  const trustProxy = Number(process.env.TRUST_PROXY || 0);
  if (trustProxy) app.set('trust proxy', trustProxy);

  const allowedOrigins = new Set(
    String(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: false, // This server only returns JSON/SSE, not HTML.
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients have no Origin. Browsers must exactly match the allow-list.
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS.'));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '20kb', strict: true }));

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 240,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMIT',
      message: '短時間に予約操作が多すぎます。時間を空けて再試行してください。',
    },
  });
  const lookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMIT',
      message: '短時間に確認操作が多すぎます。時間を空けて再試行してください。',
    },
  });
  app.use('/api', generalLimiter);

  const slots = createSlotRepository(db);
  const events = createEvents();
  const service = createReservationService({
    repository: createReservationRepository(db, now),
    mailer,
    verifyTurnstile,
    events,
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.get('/api/slots', (_req, res) =>
    res.set('Cache-Control', 'no-store').json({ slots: slots.list(), serverTime: new Date(now()).toISOString(), booking: { familyOpensAt, generalOpensAt } }),
  );
  app.get('/api/events', events.connect);
  // Express 5がasyncハンドラーの例外を下の共通エラーハンドラーへ渡します。
  app.post('/api/reservations', bookingLimiter, async (req, res) =>
    res.status(201).json(await service.book(req.body, req.ip)),
  );
  app.post('/api/reservations/lookup', lookupLimiter, async (req, res) =>
    res.json(await service.lookup(req.body)),
  );
  app.post('/api/reservations/cancel', bookingLimiter, async (req, res) =>
    res.json(await service.cancel(req.body)),
  );
  app.use((error, _req, res, _next) => {
    if (error?.message === 'Origin is not allowed by CORS.') {
      return res
        .status(403)
        .json({ code: 'CORS_DENIED', message: 'このサイトからのアクセスは許可されていません。' });
    }
    const status = Number(error.status || 500);
    if (status >= 500) console.error(error);
    res.status(status).json({
      code: error.code || 'INTERNAL_ERROR',
      message: status >= 500 ? '予約サーバーでエラーが発生しました。' : error.message,
    });
  });

  return { app, close: events.close, broadcast: events.broadcast };
}
module.exports = { createApp };

