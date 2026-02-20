# Sideloading the NotesBoard Outlook Add-in

This guide covers local development sideloading for:
- Outlook on the web (office365.com)
- Outlook for Mac

---

## Prerequisites

- Node.js / npm installed
- [ngrok](https://ngrok.com/download) CLI installed and authenticated
- An Microsoft 365 account with access to Outlook on the web or Outlook for Mac

---

## 1. Start the dev server

```bash
npm run dev
# Dev server starts on http://localhost:3000
```

---

## 2. Expose localhost via ngrok (HTTPS required)

Office add-ins require HTTPS. ngrok provides a temporary HTTPS tunnel.

```bash
ngrok http 3000
```

Copy the **Forwarding** URL — it looks like:
```
https://abc123.ngrok-free.app
```

> **Free tier note:** This URL changes every time you restart ngrok. Paid plans offer static domains.

---

## 3. Update manifest.xml

Open `public/manifest.xml` and replace all three occurrences of `YOUR_NGROK_URL` with your ngrok URL.

Example — find:
```xml
<IconUrl DefaultValue="https://YOUR_NGROK_URL/globe.svg"/>
<HighResolutionIconUrl DefaultValue="https://YOUR_NGROK_URL/globe.svg"/>
<SupportUrl DefaultValue="https://YOUR_NGROK_URL"/>
...
<SourceLocation DefaultValue="https://YOUR_NGROK_URL/outlook/addin"/>
```

Replace with:
```xml
<IconUrl DefaultValue="https://abc123.ngrok-free.app/globe.svg"/>
<HighResolutionIconUrl DefaultValue="https://abc123.ngrok-free.app/globe.svg"/>
<SupportUrl DefaultValue="https://abc123.ngrok-free.app"/>
...
<SourceLocation DefaultValue="https://abc123.ngrok-free.app/outlook/addin"/>
```

> Do **not** commit this change — the ngrok URL changes each free-tier session.

---

## 4a. Sideload in Outlook on the web

1. Go to [https://outlook.office.com](https://outlook.office.com) and sign in
2. Open any **email message** (click to read it — compose mode won't work)
3. In the message reading toolbar, click the **"..."** (More actions) button
4. Select **"Get Add-ins"**
5. In the Add-ins dialog, click **"My add-ins"** in the left sidebar
6. Scroll to the bottom and click **"Add a custom add-in"** → **"Add from file..."**
7. Upload `public/manifest.xml` from this repo
8. Click **Install** to confirm

The add-in is now installed. You should see a **NotesBoard** button in the message reading toolbar when viewing any email.

---

## 4b. Sideload in Outlook for Mac

1. Open Outlook for Mac
2. Open any **email message** in reading pane
3. In the message toolbar, click **"..."** → **"Get Add-ins"**
   *(or: Outlook menu → Tools → Get Add-ins)*
4. In the add-ins dialog, click **"My add-ins"**
5. Click **"Add a custom add-in"** → **"Add from file..."**
6. Select `public/manifest.xml` and click **Open**

The add-in button appears in the message toolbar.

---

## 5. Verify the add-in works

1. Open any email in Outlook
2. Click the **NotesBoard** button in the reading toolbar
3. The task pane opens and shows `Initializing…` briefly, then the board UI
4. The **EmailActionsBar** shows the actual subject of the open email
5. Click **"Create card from this thread"**
6. The sheet pre-fills with the real email subject; "Email thread" label (not "prototype")
7. Select a board + column, click **Create card**
8. The card is created with the real `conversationId` and `mailbox` stored in the database
9. A ✉️ icon appears on the card tile in the board

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank task pane | Open browser DevTools in Outlook on the web and check Console for CSP errors. Ensure ngrok URL in manifest matches exactly. |
| "App domain not trusted" error | The `<SourceLocation>` URL must exactly match the ngrok URL. Check for trailing slashes or http vs https. |
| Add-in button not visible | The rule `ItemType="Message" FormType="Read"` only activates in read mode. Make sure you're reading an email, not composing. |
| Subject shows "Q1 Planning Discussion" | Office.js timed out or is not available — shows dummy data. Check the browser console; Office.js CDN may be blocked by your network. |
| "Invalid manifest" on upload | Validate the manifest: `npx office-addin-manifest validate public/manifest.xml` |
| After restarting ngrok, add-in is broken | Remove the old add-in (My add-ins → delete) and re-upload with updated manifest. Incrementing `<Version>` alone is not sufficient. |
| Task pane stuck on "Initializing…" | `readOutlookItem()` has a 3-second timeout. If it's hanging longer, check that office.js loaded: open DevTools → Network tab, filter for "office.js". |

---

## Architecture notes

- The task pane URL is `/outlook/addin` — a dedicated Next.js route that loads Office.js
- `/outlook` (without `/addin`) is the browser dev page — it uses dummy thread data
- Real thread data flows: `Office.context.mailbox.item` → `readOutlookItem()` → `OutlookBoardShell` → `CreateFromThreadSheet` → `POST /api/email/create-note-from-thread`
- `webLink` is stored as `null` for now (requires Microsoft Graph API, planned for Phase 3)
