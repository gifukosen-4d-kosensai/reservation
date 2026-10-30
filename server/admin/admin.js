const $ = (id) => document.getElementById(id);
let data = null;
let clockOffset = 0;
let pending = false;
let deleteId = null;
const fmt = (date) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const fmtDate = (date) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(date));
const fmtTime = (date, seconds = false) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(new Date(date));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
async function api(path, options = {}) {
  const response = await fetch(`/admin-api${path}`, { ...options, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const body = await response.json();
  if (response.status === 401 && path !== '/login') { showLogin(); throw new Error('セッションが切れました。'); }
  if (!response.ok) throw new Error(body.message || '通信に失敗しました。');
  return body;
}
function showLogin() { $('login').hidden = false; $('dashboard').hidden = true; $('logout').hidden = true; $('dashboardNav').hidden = true; $('familyCode').value = ''; $('familyCode').type = 'password'; $('showFamilyCode').textContent = '表示'; data = null; }
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('themeLabel').textContent = theme === 'dark' ? 'ライトモード' : 'ダークモード';
  $('themeToggle').setAttribute('aria-pressed', String(theme === 'light'));
  try { localStorage.setItem('reservation-admin-theme', theme); } catch (_) { /* storage is optional */ }
}
let savedTheme;
try { savedTheme = localStorage.getItem('reservation-admin-theme'); } catch (_) { /* storage is optional */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark');
$('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
function updateClock() {
  const now = new Date(Date.now() + clockOffset);
  $('clockDate').textContent = fmtDate(now);
  $('clock').textContent = fmtTime(now, true);
  if (!data) return;
  const current = data.slots.filter((slot) => slot.is_active && new Date(slot.start_at) <= now && new Date(slot.end_at) > now);
  const next = data.slots.find((slot) => slot.is_active && slot.reserved > 0 && new Date(slot.start_at) > now);
  $('next').hidden = !next;
  $('nextDate').hidden = !next;
  $('nextEmpty').hidden = Boolean(next);
  if (next) { $('next').textContent = fmtTime(next.start_at); $('nextDate').textContent = `${fmtDate(next.start_at)} / ${next.title}`; }
  $('currentCount').hidden = !current.length;
  $('currentEmpty').hidden = Boolean(current.length);
  if (current.length) $('current').textContent = String(current.reduce((sum, slot) => sum + slot.reserved, 0));
}
function render() {
  $('familyCode').value = data.familyCode;
  const selected = $('slotFilter').value;
  $('slotFilter').innerHTML = '<option value="">すべて</option><option value="__current__">現在開催中の枠</option>' + data.slots.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(fmt(s.start_at))} ${escapeHtml(s.title)}</option>`).join('');
  $('slotFilter').value = selected;
  $('checked').textContent = String(data.slots.reduce((sum, s) => sum + s.checked_in, 0));
  $('slots').innerHTML = data.slots.map((s) => `<div class="slot"><div><strong>${escapeHtml(s.title)}</strong><div class="muted">${escapeHtml(fmt(s.start_at))} 〜 ${escapeHtml(fmt(s.end_at))}${s.is_active ? '' : ' / 非公開'}</div></div><div>予約 ${s.reserved} / ${s.capacity} 人<br><span class="muted">受付済み ${s.checked_in} 人</span></div></div>`).join('') || '発表枠がありません。';
  const query = $('search').value.trim().toLowerCase();
  const slots = new Map(data.slots.map((s) => [s.id, s]));
  const now = Date.now() + clockOffset;
  const filter = $('slotFilter').value;
  const rows = data.reservations.filter((r) => { const s = slots.get(r.slot_id); const matchesSlot = !filter || (filter === '__current__' ? s && s.is_active && new Date(s.start_at).getTime() <= now && new Date(s.end_at).getTime() > now && r.status === 'confirmed' : r.slot_id === filter); return matchesSlot && (!$('stateFilter').value || r.status === $('stateFilter').value) && (!query || `${r.email} ${r.id}`.toLowerCase().includes(query)); });
  const dbTime = (v) => fmt(`${v.replace(' ', 'T')}Z`);
  $('reservations').innerHTML = rows.map((r) => {
    const s = slots.get(r.slot_id);
    const checkin = r.status === 'confirmed'
      ? `<button class="row-button ${r.checked_in_at ? 'secondary' : ''}" data-action="checkin" data-id="${escapeHtml(r.id)}" data-checked="${r.checked_in_at ? 'false' : 'true'}">${r.checked_in_at ? '受付取消' : '受付済みにする'}</button>`
      : '';
    const checkedAt = r.checked_in_at ? `<div class="muted">受付: ${escapeHtml(dbTime(r.checked_in_at))}</div>` : '';
    return `<tr><td>${s ? escapeHtml(fmt(s.start_at)) : '—'}<div class="muted">${escapeHtml(s?.title || r.slot_id)}</div></td><td>${escapeHtml(r.email)}<div class="muted">${escapeHtml(r.id)}<br>予約: ${escapeHtml(dbTime(r.created_at))}</div></td><td>${r.party_size} 人</td><td>${r.status === 'confirmed' ? '確定' : 'キャンセル'}<div class="muted">${r.booking_type === 'family' ? '家族向け' : '一般'}<br>${r.cancelled_at ? `取消: ${escapeHtml(dbTime(r.cancelled_at))}<br>` : ''}メール: ${escapeHtml(({sent:'送信済み',failed:'送信失敗',pending:'送信待ち'})[r.email_status] || r.email_status)}</div></td><td><div class="row-actions">${checkin}<button class="row-button danger" data-action="delete" data-id="${escapeHtml(r.id)}">削除</button></div>${checkedAt}</td></tr>`;
  }).join('');
  $('empty').hidden = rows.length > 0;
  updateClock();
}
async function refresh() {
  if (pending) return;
  pending = true;
  try { data = await api('/dashboard'); clockOffset = new Date(data.serverTime).getTime() - Date.now(); $('login').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false; $('dashboardNav').hidden = false; $('status').textContent = `更新: ${fmt(data.serverTime)}`; render(); }
  catch (error) { if (!$('dashboard').hidden) $('status').textContent = error.message; }
  finally { pending = false; }
}
$('loginForm').addEventListener('submit', async (event) => { event.preventDefault(); $('loginError').textContent = ''; try { await api('/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) }); $('password').value = ''; await refresh(); } catch (error) { $('loginError').textContent = error.message; } });
$('logout').addEventListener('click', async () => { try { await api('/logout', { method: 'POST' }); showLogin(); } catch (error) { $('status').textContent = error.message; } });
$('refresh').addEventListener('click', refresh);
$('showFamilyCode').addEventListener('click', () => { const shown = $('familyCode').type === 'text'; $('familyCode').type = shown ? 'password' : 'text'; $('showFamilyCode').textContent = shown ? '表示' : '隠す'; });
$('copyFamilyCode').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('familyCode').value); $('familyCodeStatus').textContent = 'コピーしました'; } catch (_) { $('familyCode').type = 'text'; $('showFamilyCode').textContent = '隠す'; $('familyCode').select(); $('familyCodeStatus').textContent = '選択したコードをコピーしてください'; } });
['slotFilter', 'stateFilter', 'search'].forEach((id) => $(id).addEventListener('input', () => data && render()));
$('reservations').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  if (button.dataset.action === 'delete') {
    const reservation = data?.reservations.find((row) => row.id === button.dataset.id);
    if (!reservation) return;
    const slot = data.slots.find((item) => item.id === reservation.slot_id);
    deleteId = reservation.id;
    $('deleteSummary').textContent = `${slot ? fmt(slot.start_at) : '日時不明'} / ${slot?.title || reservation.slot_id}\n${reservation.email}\n${reservation.party_size}人 / 予約ID: ${reservation.id}`;
    $('deleteError').textContent = '';
    $('deleteDialog').showModal();
    return;
  }
  if (button.dataset.action !== 'checkin') return;
  button.disabled = true;
  try { await api('/checkin', { method: 'POST', body: JSON.stringify({ id: button.dataset.id, checkedIn: button.dataset.checked === 'true' }) }); await refresh(); }
  catch (error) { $('status').textContent = error.message; button.disabled = false; }
});
$('deleteCancel').addEventListener('click', () => $('deleteDialog').close());
$('deleteDialog').addEventListener('close', () => { deleteId = null; });
$('deleteConfirm').addEventListener('click', async () => {
  if (!deleteId) return;
  $('deleteConfirm').disabled = true;
  $('deleteCancel').disabled = true;
  $('deleteError').textContent = '';
  try { await api('/delete', { method: 'POST', body: JSON.stringify({ id: deleteId }) }); $('deleteDialog').close(); await refresh(); }
  catch (error) { $('deleteError').textContent = error.message; }
  finally { $('deleteConfirm').disabled = false; $('deleteCancel').disabled = false; }
});
setInterval(() => { if (data) refresh(); }, 15000);
setInterval(updateClock, 1000);
refresh();

