# Output Formats

Output formats are the deployment's **standard output templates** — documents, presentations, spreadsheets, and more. Each format carries a set of seed files, and workspaces can be created from a format. The agent also receives the format's hint (agentHint) so its output matches expectations.

## Create a workspace from a format

Below the home-page input you'll see a **"Or start with a template"** row of buttons (when the deployment has formats enabled):

- Each button maps to a format (e.g. **New Doc**, **New Deck**, **New Sheet**)
- Clicking creates a new workspace pre-seeded with the format's template files (HTML/CSS/JS)
- Chat with the agent as usual — it will honor the format's agentHint

## Switch a workspace's format

The workspace editor toolbar shows a format badge (e.g. "Doc"). Click it to open the switch menu:

- Pick another format → its seed files are written in (**your existing files are never overwritten**; missing files are added and the entry marker is updated)
- Pick **"Generic app"** → removes the format association and returns to the default entry file
- Switching is recorded in the audit log (`workspace.format_switch`)

## Bundled formats

The deployment ships three bundled formats (seeded on first access):

| Format ID | Title | Output | Icon |
| --- | --- | --- | --- |
| `format.document` | Document | Doc / Docs | fileText |
| `format.presentation` | Presentation | Deck / Decks | presentation |
| `format.spreadsheet` | Spreadsheet | Sheet / Sheets | table |

Each format has one or more **variants** (e.g. Document has Article / Report). Creating a workspace uses the first variant's seed files.

## Template marketplace

On the **Blueprints** page, each workspace row has a **"Submit to marketplace"** button:

1. Fill in the template name, description, noun/plural, output type, icon, agent hint, and variant name
2. The submission enters **pending** review; admins review it in Admin → Formats
3. Once approved it's available to everyone as a "New …" button on the home page

## Admin curation (Admin → Formats)

Admins manage all formats in the **Admin → Formats** tab:

- **Pending**: approve / reject user marketplace submissions
- **Curated**: enable / disable formats, edit title/description/noun/icon/agent hint
- Bundled formats can't be deleted — disable them instead
- Disabled formats can no longer be chosen for new workspaces

## Blueprint archives and formats

`.gadget.json` archives now record the workspace's `formatId`:

- **Export** writes it automatically
- **Import** restores the format association when the format still exists and is enabled; otherwise it falls back to a generic app

## Icon vocabulary

Format icons use a closed vocabulary, mapped to glyphs in the frontend:

`fileText` · `gridNine` · `presentation` · `appWindow` · `flowArrow` · `kanban` · `chartBar` · `table` · `notebook` · `listChecks`

Unknown icons fall back to the generic app icon (appWindow).