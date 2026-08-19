# Pitcher OS — account-based edition

A static, mobile-first PWA with:

- Email/password accounts and password recovery through Supabase Auth
- Per-user cloud storage with Postgres Row Level Security
- Dated workout sessions instead of permanent undated checkboxes
- Structured progress check-ins and trend charts
- Light, dark and system themes
- Immediate local caching plus retryable cloud sync
- CSV/JSON export
- Installable home-screen experience

There is no Node build step. Netlify can host the folder directly.

## One-time backend setup

### 1. Create a Supabase project

Create a project at `https://supabase.com/dashboard`.

### 2. Create the tables and security policies

In the Supabase dashboard:

1. Open **SQL Editor**.
2. Create a new query.
3. Paste the complete contents of `supabase-setup.sql`.
4. Run it once.

The script creates `profiles`, `workout_sessions` and `progress_entries`. Row Level Security restricts each signed-in user to their own rows.

### 3. Configure authentication URLs

In **Authentication → URL Configuration**:

- Set **Site URL** to your final site, for example `https://your-site.netlify.app/`.
- Add the same address under **Redirect URLs**.
- During local testing, you may also add `http://localhost:8080/`.

These URLs are used by email confirmation and password-recovery links.

### 4. Add the browser-safe project configuration

In **Project Settings → API**, copy:

- Project URL
- Publishable key, or the legacy `anon` key

Open `config.js` and replace the placeholders:

```js
window.PITCHER_APP_CONFIG = Object.freeze({
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR_KEY'
});
```

Never paste a secret key or service-role key into a browser file. The app actively rejects those key types.

## Deploy to the existing Netlify site

1. Finish the Supabase steps above.
2. Edit `config.js`.
3. Zip the **contents** of this folder so `index.html` is at the ZIP root.
4. In Netlify, open the existing site's **Deploys** page.
5. Drag the ZIP into the manual deploy area.

This keeps the same Netlify URL. No build command is required.

## Account behaviour

- Sign-up asks only for an optional display name, email and password.
- Supabase may require email confirmation before first sign-in.
- Password recovery returns the user to the app, where a new password can be set.
- Theme preference, workout sessions and progress entries follow the account.
- The browser also keeps a local cache, so set taps remain responsive and failed writes can be retried.

For testing, Supabase provides a limited default email sender. Configure custom SMTP before distributing the app to many people or relying on production email delivery.

## Local preview

Because the app uses JavaScript modules, serve the folder rather than opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

Without a configured backend, the setup screen offers **Preview without an account**. Preview data remains only in that browser.

## Files

- `index.html` — app structure
- `styles.css` — light/dark responsive design
- `app.js` — auth, sync, logging, charts and UI behaviour
- `program-data.js` — training plan content
- `config.js` — Supabase project URL and publishable key
- `supabase-setup.sql` — database schema, grants and RLS policies
- `manifest.webmanifest` / `sw.js` — installable PWA and app-shell caching
- `netlify.toml` — static publish settings and basic security headers

## Troubleshooting

**The app keeps showing “Backend setup required.”**  
One or both placeholders remain in `config.js`, or a secret/service-role key was used.

**Sign-up works but the confirmation link opens the wrong address.**  
Correct the Site URL and Redirect URLs in Supabase Authentication settings.

**Data does not appear on another device.**  
Make sure both devices are signed into the same account, then use **More → Sync now**. Check the browser console and Supabase table policies if a sync error appears.

**The old design appears after redeploying.**  
Close the installed PWA, reopen it online, and refresh once so the new service worker replaces the previous cache.
