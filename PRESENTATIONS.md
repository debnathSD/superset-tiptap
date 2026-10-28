# Presentations for Apache Superset

**Presentations** is a section next to Dashboards, Pages and Charts. It builds slide decks from your
Superset charts, with AI. It sits beside [Pages](PAGES.md) and shares its editor, but it is its own
section, with its own list, permissions and API.

## What you get

- **Presentations list** (`/presentation/list/`):
  - search, status and owner filters, and bulk delete;
  - a **Built with** column (Presenton, Claude, draft or manual);
  - **Blank presentation** and **Create with AI** buttons.
- **Create with AI**:
  - Describe the deck: brief, audience, tone and number of slides.
  - Pick a dashboard (its charts are used) or up to 12 charts.
  - Choose who builds it:
    - **Presenton** ([presenton.ai](https://presenton.ai)) designs a polished PowerPoint deck from the data. Superset embeds Presenton's viewer and editor, so the deck opens inside Superset. Owners can edit it there, and anyone can download the `.pptx` file or present it full screen.
    - **Claude** writes an editable deck in the Pages editor with **live Superset charts**, KPI tiles and takeaways. It uses `claude-opus-5-5` with adaptive thinking and a strict JSON output schema.
    - **Plain draft** works with no AI. You get an editable deck with live charts and the key numbers.
- **Deck editor** (`/presentation/<id>/`), for Claude and draft decks:
  - the Pages editor, locked to 16:9 slides, with every Pages block and chart;
  - **Present**: a fullscreen slideshow over the live slides. Use the arrow keys, Page Up/Down, Space and Home/End to move, and Esc to leave.
  - **Downloads**: PDF, Word and PowerPoint.

Chart data is always read in the browser with the viewer's own permissions. The server checks again
that the user can read every chart before it sends anything to Claude or Presenton.

## Turn on the AI engines

Each engine is optional, and each one appears in the dialog once its key is set. Keys stay on the
server and are never sent to the browser.

| Engine | Setting (`superset_config.py`) or environment variable | Notes |
| --- | --- | --- |
| Presenton | `PRESENTON_API_KEY` | A Presenton Cloud API key. Each deck uses Presenton credits. |
| Claude | `PRESENTATIONS_AI_API_KEY` or `ANTHROPIC_API_KEY` | Needs the Anthropic SDK: `pip install -e ".[presentations-ai]"`. |

Other settings, with their defaults in `superset/config.py`:

- `PRESENTON_TEMPLATE`: a Presenton standard template such as `neo-modern`.
- `PRESENTON_ADMIN_ONLY`: only admins may design, edit or export Presenton decks, which spend credits. Everyone else views them and downloads the `.pptx`.
- `PUBLIC_HOME_PATH`: where `/` sends visitors who aren't logged in, e.g. `/presentation/list/` on a public site.
- `PRESENTON_EMBED_HOURS`: how long an embed link lives (default 2; Presenton allows up to 72).
- `PRESENTATIONS_AI_MODEL`: the Claude model.
- `PRESENTATIONS_AI_EFFORT`: Claude's effort level.
- `PRESENTATIONS_AI_MAX_ROWS`: the rows per chart that are sent.

With Talisman on, the default CSP allows the `https://presenton.ai` iframe (`frame-src`). If you
override `TALISMAN_CONFIG`, keep that entry.

## How it works

- **Presenton**:
  1. The browser sends the brief and chart rows to `POST /api/v1/presentation/presenton/`.
  2. Superset turns them into Markdown tables with key facts and starts an async Presenton generation.
  3. The browser polls `GET /api/v1/presentation/presenton/task/<task_id>/`.
  4. When the task completes, Superset stores the Presenton deck's id and file link with the presentation.
  5. `GET /api/v1/presentation/<id>/presenton_embed/` returns a scoped, short-lived embed URL. It grants read and export to viewers, and edit to owners.
- **Claude and draft**:
  1. `POST /api/v1/presentation/generate/` returns a deck outline with slides, KPIs and chart ids.
  2. The browser turns the outline into a Tiptap document, with one slide per page break.

## Where the code is

| Area | Files |
| --- | --- |
| Model and migration | `superset/models/presentation.py`, `superset/migrations/versions/2026-10-28_12-00_b8d41f6c2a90_add_presentations.py` |
| REST API | `superset/presentations/api.py` (CRUD, copy, bulk delete, `generate`, `presenton`, `presenton/task`, `presenton_embed`, `ai_status`) |
| Claude and draft engine | `superset/presentations/ai.py` |
| Presenton client | `superset/presentations/presenton.py` |
| Menu and SPA views | `superset/views/presentations.py`, `superset/initialization/__init__.py` |
| Screens | `superset-frontend/src/pages/PresentationList`, `superset-frontend/src/pages/PresentationEditor` |
| Dialog, deck builder, Presenton view | `superset-frontend/src/features/presentations/` |
| Slideshow | `superset-frontend/src/features/pages/pagination/SlideShow.tsx` |

`superset init` grants the `Presentation` permissions (`can_read`, `can_write`) and the
**Presentations** menu to the built-in roles.

To host the site publicly for free, see [deploy/oracle/README.md](deploy/oracle/README.md).
