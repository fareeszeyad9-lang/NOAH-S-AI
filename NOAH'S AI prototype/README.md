# NOAH'S — personal multi-AI orchestrator

Vanilla frontend (`index.html`, `app.js`, `styles.css`) plus a small Node/Express backend and SQLite database. Open the app through the server — not as a raw `file://` page — so login, uploads, and live model proxies work.

## Run it

1. Copy `.env.example` to `.env` and set `SESSION_SECRET` and `ENCRYPTION_KEY` to long random strings.
2. Optional: set `GOOGLE_CLIENT_ID` (Google Cloud OAuth **Web** client, authorized JS origin = `APP_ORIGIN`).
3. `ALLOW_LOCAL_OWNER=true` lets you enter as a single local owner when Google is not configured. Turn this off if you only want Google sign-in.
4. Install and start:

```bash
npm install
npm start
```

Then open `http://127.0.0.1:3847`.

Backup the database when you care about the data:

```bash
npm run backup-db
```

That copies `data/noahs.db` to `data/noahs-backup-YYYY-MM-DD.db`. Run it manually or from Task Scheduler / cron.

## Architecture

- **SQLite** (`better-sqlite3`) in `data/noahs.db` — users, sessions, projects, conversations, messages, memories, tasks, files, settings, approvals, feedback.
- **Sessions** use an `httpOnly; SameSite=Lax` cookie (`Secure` in production). Google ID tokens are verified on the server. Raw Google tokens are not stored in `localStorage`.
- **API keys** are posted to `/api/keys`, encrypted at rest, and used only on the server. The browser never calls OpenAI / Anthropic / DeepSeek / Gemini directly.
- **Uploads** live in `uploads/` (outside the static file list). Files are renamed, type-checked (max 10MB), and served only to the owning user.
- **localStorage** is still a cache / offline fallback if the API is down.

Model IDs default to provider “latest” aliases (`gpt-4o`, `claude-sonnet-4-0`, `deepseek-chat`, `gemini-2.0-flash`) and can be overridden with `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `DEEPSEEK_MODEL`, `GEMINI_MODEL`.

## Included behavior

- Modes: Learning, Alien Builder, Alien Combination, Silence Ghost, Auto
- Models: ChatGPT, Claude, DeepSeek, Gemini, or Gabungan (up to four simulated or live voices)
- Learning mode explains only (no file proposals, no approval bumps, comprehension question)
- Builder/Combination + Gabungan: proposals, cross-review, draft, then human review
- Coding agents: Cursor, Windsurf, GitHub Copilot, Devin — **external / not connected**; Teamwork only prepares editable instruction blocks
- Files tagged Penting / Proyek / Kerja / Sekolah
- Suara NOAH'S (original synthetic voice; pitch/rate in Settings) and reply mode text / voice / both
- Master power: NOAH'S ONLINE / OFFLINE, separate from Google login
- Adaptive length from 👍/👎 — **not** model retraining
- Light theme (`data-theme="light"`) plus the original dark theme
- CSS loading cube and lapis-lazuli flash before the dashboard
- Drop MP3 files into `public/audio/` when you have them: `hello_how_can_i_help_you.mp3`, `what_i_can_do_for_you_today.mp3`, `noahs_online.mp3`, `noahs_offline.mp3`. Missing files are skipped silently (no crash). Greeting clips alternate on each **new login** via `users.last_greeting_index` (migration `001_last_greeting_index`). After the loading cube, the greeting (if this was a login) then `noahs_online.mp3` play in sequence. Logout, master-power off, `offline` event, and tab close play `noahs_offline.mp3` without overlapping clips.

## Deliberate boundaries

This app does not pretend Copilot, Devin, Cursor, Windsurf, Discord, or WhatsApp are connected. Those surfaces stay unconfigured or external until an official bridge exists.

ChatGPT / Claude / DeepSeek / Gemini are **LIVE** only when a key is stored on the server **and** the provider call succeeds. Otherwise the label stays **SIMULASI** and mock replies are used. Keys must never be pasted into client-side chat requests.

GitHub Copilot and Devin cannot be signed in with Google. They need their own GitHub / Cognition accounts.

Feedback changes reply length locally. It does not fine-tune or retrain any model.

## Security notes

- Never commit `.env`.
- Do not log API keys or session cookies.
- Run `npm audit` after dependency changes.
- Cookie `Secure` is enabled when `NODE_ENV=production` (use HTTPS).
