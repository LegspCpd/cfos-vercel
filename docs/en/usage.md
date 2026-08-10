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
- User management (delete / promote)
- AI Providers
- Cloudflare Access status
- Audit log

## Mobile

- Sidebar collapses into a menu button
- Docs are mobile-adapted
- Tip: "Add to Home Screen" in your mobile browser
