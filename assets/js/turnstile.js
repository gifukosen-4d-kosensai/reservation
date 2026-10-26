import { $ } from './utils.js';
/** 公開Site Keyを用いたウィジェットの初期化・トークン更新。秘密鍵はサーバー側のみ。 */
export function createTurnstile({ config, state }) {
  function loadTurnstile() {
    if (!config.TURNSTILE_SITE_KEY) return;
    $('turnstileContainer').hidden = false;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.turnstile) return;
      window.turnstile.render('#turnstileWidget', {
        sitekey: config.TURNSTILE_SITE_KEY,
        callback: (token) => {
          state.turnstileToken = token;
        },
        'expired-callback': () => {
          state.turnstileToken = '';
        },
        'error-callback': () => {
          state.turnstileToken = '';
        },
      });
    };
    document.head.appendChild(script);
  }

  function resetTurnstile() {
    state.turnstileToken = '';
    if (window.turnstile) {
      try {
        window.turnstile.reset('#turnstileWidget');
      } catch (_) {
        /* widget may not exist yet */
      }
    }
  }

  return { loadTurnstile, resetTurnstile };
}
