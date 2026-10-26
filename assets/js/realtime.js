/** SSE通知と15秒ポーリング。終了時は接続とタイマーを破棄します。 */
export function connectRealtime({ API_BASE, state, loadSlots, setApiStatus }) {
  function connectEvents() {
    if (!API_BASE || !('EventSource' in window)) return;
    if (state.eventSource) state.eventSource.close();
    const es = new EventSource(`${API_BASE}/api/events`);
    state.eventSource = es;
    es.addEventListener('slots-updated', () => loadSlots({ quiet: true }));
    es.onerror = () => {
      // EventSource retries automatically. Polling below remains as a fallback.
      setApiStatus('offline', '接続を再試行中…');
    };
    es.onopen = () => setApiStatus('online', '4D Kosensai DBへ接続しています…');
  }

  connectEvents();
  const timer = setInterval(() => loadSlots({ quiet: true }), 15000);
  return () => {
    clearInterval(timer);
    state.eventSource?.close();
  };
}
