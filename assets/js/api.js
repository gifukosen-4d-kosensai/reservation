/** HTTP通信とAPIエラーの読取。URLは公開config.jsから注入します。 */
export function createApi(API_BASE) {
  async function api(path, options = {}) {
    if (!API_BASE) throw new Error('API_BASE_URL が設定されていません。');
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let body = {};
    try {
      body = await response.json();
    } catch (_) {
      /* no body */
    }
    if (!response.ok) {
      const err = new Error(body.message || 'エラーが発生しました。');
      err.code = body.code;
      throw err;
    }
    return body;
  }

  return api;
}
