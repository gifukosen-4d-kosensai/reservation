import { $, escapeHtml, formatDateTime, remaining } from './utils.js';
/** 枠の取得・選択・描画。予約の確定処理はbooking.jsにあります。 */
export function createSlots({ state, api, setApiStatus }) {
  const slotsEl = $('slots'),
    slotSelect = $('slotId'),
    bookingForm = $('bookingForm');
  function selectedSlot() {
    return state.slots.find((s) => s.id === slotSelect.value) || null;
  }

  function renderSlots() {
    if (!state.slots.length) {
      slotsEl.innerHTML = '<p>現在、予約可能な発表枠はありません。</p>';
      slotSelect.innerHTML = '<option value="">日時を選択してください</option>';
      return;
    }

    const current = slotSelect.value;
    slotsEl.innerHTML = state.slots
      .map((slot) => {
        const left = remaining(slot);
        const usedPct = Math.min(
          100,
          Math.round((Number(slot.reserved) / Number(slot.capacity)) * 100),
        );
        const soldout = left <= 0;
        return `
        <article class="slot-card ${current === slot.id ? 'selected' : ''} ${soldout ? 'soldout' : ''}" data-slot-card="${escapeHtml(slot.id)}">
          <div>
            <div class="slot-time">${escapeHtml(formatDateTime(slot.startAt))}</div>
            <div class="slot-title">${escapeHtml(slot.title)}</div>
            <div class="slot-meta">残り <strong>${left}</strong> / ${escapeHtml(slot.capacity)} 名</div>
            <div class="capacity" aria-hidden="true"><span style="width:${usedPct}%"></span></div>
          </div>
          <button class="slot-select" type="button" data-select-slot="${escapeHtml(slot.id)}" ${soldout ? 'disabled' : ''}>${soldout ? '満席' : '選択'}</button>
        </article>`;
      })
      .join('');

    slotSelect.innerHTML =
      '<option value="">日時を選択してください</option>' +
      state.slots
        .filter((slot) => remaining(slot) > 0)
        .map(
          (slot) =>
            `<option value="${escapeHtml(slot.id)}">${escapeHtml(formatDateTime(slot.startAt))} / 残り${remaining(slot)}名</option>`,
        )
        .join('');
    if (state.slots.some((slot) => slot.id === current && remaining(slot) > 0))
      slotSelect.value = current;

    slotsEl.querySelectorAll('[data-select-slot]').forEach((button) => {
      button.addEventListener('click', () => {
        slotSelect.value = button.dataset.selectSlot;
        renderSlots();
        bookingForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  async function loadSlots({ quiet = false } = {}) {
    try {
      const body = await api('/api/slots', { method: 'GET', headers: {} });
      state.slots = Array.isArray(body.slots) ? body.slots : [];
      renderSlots();
      setApiStatus('online', '4D Kosensai DBへ接続しています…');
    } catch (err) {
      if (!quiet)
        slotsEl.innerHTML = `<p>データを取得できませんでした。<br><small>${escapeHtml(err.message)}</small></p>`;
      setApiStatus('offline', 'サーバーに接続できません');
    }
  }

  slotSelect.addEventListener('change', renderSlots);
  return { selectedSlot, renderSlots, loadSlots };
}
