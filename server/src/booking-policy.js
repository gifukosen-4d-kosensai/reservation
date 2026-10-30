const crypto = require('node:crypto');
const { encryptText, decryptText, hmacIdentifier } = require('./security');
const { apiError } = require('./errors');

const familyOpensAt = '2026-10-30T11:30:00+09:00';
const generalOpensAt = '2026-10-30T19:00:00+09:00';

function ensureFamilyCode(db) {
  if (db.prepare('SELECT 1 FROM family_code WHERE id=1').get()) return;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(crypto.randomBytes(12), (byte) => alphabet[byte & 31]).join('');
  db.prepare('INSERT OR IGNORE INTO family_code(id,code_ciphertext,code_hash) VALUES(1,?,?)')
    .run(encryptText(code), hmacIdentifier(`family-code:${code}`));
}
function getFamilyCode(db) {
  return decryptText(db.prepare('SELECT code_ciphertext FROM family_code WHERE id=1').get().code_ciphertext);
}
function classifyBooking(db, inputCode, now) {
  if (now < Date.parse(familyOpensAt))
    throw apiError(403, 'BOOKING_NOT_OPEN', '予約受付は10月30日11:30から開始します。');
  if (!inputCode) {
    if (now < Date.parse(generalOpensAt))
      throw apiError(403, 'FAMILY_CODE_REQUIRED', '先行予約には家族向け共通コードが必要です。');
    return 'general';
  }
  const expected = Buffer.from(db.prepare('SELECT code_hash FROM family_code WHERE id=1').get().code_hash, 'hex');
  const actual = Buffer.from(hmacIdentifier(`family-code:${inputCode}`), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual))
    throw apiError(403, 'INVALID_FAMILY_CODE', '家族向け共通コードが正しくありません。');
  return 'family';
}
module.exports = { familyOpensAt, generalOpensAt, ensureFamilyCode, getFamilyCode, classifyBooking };

