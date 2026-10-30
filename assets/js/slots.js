import { $, escapeHtml, formatDateTime, remaining } from './utils.js';

const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateLabel = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short',
});
function dateKey(iso) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 発表日タブと枠の選択。開始時刻の判定はサーバーの時刻を基準にします。 */
export function createSlots({ state, api, setApiStatus }) {
  const slotsEl = $('slots'), tabsEl = $('dateTabs'), slotSelect = $('slotId'), bookingForm = $('bookingForm');
  let selectedDate = '';
  let closeTimer;
  const now = () => Date.now() + (state.clockOffset || 0);
  const closed = (slot) => new Date(slot.startAt).getTime() <= now();
  function selectedSlot() {
    return state.slots.find((slot) => slot.id === slotSelect.value) || null;
  }
  function scheduleNextClose() {
    clearTimeout(closeTimer);
    const times = state.slots.map((slot) => new Date(slot.startAt).getTime()).filter((time) => time > now());
    if (times.length) closeTimer = setTimeout(renderSlots, Math.min(2147483647, Math.max(0, Math.min(...times) - now() + 50)));
  }
  function renderSlots() {
    clearTimeout(closeTimer);
    const focusWasOnTabs = tabsEl.contains(document.activeElement);
    if (!state.slots.length) {
      tabsEl.innerHTML = '';
      slotsEl.innerHTML = '<p>現在、予約可能な発表枠はありません。</p>';
      slotSelect.innerHTML = '<option value="">日時を選択してください</option>';
      return;
    }
    const dates = [...new Set(state.slots.map((slot) => dateKey(slot.startAt)))];
    if (!dates.includes(selectedDate)) selectedDate = dateKey((state.slots.find((slot) => !closed(slot)) || state.slots[0]).startAt);
    tabsEl.innerHTML = dates.map((date) => {
      const slot = state.slots.find((item) => dateKey(item.startAt) === date);
      const selected = date === selectedDate;
      return `<button type="button" role="tab" id="date-tab-${escapeHtml(date)}" class="date-tab" data-date="${escapeHtml(date)}" aria-selected="${selected}" aria-controls="slots" tabindex="${selected ? '0' : '-1'}">${escapeHtml(dateLabel.format(new Date(slot.startAt)))}</button>`;
    }).join('');
    slotsEl.setAttribute('aria-labelledby', `date-tab-${selectedDate}`);
    if (focusWasOnTabs) tabsEl.querySelector('[aria-selected="true"]')?.focus();
    const visible = state.slots.filter((slot) => dateKey(slot.startAt) === selectedDate);
    const current = slotSelect.value;
    slotsEl.innerHTML = visible.map((slot) => {
      const left = remaining(slot), ended = closed(slot), soldout = left <= 0;
      const usedPct = Math.min(100, Math.round((Number(slot.reserved) / Number(slot.capacity)) * 100));
      return `
        <article class="slot-card ${current === slot.id && !ended ? 'selected' : ''} ${ended || soldout ? 'soldout' : ''}" data-slot-card="${escapeHtml(slot.id)}">
          <div><div class="slot-time">${escapeHtml(formatDateTime(slot.startAt))}</div>
            <div class="slot-title">${escapeHtml(slot.title)}</div>
            <div class="slot-meta">残り <strong>${left}</strong> / ${escapeHtml(slot.capacity)} 名</div>
            <div class="capacity" aria-hidden="true"><span style="width:${usedPct}%"></span></div></div>
          <button class="slot-select" type="button" data-select-slot="${escapeHtml(slot.id)}" ${ended || soldout ? 'disabled' : ''}>${ended ? '受付終了' : soldout ? '満席' : '選択'}</button>
        </article>`;
    }).join('');
    slotSelect.innerHTML = '<option value="">日時を選択してください</option>' + visible
      .filter((slot) => !closed(slot) && remaining(slot) > 0)
      .map((slot) => `<option value="${escapeHtml(slot.id)}">${escapeHtml(formatDateTime(slot.startAt))} / 残り${remaining(slot)}名</option>`).join('');
    if (visible.some((slot) => slot.id === current && !closed(slot) && remaining(slot) > 0)) slotSelect.value = current;
    slotsEl.querySelectorAll('[data-select-slot]').forEach((button) => button.addEventListener('click', () => {
      slotSelect.value = button.dataset.selectSlot;
      renderSlots();
      bookingForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    scheduleNextClose();
  }
  tabsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (!button || button.dataset.date === selectedDate) return;
    selectedDate = button.dataset.date;
    slotSelect.value = '';
    renderSlots();
    tabsEl.querySelector('[aria-selected="true"]')?.focus();
  });
  tabsEl.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...tabsEl.querySelectorAll('[role="tab"]')];
    if (!tabs.length) return;
    const index = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[next].click();
  });
  async function loadSlots({ quiet = false } = {}) {
    try {
      const requestStarted = Date.now();
      const body = await api('/api/slots', { method: 'GET', headers: {} });
      const serverTime = Date.parse(body.serverTime);
      if (Number.isFinite(serverTime)) state.clockOffset = serverTime - (requestStarted + Date.now()) / 2;
      state.slots = Array.isArray(body.slots) ? body.slots : [];
      renderSlots();
      setApiStatus('online', '4D Kosensai DBへ接続しています…');
    } catch (err) {
      if (!quiet) slotsEl.innerHTML = `<p>データを取得できませんでした。<br><small>${escapeHtml(err.message)}</small></p>`;
      setApiStatus('offline', 'サーバーに接続できません');
    }
  }
  slotSelect.addEventListener('change', renderSlots);
  return { selectedSlot, renderSlots, loadSlots };
}

