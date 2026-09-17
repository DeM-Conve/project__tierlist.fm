# project__yt

Login with your Google account, see all your YouTube playlists, click one to see its videos.

- `backend/` — Spring Boot (Maven) API, handles Google OAuth login and calls the YouTube Data API v3
- `frontend/` — React (Vite) UI

## 1. Get Google OAuth credentials

1. Go to https://console.cloud.google.com/ and create a project (or pick an existing one).
2. Enable the **YouTube Data API v3**: APIs & Services → Library → search "YouTube Data API v3" → Enable.
3. Configure the OAuth consent screen (Google Auth Platform → Audience): User type External, add yourself under **Test users**, and under **Data access** add the scopes `openid`, `profile`, and `.../auth/youtube.force-ssl` (read/write — needed for the tier board's drag-and-drop sync to actually move videos between playlists).
4. Create credentials (Clients → Create Client):
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:8080/login/oauth2/code/google`
5. Copy the **Client ID** and **Client Secret**.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and paste in your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## 3. Run with Docker Compose (recommended)

```bash
docker compose -f docker-compose.yml up --build
```

This builds both images (backend jar + nginx-served frontend build) and runs them:
- Backend: http://localhost:8080
- Frontend: http://localhost:5173

For local development with live code reload (no rebuild needed per change):

```bash
docker compose -f docker-compose.local.yml up
```

This mounts your source code into containers running `mvn spring-boot:run` and `npm run dev` directly.

## 4. Run without Docker (alternative)

Backend:
```bash
cd backend
export $(grep -v '^#' ../.env | xargs)
mvn spring-boot:run
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Usage

Open http://localhost:5173, click "Login with Google", approve access, and you'll see your playlists. Click a playlist to see its videos (opens the video on YouTube when clicked).

## Tier boards

Playlists named like `[G] Rap T1`/`T2`/`T3`/`TE`/`TZ` are grouped by category and shown as a
Tiermaker-style board. Drag a video into another tier row to move it locally, then hit
**Sync to YouTube** to actually add it to the target playlist and remove it from the source
one (via `POST /api/tier-sync`, which calls the real YouTube `playlistItems` insert/delete
endpoints).

## Notes

- Uses the `youtube.force-ssl` scope (read/write) so the tier board sync can actually add/remove
  playlist items, not just read.
- If you upgraded from an earlier version of this app that only requested `youtube.readonly`,
  log out and log back in once — Google needs to re-prompt you for the new permission.
- While the OAuth consent screen is in "Testing" mode, only accounts added as test users can log in.
- If your browser blocks the Google consent screen with a generic "Something went wrong" error, try an incognito window — an ad blocker/privacy extension is usually the cause.
- Backend session is in-memory (lost on restart) — fine for local personal use.
