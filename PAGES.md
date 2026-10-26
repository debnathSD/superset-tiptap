# Pages for Apache Superset

This fork of [Apache Superset](https://github.com/apache/superset) 6.1.0 adds
**Pages**: SharePoint-style pages built on the [Tiptap](https://tiptap.dev)
editor, as a third offering next to Dashboards and Charts. The standalone
editor it grew from is [tiptap-debnathsd](https://github.com/debnathSD/tiptap-debnathsd).

## What you get

- **Pages list** (`/page/list/`): server-side paginated table with name, status, owners, author and dates. It has search, status, type and owner filters, bulk select and delete, a blank page, and a copy of the status-report template.
- **Editor** (`/page/<id>/`):
  - regions with column layouts and backgrounds, and colored blocks;
  - dividers and spacers, callouts and FAQs, cards and banners;
  - quick links, KPI tiles and status pills, tables and an outline;
  - folding headings and reading time.
- **Every Superset chart**: insert saved charts from a searchable chart picker or drag them onto the page. Charts render live with `SuperChart`. You can resize them, refresh them and open them in Explore.
- **Layouts**:
  - **Portrait**: Word pages (A4, Letter or Legal).
  - **Landscape**: 16:9 PowerPoint slides.
  - **Canvas**: one seamless page.

  Page breaks are automatic, you can insert manual ones, and sheets scale to fit the window.
- **Header & footer**:
  - left, center and right slots, with page number, page count, title, author and date fields;
  - quick styles;
  - a different first page and divider lines.
- **Downloads**:
  - **PDF**, as laid out.
  - **Word**: a native document with real headers and footers and live page numbers.
  - **PowerPoint**: editable text, lists and tables on 16:9 slides.
- **Ownership**:
  - Owners and admins can edit, and others see published pages and templates.
  - Only admins can mark a page as a template.
  - Anyone who can read a page can copy it.

## Where the code is

| Area | Files |
| --- | --- |
| Model and migration | `superset/models/page.py`, `superset/migrations/versions/2026-10-26_12-00_7e19b0374bb5_add_pages.py` |
| REST API | `superset/pages/` (`/api/v1/page/`: list, get, create, update, delete, `/<id>/copy/`, bulk delete) |
| Menu and SPA views | `superset/views/pages.py`, `superset/initialization/__init__.py` |
| List and editor screens | `superset-frontend/src/pages/PageList`, `superset-frontend/src/pages/PageEditor`, routes in `src/views/routes.tsx` |
| Editor, charts, layouts, exports | `superset-frontend/src/features/pages/` (`editor/`, `chart/`, `pagination/`, `export/`, `styles/`) |

## Run it locally

Backend (Python 3.11):

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e . -r requirements/development.txt
export FLASK_APP=superset SUPERSET_CONFIG_PATH=$PWD/superset_config.py   # your own config with SECRET_KEY
superset db upgrade
superset fab create-admin            # choose your own username and password
superset init
superset run -h 127.0.0.1 -p 8088 --with-threads --reload
```

Frontend (Node 22):

```bash
cd superset-frontend && npm ci
superset=http://127.0.0.1:8088 npm run dev-server
```

Open http://localhost:9000/page/list/. `superset init` grants the `Page` permissions (`can_read`, `can_write`) and the **Pages** menu to the built-in roles.
