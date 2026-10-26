import { $ } from './utils.js';
/** ダイアログとエラー表示。入力や予約の状態は保持しません。 */
export function openMessage(title, bodyHtml, en = 'DONE') {
  $('messageDialogTitle').textContent = title;
  $('messageDialogEn').textContent = en;
  $('messageDialogBody').innerHTML = bodyHtml;
  $('messageDialog').showModal();
}

export function showError(element, message) {
  element.textContent = message;
  element.classList.add('show');
}
export function clearError(element) {
  element.textContent = '';
  element.classList.remove('show');
}
