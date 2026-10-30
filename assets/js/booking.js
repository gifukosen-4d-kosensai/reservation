import { $, escapeHtml, formatDateTime, remaining } from './utils.js';
import { getOrCreateDeviceId } from './device.js';
import { openMessage, showError, clearError } from './dialogs.js';
/** 入力→注意事項→同意→API送信。送信中は再送信を受け付けません。 */
export function initBooking({ state, config, api, selectedSlot, loadSlots, resetTurnstile }) {
  const bookingForm = $('bookingForm'),
    bookingError = $('bookingError'),
    termsDialog = $('termsDialog');
  function validateBooking() {
    clearError(bookingError);
    const slot = selectedSlot();
    const partySize = Number($('partySize').value);
    const email = $('email').value.trim();
    const passphrase = $('passphrase').value;
    if (!slot) throw new Error('発表日時を選択してください。');
    if (new Date(slot.startAt).getTime() <= Date.now() + (state.clockOffset || 0))
      throw new Error('この発表枠の受付は終了しています。');
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 6)
      throw new Error('人数が正しくありません。');
    if (partySize > remaining(slot)) throw new Error('選択した人数分の残席がありません。');
    if (!$('email').checkValidity()) throw new Error('メールアドレスを確認してください。');
    if (passphrase.length < 6 || passphrase.length > 64)
      throw new Error('あいことばは6〜64文字で入力してください。');
    if (config.TURNSTILE_SITE_KEY && !state.turnstileToken)
      throw new Error('迷惑予約対策の確認を完了してください。');
    return {
      slotId: slot.id,
      partySize,
      email,
      passphrase,
      deviceId: getOrCreateDeviceId(),
      turnstileToken: state.turnstileToken,
    };
  }

  bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.submitting) return;
    try {
      state.pendingPayload = validateBooking();
      const slot = selectedSlot();
      $('termsSummary').innerHTML =
        `<strong>${escapeHtml(formatDateTime(slot.startAt))}</strong><br>${escapeHtml(slot.title)}<br>人数：${escapeHtml(state.pendingPayload.partySize)}名<br>メール：${escapeHtml(state.pendingPayload.email)}`;
      $('termsAgree').checked = false;
      $('termsConfirm').disabled = true;
      termsDialog.showModal();
    } catch (err) {
      showError(bookingError, err.message);
    }
  });

  $('termsAgree').addEventListener('change', (event) => {
    $('termsConfirm').disabled = !event.target.checked;
  });
  $('termsCancel').addEventListener('click', () => termsDialog.close());
  $('termsConfirm').addEventListener('click', async () => {
    if (state.submitting || !state.pendingPayload || !$('termsAgree').checked) return;
    state.submitting = true;
    $('termsConfirm').disabled = true;
    $('termsConfirm').textContent = '予約しています…';
    try {
      const body = await api('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(state.pendingPayload),
      });
      termsDialog.close();
      bookingForm.reset();
      state.pendingPayload = null;
      state.turnstileToken = '';
      resetTurnstile();
      await loadSlots({ quiet: true });
      openMessage(
        '予約が完了しました',
        `<p>予約を受け付けました。</p><p class="result-id">予約ID：${escapeHtml(body.reservation.id)}</p><p>${escapeHtml(formatDateTime(body.reservation.startAt))} / ${escapeHtml(body.reservation.partySize)}名</p><p>${body.emailSent ? '予約完了メールを送信しました。' : '予約は完了していますが、メール送信に失敗しました。係員へ予約IDをお伝えください。'}</p>`,
      );
    } catch (err) {
      termsDialog.close();
      showError(bookingError, err.message);
      await loadSlots({ quiet: true });
      resetTurnstile();
    } finally {
      state.submitting = false;
      state.pendingPayload = null;
      $('termsConfirm').textContent = '同意して予約する';
      $('termsConfirm').disabled = !$('termsAgree').checked;
    }
  });

  termsDialog.addEventListener('close', () => {
    state.pendingPayload = null;
  });
}

