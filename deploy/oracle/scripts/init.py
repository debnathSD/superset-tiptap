# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
One-off setup for the public site; safe to run again after every deploy.

1. Migrate the metadata database and sync Superset's built-in roles.
2. Create the admin account from ADMIN_USERNAME / ADMIN_PASSWORD (first run only).
3. Give the Public role (anyone not logged in) read-only access.
4. Load Superset's examples and the fictional Contoso delivery data (first run only).
5. Import demo pages and presentations from content/demo-content.json, if present.
"""

from __future__ import annotations

import json
import os
import random
import subprocess
from datetime import date
from pathlib import Path
from typing import Any

CONTENT = Path("/app/deploy/content/demo-content.json")
# Run a subset with INIT_STEPS, e.g. INIT_STEPS=public (default: every step).
STEPS = set((os.environ.get("INIT_STEPS") or "migrate,admin,public,examples,demo,content").split(","))


def cli(*args: str) -> None:
    print("+ superset", " ".join(args), flush=True)
    subprocess.run(["superset", *args], check=True)


if "migrate" in STEPS:
    cli("db", "upgrade")
    cli("init")

from superset.app import create_app  # noqa: E402

app = create_app()

with app.app_context():
    from superset import db, security_manager as sm
    from superset.connectors.sqla.models import SqlaTable

    # ── Admin ────────────────────────────────────────────────────────────────
    username = os.environ.get("ADMIN_USERNAME", "admin")
    if "admin" in STEPS and not sm.find_user(username=username):
        sm.add_user(
            username,
            "Site",
            "Admin",
            os.environ.get("ADMIN_EMAIL", f"{username}@localhost"),
            sm.find_role("Admin"),
            password=os.environ["ADMIN_PASSWORD"],
        )
        print(f"created admin account {username!r}", flush=True)

    # ── Public role: browse and read, never write ──────────────────────────
    read_permissions = {
        "can_read", "can_dashboard", "can_slice", "can_explore", "can_explore_json",
        "can_fetch_datasource_metadata", "can_external_metadata", "can_external_metadata_by_name",
        "can_get", "can_get_drill_info", "can_drill", "can_view_chart_as_table", "can_view_query",
        "can_query", "can_query_form_data", "can_time_range", "can_language_pack", "can_csv",
        "can_dashboard_permalink", "can_share_chart", "can_share_dashboard",
    }
    private_views = {"user", "security", "Database", "RowLevelSecurity", "Task", "UserRegistrationsRestAPI", "CurrentUserRestApi"}
    # Viewing a dashboard or chart stores short-lived filter state and permalinks.
    state_views = {"DashboardFilterStateRestApi", "DashboardPermalinkRestApi", "ExploreFormDataRestApi", "ExplorePermalinkRestApi"}
    public_menus = {"Home", "Dashboards", "Charts", "Pages", "Presentations"}

    def public_ok(pv: Any) -> bool:
        perm, view = pv.permission.name, pv.view_menu.name
        if perm == "menu_access":
            return view in public_menus
        if perm == "can_write":
            return view in state_views
        if perm in {"can_list", "can_show"}:
            return view == "DynamicPlugin"
        return perm in read_permissions and view not in private_views

    if "public" in STEPS:
        gamma = sm.find_role("Gamma")
        public = sm.find_role("Public") or sm.add_role("Public")
        granted = [pv for pv in gamma.permissions if public_ok(pv)]
        # All data on this site is demo data, so visitors may read every dataset.
        all_data = sm.find_permission_view_menu("all_datasource_access", "all_datasource_access")
        if all_data:
            granted.append(all_data)
        public.permissions = granted
        db.session.commit()
        print(f"Public role: {len(granted)} read-only permissions", flush=True)
    examples_loaded = db.session.query(SqlaTable).filter_by(table_name="birth_names").first() is not None

# Examples load through the CLI, once.
if "examples" in STEPS and not examples_loaded:
    cli("load-examples")

with app.app_context():
    from superset import db, security_manager as sm
    from superset.connectors.sqla.models import SqlaTable
    from superset.models.page import Page
    from superset.models.presentation import Presentation
    from superset.models.slice import Slice
    from superset.utils.database import get_example_database

    import pandas as pd

    admin = sm.find_user(username=os.environ.get("ADMIN_USERNAME", "admin"))
    examples = get_example_database()

    # ── Fictional Contoso delivery data and five charts for the demos ────────
    if "demo" in STEPS and not db.session.query(SqlaTable).filter_by(table_name="pages_delivery_metrics").first():
        rng = random.Random(26)
        workstreams = {"Ingestion cloud": (14, 6, 38), "Analytics cloud": (9, 4, 44), "Gateway": (6, 3, 31), "Connector SDK": (4, 2, 52)}
        months = [date(2025 + (m // 12), m % 12 + 1, 1) for m in range(10, 22)]  # Nov 2025 – Oct 2026
        rows = []
        for name, (start, growth, lead) in workstreams.items():
            total = start
            for i, month in enumerate(months):
                total += max(0, round(growth + rng.uniform(-2, 3)))
                committed = rng.randint(5, 9)
                rows.append(
                    {
                        "month": pd.Timestamp(month),
                        "workstream": name,
                        "new_integrations": max(0, round(growth + rng.uniform(-2, 3))),
                        "active_integrations": total,
                        "lead_time_days": round(max(18.0, lead - i * 1.4 + rng.uniform(-4, 4)), 1),
                        "deliverables_committed": committed,
                        "deliverables_done": max(1, committed - rng.randint(0, 3)),
                        "account_coverage_pct": round(min(99.6, 91.5 + i * 0.5 + rng.uniform(-0.6, 0.6)), 2),
                        "incidents": max(0, round(rng.gauss(2.2 - i * 0.12, 1.1))),
                    }
                )
        with examples.get_sqla_engine() as engine:
            pd.DataFrame(rows).to_sql("pages_delivery_metrics", engine, if_exists="replace", index=False)
        table = SqlaTable(table_name="pages_delivery_metrics", database_id=examples.id)
        table.database = examples
        db.session.add(table)
        table.fetch_metadata()
        table.main_dttm_col = "month"
        for col in table.columns:
            col.is_dttm = col.column_name == "month"
        db.session.commit()

        def metric(column: str, aggregate: str, label: str) -> dict[str, Any]:
            return {"expressionType": "SIMPLE", "column": {"column_name": column}, "aggregate": aggregate, "label": label}

        base = {"datasource": f"{table.id}__table", "adhoc_filters": [], "time_range": "No filter", "row_limit": 10000}
        charts = [
            ("Pages demo · Active integrations by workstream", "echarts_timeseries_bar",
             {"x_axis": "month", "time_grain_sqla": "P1M", "metrics": [metric("active_integrations", "SUM", "Active integrations")], "groupby": ["workstream"], "stack": "Stack", "show_legend": True, "rich_tooltip": True}),
            ("Pages demo · Epic lead time (days)", "echarts_timeseries_line",
             {"x_axis": "month", "time_grain_sqla": "P1M", "metrics": [metric("lead_time_days", "AVG", "Lead time (days)")], "groupby": ["workstream"], "show_legend": True, "rich_tooltip": True, "markerEnabled": True}),
            ("Pages demo · Account coverage", "big_number",
             {"x_axis": "month", "time_grain_sqla": "P1M", "metric": metric("account_coverage_pct", "AVG", "Account coverage %"), "y_axis_format": ",.2f", "show_trend_line": True, "start_y_axis_at_zero": False, "subheader": "average across workstreams", "color_picker": {"r": 0, "g": 122, "b": 135, "a": 1}}),
            ("Pages demo · Deliverables done by workstream", "pie",
             {"groupby": ["workstream"], "metric": metric("deliverables_done", "SUM", "Deliverables done"), "show_labels": True, "label_type": "key_percent", "donut": True, "show_legend": True}),
            ("Pages demo · Delivery summary", "table",
             {"query_mode": "aggregate", "groupby": ["workstream"], "metrics": [metric("deliverables_done", "SUM", "Done"), metric("deliverables_committed", "SUM", "Committed"), metric("lead_time_days", "AVG", "Avg lead time (days)"), metric("incidents", "SUM", "Incidents")], "order_desc": True, "show_cell_bars": False}),
        ]
        for name, viz, params in charts:
            chart = Slice(slice_name=name, viz_type=viz, datasource_type="table", datasource_id=table.id, params=json.dumps({**base, **params, "viz_type": viz}))
            chart.owners = [admin]
            db.session.add(chart)
        db.session.commit()
        print("loaded the Contoso demo data and charts", flush=True)

    # ── Demo pages and presentations ──────────────────────────────────────────
    if "content" in STEPS and CONTENT.exists():
        bundle = json.loads(CONTENT.read_text())
        names = {s.slice_name: s.id for s in db.session.query(Slice).all()}
        chart_ids = {int(old): names[name] for old, name in bundle.get("charts", {}).items() if name in names}

        def remap(node: Any) -> Any:
            if isinstance(node, dict):
                if node.get("type") == "supersetChart" and node.get("attrs", {}).get("chartId") in chart_ids:
                    node["attrs"]["chartId"] = chart_ids[node["attrs"]["chartId"]]
                for value in node.values():
                    remap(value)
            elif isinstance(node, list):
                for value in node:
                    remap(value)
            return node

        for model, items in ((Page, bundle.get("pages", [])), (Presentation, bundle.get("presentations", []))):
            for item in items:
                if db.session.query(model).filter_by(title=item["title"]).first():
                    continue
                fields = dict(item)
                fields["content"] = json.dumps(remap(json.loads(fields["content"])))
                if fields.get("source"):
                    source = json.loads(fields["source"])
                    source["chart_ids"] = [chart_ids.get(i, i) for i in source.get("chart_ids", [])]
                    fields["source"] = json.dumps(source)
                record = model(**fields)
                record.owners = [admin]
                record.created_by = admin
                record.changed_by = admin
                db.session.add(record)
                print(f"imported {model.__name__.lower()} {item['title']!r}", flush=True)
        db.session.commit()

print("setup complete", flush=True)
