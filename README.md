# ĐỘ WC — Plain HTML/CSS/JS for Vercel

No framework, no build step. Drop this folder into Vercel and it works.

## Deploy to Vercel

1. Upload this folder (or push to GitHub and import the repo).
2. In Vercel → Settings → Environment Variables, add:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — your service account JSON **minified to one line** (no newlines)
   - `ADMIN_IDS` — comma-separated admin IDs, e.g. `A123,B456`
3. Optional overrides:
   - `DATABASE_SHEET_ID` — Google Sheet ID for users/matches
   - `OUTPUT_SHEET_ID` — Google Sheet ID for bet picks (defaults to DATABASE_SHEET_ID)
   - `DB_USERS_SHEET` — tab name for users (default: `Result`)
   - `DB_MATCHES_SHEET` — tab name for matches (default: `Scheduled match`)
   - `OUTPUT_SHEET` — tab name for picks (default: `Bet pick`)
4. Deploy. No build command needed.

## Project layout

```
vercel-app/
├── public/
│   ├── index.html   ← the entire UI
│   ├── style.css    ← dark theme styles
│   └── app.js       ← frontend logic
├── api/
│   ├── matches.js          GET /api/matches
│   ├── users.js            GET /api/users?q=...
│   ├── picks.js            POST /api/picks
│   ├── admin/
│   │   ├── matches.js      GET/PUT /api/admin/matches
│   │   └── score.js        POST /api/admin/score
│   └── _lib/               shared helpers (not exposed as routes)
│       ├── config.js
│       ├── admin.js
│       ├── sheets.js
│       ├── matches.js
│       └── output.js
├── package.json    ← only googleapis + date-fns + date-fns-tz
├── vercel.json     ← routing rules
└── .gitignore
```
