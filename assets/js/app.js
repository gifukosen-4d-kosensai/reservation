import { $ } from './utils.js';
import { createApi } from './api.js';
import { createSlots } from './slots.js';
import { createTurnstile } from './turnstile.js';
import { initBooking } from './booking.js';
import { initManage } from './manage.js';
import { connectRealtime } from './realtime.js';
/** 画面の入口。各機能を組み立てます。機能の詳細は隣のモジュールへ。 */
const config = window.APP_CONFIG || {};
const API_BASE = String(config.API_BASE_URL || '').replace(/\/$/, '');
const state = {
  slots: [],
  pendingPayload: null,
  turnstileToken: '',
  currentReservation: null,
  eventSource: null,
  submitting: false,
};
const api = createApi(API_BASE);
function setApiStatus(mode, text) {
  $('apiStatusDot').className = `status-dot ${mode}`;
  $('apiStatusText').textContent = text;
}
const slots = createSlots({ state, api, setApiStatus });
const turnstile = createTurnstile({ config, state });
initBooking({ state, config, api, ...slots, ...turnstile });
initManage({ state, api, loadSlots: slots.loadSlots });
$('messageDialogClose').addEventListener('click', () => $('messageDialog').close());
document.querySelectorAll('[data-main-link]').forEach((link) => {
  if (config.MAIN_SITE_URL)
    link.href = `${String(config.MAIN_SITE_URL).replace(/\/$/, '')}/${link.dataset.mainLink}`;
});

turnstile.loadTurnstile();
slots.loadSlots();
let disconnect = connectRealtime({ API_BASE, state, loadSlots: slots.loadSlots, setApiStatus });
window.addEventListener('pagehide', () => disconnect());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    slots.loadSlots();
    disconnect = connectRealtime({ API_BASE, state, loadSlots: slots.loadSlots, setApiStatus });
  }
});
