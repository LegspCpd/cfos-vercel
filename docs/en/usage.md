# Usage Guide

## First sign-in

1. Visit your domain
2. Click **"Continue with GitHub"** / **"Continue with Google"** / **"Continue with Microsoft"**, or register an account
3. The first account is admin (or the one named in `ADMIN_USERNAME`)

### OAuth accounts must complete their profile on first sign-in

New accounts created via GitHub / Google / Microsoft must finish an onboarding step before entering the app:

1. **Set a username** (required, defaults to your third-party username)
2. **Set a password** (required — you can later sign in with "email + password")
3. **Human verification** (enforced when Turnstile/reCAPTCHA is configured)
4. **Bind an email** (optional — needed to change email or delete the account later)

Until completed, you can't enter the app. After completing, you're taken in automatically.

## Bind / change email + email/password sign-in

No matter how you registered (GitHub / Google / Microsoft / password), you can **bind an email and set a password**, then sign in with "email + password":

- **First-time bind** (no email yet): go to **Profile → Email**, enter an email → send a code → enter the code + set a password → bind.
- **Change email** (an email is already bound): Profile → Email → click **"Change email"**:
  1. Enter the **old email** → a code is sent to it → enter the code (proves ownership)
  2. Enter the **new email** → a code is sent → enter the code
  3. Pass human verification → submit to change.
- At the bottom of the Email section there's also **"Appeal / submit a ticket"** to reach an admin.

Next time, just enter **email + password** in the sign-in box (it accepts email or username).

## Build your first app

1. In the home search box type: "make me a calculator"
2. Press Enter — a workspace is created and the agent starts building
3. View the code in the editor, live preview on the right
4. Keep chatting with the agent to refine

## Core features

### Workspace
- Multi-file code editor (Monaco)
- File tree: create / delete / set entry
- Live preview (iframe)
- Autosave (with "unsaved" dirty dot, agent-modified marker)
- **Realtime collaboration**: when multiple collaborators edit the same workspace, content syncs live and the toolbar shows the online count (see [Realtime](/en/docs/realtime))
- **One-click static publish**: the top **Publish** button bundles the workspace into a static site + public link (see [Static Publish](/en/docs/publish))

### File history & rollback
- Every file change is recorded as a version automatically
- In the editor top bar click **History** → pick a version → restore with one click

### AI Agent
- Build / modify apps with natural language
- Markdown output support
- References uploaded context docs
- Chat history is saved — no loss on refresh

### File sharing
- Upload to R2, generates expiring links
- Downloads stream from R2

### Blueprints
- Each workspace can be **exported** as a `.gadget.json` archive
- Top **Import blueprint** restores an archive as a new workspace
- **Copy link** generates a **public blueprint link** anyone can preview and copy code from without logging in

### Favorite workspaces
- Star a workspace card (top-right) to favorite it
- Filter by "All / Favorites"

### External connections
- Connect GitHub so the agent can read your repos

### SSH remote sessions (persistent)
- **Remote → SSH hosts**: add/remove/test servers, password or private-key auth; credentials are AES-256-GCM encrypted
- **Live monitoring**: hostname, OS, cores, uptime, load, memory/disk usage
- **Command terminal**: run commands with live streaming output
- **Persistent sessions**: click the **plug button** in the terminal header to open a session — the server **remembers the current directory and environment variables** (`export FOO=bar` lines are parsed), so every later command runs in the same directory/environment; the header shows `Session active · cwd`
- Sessions expire after 30 minutes of inactivity by default (tune with `SSH_SESSION_TTL_MINUTES`); unplug to close one immediately

### Context doc library
- Upload reference docs the agent reads when building
- Supports create / view / edit / delete
- Docs can be set **public**: they enter the admin review queue, and once approved they appear in the **public library** and every user's agent references them automatically

### Workspace collaborators
- Open a workspace → **Collaborators** in the top toolbar (owner only) → enter a username to add
- Roles: **Read-only** (view + preview, editor locked) or **Editable** (edit files + use the agent)
- Collaborators see the shared workspace in their own **Workspaces** list
- Being added/removed triggers an in-app notification (email optional)

### Notifications
- Sidebar bell: collaborator changes, doc review results, ticket replies…
- **Profile → Notification preferences** lets you choose which events also email you (requires `RESEND_API_KEY` + a bound email)

## Admin panel

