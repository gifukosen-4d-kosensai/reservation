const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('日付タブを切り替え、開始時刻に達した選択を受付終了にする', async () => {
  let now = Date.parse('2026-10-31T00:59:59Z');
  class TestDate extends Date { static now() { return now; } }
  class Element {
    constructor() { this.value = ''; this.listeners = {}; this.html = ''; }
    set innerHTML(value) { this.html = value; if (this.isSelect && !value.includes(`value="${this.value}"`)) this.value = ''; }
    get innerHTML() { return this.html; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    querySelectorAll() { return []; }
    querySelector() { return { focus() {} }; }
    contains() { return false; }
    setAttribute() {}
    scrollIntoView() {}
  }
  const elements = Object.fromEntries(['slots', 'dateTabs', 'slotId', 'bookingForm', 'bookingWindow', 'priorityCodeHelp'].map((id) => [id, new Element()]));
  elements.slotId.isSelect = true;
  let timer;
  const context = {
    Date: TestDate, Intl, Object, Number, Math,
    document: { activeElement: null },
    $: (id) => elements[id], escapeHtml: String,
    formatDateTime: (iso) => iso, remaining: (slot) => slot.capacity - slot.reserved,
    setTimeout: (callback) => { timer = callback; return 1; }, clearTimeout() {},
  };
  const code = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/slots.js'), 'utf8')
    .replace(/^import .*;\s*/m, '').replace('export function createSlots', 'function createSlots');
  vm.runInNewContext(`${code}\nthis.createSlots = createSlots;`, context);
  const state = { slots: [] };
  const slots = [
    { id: 'day1', title: '一日目', startAt: '2026-10-31T10:00:00+09:00', capacity: 16, reserved: 0 },
    { id: 'day2', title: '二日目', startAt: '2026-11-01T10:00:00+09:00', capacity: 16, reserved: 0 },
  ];
  const component = context.createSlots({ state, api: async () => ({ slots, serverTime: new Date(now).toISOString(), booking: { familyOpensAt: '2026-10-30T11:30:00+09:00', generalOpensAt: '2026-10-30T19:00:00+09:00' } }), setApiStatus() {} });
  await component.loadSlots();
  assert.match(elements.dateTabs.html, /2026-10-31/);
  assert.match(elements.dateTabs.html, /2026-11-01/);
  assert.match(elements.slots.html, /一日目/);
  assert.doesNotMatch(elements.slots.html, /二日目/);
  elements.dateTabs.listeners.click({ target: { closest: () => ({ dataset: { date: '2026-11-01' } }) } });
  assert.match(elements.slots.html, /二日目/);
  elements.dateTabs.listeners.click({ target: { closest: () => ({ dataset: { date: '2026-10-31' } }) } });
  elements.slotId.value = 'day1';
  assert.equal(component.selectedSlot().id, 'day1');
  now += 1000;
  timer();
  assert.match(elements.slots.html, /受付終了/);
  assert.doesNotMatch(elements.slotId.html, /value="day1"/);
  assert.equal(component.selectedSlot(), null);
});

