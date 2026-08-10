# Usage Guide

## First sign-in

1. Visit your domain
2. Click **"Continue with GitHub"** / **"Continue with Google"**, or register an account
3. The first account is admin (or the one named in `ADMIN_USERNAME`)

## Bind email + email/password sign-in

No matter how you registered (GitHub / Google / password), you can **bind an email and set a password**, then sign in with "email + password":

1. After signing in, go to **Profile**
2. Find the **Bind email** section
3. Enter an email that can receive codes → click **Send code**
4. Enter the code + set a password → click **Bind email**
5. Next time, just enter **email + password** in the sign-in box (it accepts email or username)

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

### Context doc library
- Upload reference docs the agent reads when building
- Supports create / view / edit / delete

## Admin panel

Admin sign-in → left sidebar **Admin**:

- Statistics
- Site settings (name / tagline / banner / footer / default model / agent instructions)
- Registration toggle, human verification, brand icons
- AI Providers
- Cloudflare Access status
- Audit log

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

Every signed-in user can view personal usage stats in the **Analytics** page: number of workspaces, total files, recent activity, and a list of recent workspaces.

## Mobile

- Sidebar collapses into a menu button
- Docs are mobile-adapted
- Tip: "Add to Home Screen" in your mobile browser
