import { $, escapeHtml, formatDateTime } from './utils.js';
import { showError, clearError } from './dialogs.js';
/** 予約の照会・キャンセルと表示タブ。予約の新規登録とは独立しています。 */
export function initManage({ state, api, loadSlots }) {
  const lookupForm = $('lookupForm'),
    lookupError = $('lookupError'),
    resultEl = $('reservationResult');
  function switchTab(which) {
    const book = which === 'book';
    $('tabBook').classList.toggle('active', book);
    $('tabManage').classList.toggle('active', !book);
    $('tabBook').setAttribute('aria-selected', String(book));
    $('tabManage').setAttribute('aria-selected', String(!book));
    $('bookPanel').hidden = !book;
    $('managePanel').hidden = book;
  }
  $('tabBook').addEventListener('click', () => switchTab('book'));
  $('tabManage').addEventListener('click', () => switchTab('manage'));

  lookupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(lookupError);
    resultEl.classList.remove('show');
    const email = $('lookupEmail').value.trim();
    const passphrase = $('lookupPassphrase').value;
    if (!$('lookupEmail').checkValidity() || passphrase.length < 6) {
      showError(lookupError, 'メールアドレスとあいことばを確認してください。');
      return;
    }
    try {
      const body = await api('/api/reservations/lookup', {
        method: 'POST',
        body: JSON.stringify({ email, passphrase }),
      });
      state.currentReservation = body.reservation;
      const r = body.reservation;
      resultEl.innerHTML = `<h3>予約内容</h3><p><strong>${escapeHtml(formatDateTime(r.startAt))}</strong><br>${escapeHtml(r.title)}<br>${escapeHtml(r.partySize)}名</p><p class="result-id">予約ID：${escapeHtml(r.id)}</p><button id="cancelReservation" class="btn-danger cancel-reservation" type="button">この予約をキャンセル</button>`;
      resultEl.classList.add('show');
      $('cancelReservation').addEventListener('click', cancelCurrentReservation);
    } catch (err) {
      showError(lookupError, err.message);
    }
  });

  async function cancelCurrentReservation() {
    if (!state.currentReservation) return;
    const ok = window.confirm('この予約をキャンセルします。よろしいですか？');
    if (!ok) return;
    try {
      await api('/api/reservations/cancel', {
        method: 'POST',
        body: JSON.stringify({
          email: $('lookupEmail').value.trim(),
          passphrase: $('lookupPassphrase').value,
        }),
      });
      state.currentReservation = null;
      resultEl.innerHTML = '<p>予約をキャンセルしました。</p>';
      await loadSlots({ quiet: true });
    } catch (err) {
      showError(lookupError, err.message);
    }
  }
}
