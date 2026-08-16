# Sharing & Collaboration

Cloudflare OS lets you share work at three levels: **workspace collaborators**, **file shares**, and **public context documents**. All of them are permission-checked server-side — the UI only hides what you can't do.

## Workspace collaborators

A **collaborator** is another user granted access to one of your workspaces. They see the workspace in their own **Workspaces** list (marked as shared) and can open it like their own.

### Roles

| Role | Can do |
| --- | --- |
| **Owner** | Everything: rename, switch format, add/remove collaborators, delete the workspace |
| **Write** | Edit files, run the AI agent, rename the workspace |
| **Read** | View files + live preview, read chat history. The editor is locked (no save, no agent, no delete) |

### Adding a collaborator

1. Open the workspace → click **Collaborators** in the top toolbar (owner only)
2. Type the **username** of the person to invite
3. Pick **Read-only** or **Editable**, then **Add**

The invited user gets an in-app notification (bell icon) and, if they opted into email notifications, an email with a link straight to the workspace.

### Managing collaborators

- **Change role** — use the dropdown next to a collaborator (Read-only ↔ Editable)
- **Remove** — click the trash icon; the user is notified and the workspace disappears from their list

> Only the **owner** sees the Collaborators button. Write collaborators can edit but not manage the team.

## File shares

Sometimes you want to share **one file** without granting the whole workspace. File shares are per-file grants inside a workspace (owner only).

- **Share a file** — from the file's context menu, share it with a user by username (read or write)
- **Effective access** — the max of your workspace role and your file role wins: workspace write beats file read; file write beats workspace read

## Public context library

The **Context** page has two tabs:

- **My documents** — your private reference docs (only you and the agent see them)
- **Public library** — approved docs from everyone, browsable by all users

### Publishing a document

1. Create a doc and pick **Public** (or toggle an existing doc to public)
2. It enters the **review queue** (status: *In review*)
3. An admin approves or rejects it in **Admin → Formats → Public library review**
4. On approval it appears in the public library and the agent references it automatically; you get a notification either way

> Private docs are immediately usable by the agent. Public docs only become agent-visible after approval.

## Notifications

Every meaningful event creates an in-app notification (bell icon in the sidebar, polls every 30s):

- You were added/removed as a collaborator
- Your context doc was approved/rejected
- A file was shared with you
- A ticket was answered

### Email notifications

In **Profile → Notification preferences** you can choose which event types also send an email. Email requires:

1. `RESEND_API_KEY` configured (otherwise the section shows a warning)
2. An email bound to your account

In-app notifications are always on — email is an extra layer.

## Permission model

Access is enforced server-side on every route:

- `workspaceAccess(userId, workspaceId)` → `owner | write | read | null`
- `fileAccess(userId, fileId)` → `write | read | null` (max of workspace + file roles)

The agent route, file-save route, and workspace GET/PATCH/DELETE all check these before doing anything. A read-only collaborator gets a locked editor and a disabled chat input — the API would reject them anyway.