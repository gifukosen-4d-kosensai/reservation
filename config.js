/**
 * Reservation frontend public configuration.
 * IMPORTANT: Never put SMTP passwords, DB passwords, Turnstile secret keys, or any other secret here.
 * This file is downloaded by every visitor because GitHub Pages is a static host.
 */
window.APP_CONFIG = {
  // Production example: "https://reserve-api.example.jp"
  // For local testing use "http://localhost:8787"
  API_BASE_URL: 'http://localhost:8787',

  // Optional Cloudflare Turnstile public SITE key only. Leave blank to disable the widget.
  TURNSTILE_SITE_KEY: '',

  MAIN_SITE_URL: 'https://gifukosen-4d-kosensai.github.io/gifukosen-4d-kosensai/',
};
