/** 同じブラウザーを識別するランダムID。個人を確実に識別するものではありません。 */
const DEVICE_KEY = 'kosen_4d_reservation_device_v1';
export function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
