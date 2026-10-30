const { normalizeEmail } = require('./security');
const { apiError } = require('./errors');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{12,128}$/;
function validateReservationInput(body) {
  const slotId = String(body?.slotId || '').trim();
  const email = normalizeEmail(body?.email);
  const passphrase = String(body?.passphrase || '');
  const deviceId = String(body?.deviceId || '').trim();
  const partySize = Number(body?.partySize);
  const priorityCode = String(body?.priorityCode || '').trim();

  if (!slotId || slotId.length > 100)
    throw apiError(400, 'INVALID_SLOT', '発表日時を選択してください。');
  if (!EMAIL_RE.test(email) || email.length > 254)
    throw apiError(400, 'INVALID_EMAIL', 'メールアドレスを確認してください。');
  if (passphrase.length < 6 || passphrase.length > 64)
    throw apiError(400, 'INVALID_PASSPHRASE', 'あいことばは6〜64文字で入力してください。');
  if (!DEVICE_RE.test(deviceId))
    throw apiError(
      400,
      'INVALID_DEVICE',
      '端末IDが正しくありません。ページを再読み込みしてください。',
    );
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 6)
    throw apiError(400, 'INVALID_PARTY_SIZE', '人数が正しくありません。');
  if (priorityCode.length > 128) throw apiError(400, 'INVALID_FAMILY_CODE', '家族向け共通コードが正しくありません。');
  return { slotId, email, passphrase, deviceId, partySize, priorityCode };
}
// 確認とキャンセルは同じ資格情報検証を使用します。
function validateCredentials(body) {
  const email = normalizeEmail(body?.email);
  const passphrase = String(body?.passphrase || '');
  if (
    !EMAIL_RE.test(email) ||
    email.length > 254 ||
    passphrase.length < 6 ||
    passphrase.length > 64
  ) {
    throw apiError(
      400,
      'INVALID_CREDENTIALS',
      'メールアドレスまたはあいことばを確認してください。',
    );
  }
  return { email, passphrase };
}
module.exports = { validateReservationInput, validateCredentials };