Admin sign-in → left sidebar **Admin**:

- Statistics
- Site settings (name / tagline / banner / footer / default model / agent instructions)
- Registration toggle, human verification, brand icons
- AI Providers
- Cloudflare Access status
- **Operation log** entry (full logs live in the sidebar "Operation Log")

## Operation log (/admin/audit)

The sidebar **"Operation Log"** (needs `admin.access`) aggregates all logs:

- **Sign-ins**: time, user, **IP address** (including failed attempts)
- **Agent runs**: agent actions on workspaces
- **AI calls**: every call with **token usage**
- **Export**: the top-right button downloads the current filter as **CSV / JSON** (with BOM, opens cleanly in Excel) for long-term archiving or importing elsewhere

## AI usage quotas

In **Admin → Users**, admins can set an **AI daily call limit** for a **single user** or an entire **group**:

- Per-user quotas take precedence over group quotas (when a user has none set, their group's applies)
- Once the day's limit is hit, further AI calls return a **429 quota exceeded** notice; it resets at midnight
- The Analytics page shows **today's AI calls** on the personal card for self-monitoring

## Scheduled tasks (/admin)

Admins can create **scheduled tasks** in the Admin panel:

- Set the schedule with a **cron expression** (e.g. `0 */6 * * *` = every 6 hours)
- Tasks can run an **AI instruction** (against a workspace) or an **HTTP callback** (POST to a URL)
- Vercel Cron triggers a check every minute (`/api/cron/tasks`, requires `CRON_SECRET`; due tasks run within that minute, never twice in the same minute)
- Each run is logged (success/failure + output summary); tasks can be enabled/disabled/deleted anytime

## Ticket management (/admin/tickets)

The sidebar **"Tickets"** (needs `tickets.manage`):

- View all user tickets (feedback / appeal / email change / other)
- Filter by status (open / processing / closed)
- View details: submitter, email, **IP address**, content
- **Change status** + **reply** to the user

> Submitting a ticket passes human verification and auto-emails all admins with a link to handle it.

## Delete account

In **Profile → Delete account**:

- **With a bound email**: enter it → send a code → enter the code + **human verification** → submit
- **Without a bound email** (pure OAuth account): click delete → re-authenticate through one of your connected **third-party logins** (Microsoft / Google / GitHub) → on return, complete **human verification** → submit
- The account then enters a **4–7 day cooldown**; cancel anytime during it
- After the deadline the account and all its data are **permanently deleted**; the **email/username free up and can be re-registered**

## Custom site background

Add `NEXT_PUBLIC_BEIJIN` (a background image URL) as a Vercel env var and redeploy — the image shows across the whole site and is re-requested on every refresh.

## User groups & permissions

The system uses **user groups** to control what each user can do. **A group fully decides permissions** — move a user into a group and they get all of that group's features.

Permission items (ticked when creating a group):

- **Workspace & AI agent**: create/edit/delete workspaces
- **File sharing / Blueprints**: R2 sharing, blueprint export/import
- **Context doc library**: upload/edit reference docs
- **External connections**: GitHub / Google / GitLab
- **Admin panel access** (management): enter the admin panel
- **User management** (management): manage users and groups

> Management permissions (`admin.access`, `admin.users`) are only visible to users in the "Super Admin" group or a group with these permissions ticked. Regular users can't see admin entries.

Built-in groups:
- **Super Admin**: has all permissions
- **Regular User**: only workspace & AI

The first user automatically joins the Super Admin group; users named in `ADMIN_USERNAME` also join it.

### User management (/admin/users)
Users with `admin.users` permission can use the **Users** page in the sidebar:
- Create users (username / display name / password / email / group)
- Edit users: change password, email, move group
- Delete users
- Create groups (tick feature permissions), edit group permissions, delete groups

## Analytics page (/analytics)

Every signed-in user can view detailed stats in the **Analytics** page:

- **Personal cards**: workspaces, files, today's sign-ins, today's AI calls, today's token usage
- **Today's sign-in log**: the **IP addresses** you signed in from + timestamps

Admins additionally see a **site-wide today summary**: total sign-ins, active users, AI calls, token total, and the **top login IPs** (Top 10 bar chart).

## Mobile

- Sidebar collapses into a menu button
- Docs are mobile-adapted
- Tip: "Add to Home Screen" in your mobile browser
