# QA Daily Update

Automatically fetches your QA rejections and approvals from Jira using a PAT token and prepares all fields for your Microsoft Teams daily update form.

---

## Features

- Connects to Jira using a Personal Access Token (PAT) — no login required
- Fetches today's reopened cases and cases pushed to customer automatically
- Auto-fills all Teams form fields: Key updates, Cases pushed, Count, Cases reopened, Plans
- One-click copy for each field — paste directly into Teams
- Saves submission history (last 30 days) in the browser
- Settings page to configure Jira URL and JQL queries
- PAT token saved in localStorage — enter once, works every day

---

## Project structure

```
qa-daily-update/
├── index.html        # Main app UI
├── css/
│   └── style.css     # All styles
├── js/
│   └── app.js        # All logic (Jira API, copy, history)
└── README.md
```

---

## How to run locally

### Option 1 — Open directly in browser (simplest)
```bash
# Just open index.html in your browser
open index.html       # Mac
start index.html      # Windows
xdg-open index.html   # Linux
```

> **Note:** Some browsers block `fetch()` calls from `file://` URLs due to CORS.  
> If you see a CORS error, use Option 2 below.

---

### Option 2 — Run with a local server (recommended)

**Using Python (no install needed):**
```bash
cd qa-daily-update
python -m http.server 3000
```
Then open: http://localhost:3000

**Using Node.js (npx):**
```bash
cd qa-daily-update
npx serve .
```
Then open: http://localhost:3000

**Using VS Code:**
- Install the **Live Server** extension
- Right-click `index.html` → **Open with Live Server**

---

## Deploy to GitHub Pages (free hosting)

### Step 1 — Create a GitHub repository

1. Go to https://github.com/new
2. Repository name: `qa-daily-update`
3. Set to **Private** (recommended — your PAT stays local, but still)
4. Click **Create repository**

### Step 2 — Push the code

```bash
cd qa-daily-update

git init
git add .
git commit -m "Initial commit — QA Daily Update app"

git remote add origin https://github.com/YOUR_USERNAME/qa-daily-update.git
git branch -M main
git push -u origin main
```

### Step 3 — Enable GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **Deploy from a branch**
4. Branch: `main`, Folder: `/ (root)`
5. Click **Save**
6. Wait 1–2 minutes, then visit:
   ```
   https://YOUR_USERNAME.github.io/qa-daily-update/
   ```

---

## First-time setup in the app

1. Open the app (locally or on GitHub Pages)
2. Click **Settings** in the left sidebar
3. Confirm the Jira URL is: `https://jdac.unilogcorp.com`
4. Generate a PAT token:
   - Go to: https://jdac.unilogcorp.com/secure/ViewProfile.jspa
   - Click **Personal Access Tokens** → **Create token**
   - Name: `QA Daily Update`, Expiry: 1 year
   - **Copy the token immediately** (shown only once)
5. Paste the token in the Settings page → click **Connect**
6. You'll see "Connected as Goutham L" — done!

---

## Daily usage

1. Open the app
2. Click **Fetch from Jira** on the Today page
3. All fields populate automatically
4. Type your **Plans for tomorrow**
5. Open Teams → QA Daily update form
6. Click **Copy** next to each field → paste into Teams → Submit

---

## Security notes

- The PAT token is stored in your **browser's localStorage** — only on your device
- It is sent **only** to `jdac.unilogcorp.com` (your own Jira)
- Never stored on any server or third party
- You can revoke the token anytime from your Jira profile
- If token expires, the app detects it and prompts you to reconnect

---

## Customising JQL queries

Go to **Settings** → edit the JQL queries to match your project's exact status names.

Default queries:

**Reopened (sent back to dev):**
```
(status CHANGED FROM "QA STAGE" TO ("DEV STAGE","DEV QUEUE","BACKLOG") BY currentUser() AFTER startOfDay()
OR status CHANGED FROM "QA PRODUCTION" TO ("DEV PRODUCTION","DEV STAGE") BY currentUser() AFTER startOfDay())
ORDER BY updated DESC
```

**Pushed to customer:**
```
(status CHANGED FROM "QA STAGE" TO "APPROVAL STAGE" BY currentUser() AFTER startOfDay()
OR status CHANGED FROM "QA PRODUCTION" TO "APPROVAL PRODUCTION" BY currentUser() AFTER startOfDay())
ORDER BY updated DESC
```
