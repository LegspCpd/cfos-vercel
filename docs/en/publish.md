# One-Click Static Publish

> The **Publish** button in the workspace toolbar builds the whole workspace into a **pure
> static site** and gives you a public link (`/p/<token>`) — no external deployment
> service needed. Perfect for sharing a finished app with anyone, like opening a web page.

## How to use

1. Open a workspace → click **Publish** (workspace toolbar, top right)
2. Click the **Publish** button
   - The system inlines `index.html` + `style.css` + `app.js` into a single self-contained
     HTML (CSS/JS embedded directly, no external file dependencies)
   - A random, unguessable token link is generated
3. Copy the link to share, or click **Open link** to preview it

**Management**:

- **Republish**: after editing code, click "Republish" — the link stays the same, content updates
- **Unpublish**: deletes the published site; the old link immediately returns 404
- Each publish records the file count and update time

## Link format

```
https://your-domain/p/<random-token>
```

The token is a 128-bit random value (base64url), **unguessable and unenumerable**; without
the token nobody can access the page.

## Use cases

- Quickly share a demo / showcase with a client or friend (no login required)
- Publish a workspace-built web app as a "product page"
- Temporarily go live with a static landing page

## Limitations

- It publishes a **static snapshot**: only the current workspace files, no database, AI,
  or other backend capabilities
- Only `index.html` is used as the entry point; `<link rel="stylesheet">` / `<script src>`
  external references are inlined instead
- Each workspace has exactly one published version at a time (republishing overwrites,
  unpublishing deletes)
- Published content is stored in the **database** (`PublishedSite` table) — no R2 / Pages required

## Who can publish

- Workspace **owners** and **editable collaborators** can publish/unpublish
- Read-only collaborators can only view the publish panel status
