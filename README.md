# project__yt

Login with your Google account, see all your YouTube playlists, click one to see its videos.

- `backend/` — Spring Boot (Maven) API, handles Google OAuth login and calls the YouTube Data API v3
- `frontend/` — React (Vite) UI

## 1. Get Google OAuth credentials

1. Go to https://console.cloud.google.com/ and create a project (or pick an existing one).
2. Enable the **YouTube Data API v3**: APIs & Services → Library → search "YouTube Data API v3" → Enable.
3. Configure the OAuth consent screen (Google Auth Platform → Audience): User type External, add yourself under **Test users**, and under **Data access** add the scope `.../auth/youtube.readonly`.
4. Create credentials (Clients → Create Client):
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:8080/login/oauth2/code/google`
5. Copy the **Client ID** and **Client Secret**.

## 2. Configure the backend

```bash
cd backend
cp src/main/resources/application.yml.example src/main/resources/application.yml
```

Edit `application.yml` and paste in your `client-id` and `client-secret` under `spring.security.oauth2.client.registration.google`.

## 3. Run the backend

```bash
cd backend
mvn spring-boot:run
```

Runs on http://localhost:8080.

## 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:5173. Open it, click "Login with Google", approve access, and you'll see your playlists. Click a playlist to see its videos (opens the video on YouTube when clicked).

## Notes

- Uses the read-only scope `youtube.readonly` — this app only reads your playlists, it doesn't modify anything.
- While the OAuth consent screen is in "Testing" mode, only accounts added as test users can log in.
- If your browser blocks the Google consent screen with a generic "Something went wrong" error, try an incognito window — an ad blocker/privacy extension is usually the cause.
- Backend session is in-memory (lost on restart) — fine for local personal use.
