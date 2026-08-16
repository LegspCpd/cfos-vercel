# Realtime Collaboration (Liveblocks)

> The workspace code editor supports **multi-user realtime collaboration**: when several
> collaborators open the same workspace at the same time, edits sync to each other's
> editors live and the toolbar shows how many people are online. Powered by
> [Liveblocks](https://liveblocks.io) cloud service — no self-hosted server required.

## Enabling

Realtime collaboration needs one environment variable:

| Variable | Description |
|---|---|
| `LIVEBLOCKS_SECRET_KEY` | Register at [Liveblocks](https://liveblocks.io) (free tier is enough for everyday use) → project settings → **Secret Keys** → copy the **Secret key** (starts with `sk_dev_`). |

After configuring, redeploy (or restart the dev server locally) and open any workspace →
**Code** tab to see the realtime status:

- 🟢 **Green badge**: `Realtime on` or `N online` — connection is healthy
- ⏳ **"Connecting to realtime..."** — establishing the connection (finishes within seconds)
- (No badge) — `LIVEBLOCKS_SECRET_KEY` is not set, or the connection failed; the editor
  falls back to **offline editing** with no impact on functionality

## Details

- **Live sync**: when multiple collaborators are in the same workspace, file content
  changes broadcast to everyone in real time (Liveblocks Storage)
- **Active-file following**: the file path you are editing syncs to collaborators so
  everyone can see what the others are looking at
- **Read-only collaborators** also see live updates, but cannot edit or save
- Each workspace maps to its own Liveblocks Room (`cfos-ws-<workspaceId>`), so workspaces
  never interfere with each other

## Permissions

Authentication for realtime collaboration is handled by this app (`/api/liveblocks/auth`):

- Only the workspace **owner** and **invited collaborators** can join the workspace room;
  everyone else gets no token
- Tokens are HS256-signed JWTs whose lifetime matches the login session; Liveblocks
  refreshes them automatically through the callback
- Signed-out users cannot join any room

## Failures & degradation

| Scenario | Behavior |
|---|---|
| `LIVEBLOCKS_SECRET_KEY` not set | Code tab shows no realtime badge; purely offline editing |
| Invalid secret key / network blocked | Gives up after ~5 seconds, degrades to offline editing, **editor keeps working** |
| Connection drops mid-session | Peer count drops to zero, local edits are never lost; the next page visit retries |

> Realtime sync is a best-effort collaboration enhancement and **does not replace
> saving**. Always click **Save** (or Ctrl/Cmd+S) to persist changes to the server —
> file history/rollback always uses the server-saved version.

## Privacy

Realtime content is transmitted over Liveblocks' encrypted WebSocket; room IDs contain no
file content, and only authorized users can obtain an ID token to join. If you have
concerns about data leaving your region, simply leave `LIVEBLOCKS_SECRET_KEY` unset — the
app stays in pure offline collaboration mode.
