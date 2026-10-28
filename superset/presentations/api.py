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
import json
import logging
from typing import Any

from flask import g, request, Response
from flask_appbuilder.api import expose, protect, rison, safe
from flask_appbuilder.models.sqla.interface import SQLAInterface
from flask_babel import ngettext
from marshmallow import ValidationError

from superset import db, security_manager
from superset.constants import MODEL_API_RW_METHOD_PERMISSION_MAP, RouteMethod
from superset.exceptions import SupersetSecurityException
from superset.extensions import event_logger
from superset.models.presentation import Presentation
from superset.models.slice import Slice
from superset.presentations.ai import ai_status, generate_deck, GenerationError
from superset.presentations.presenton import (
    embed_url,
    may_spend_credits,
    presenton_status,
    start_generation,
    task_status,
)
from superset.presentations.filters import (
    PresentationAccessFilter,
    PresentationAllTextFilter,
)
from superset.presentations.schemas import (
    get_delete_ids_schema,
    openapi_spec_methods_override,
    PresentationCopySchema,
    PresentationGenerateSchema,
)
from superset.views.base_api import (
    BaseSupersetModelRestApi,
    RelatedFieldFilter,
    statsd_metrics,
)
from superset.views.error_handling import handle_api_exception
from superset.views.filters import BaseFilterRelatedUsers, FilterRelatedOwners

logger = logging.getLogger(__name__)

USER_FIELDS = ["id", "first_name", "last_name"]
MAX_ROWS_PER_CHART = 200


def validate_json(value: str | None) -> None:
    """Content, settings and source are stored as JSON strings."""
    if value:
        try:
            json.loads(value)
        except ValueError as ex:
            raise ValidationError("Must be valid JSON.") from ex


def _user_columns(prefix: str) -> list[str]:
    return [f"{prefix}.{field}" for field in USER_FIELDS]


class PresentationRestApi(BaseSupersetModelRestApi):
    """CRUD for Presentations, plus copy, bulk delete and AI deck generation."""

    datamodel = SQLAInterface(Presentation)

    include_route_methods = RouteMethod.REST_MODEL_VIEW_CRUD_SET | {
        RouteMethod.RELATED,
        "bulk_delete",
        "copy",
        "generate",
        "ai_status_info",
        "presenton_start",
        "presenton_task",
        "presenton_embed",
    }
    class_permission_name = "Presentation"
    method_permission_name = {
        **MODEL_API_RW_METHOD_PERMISSION_MAP,
        "copy": "write",
        "generate": "write",
        "ai_status_info": "read",
        "presenton_start": "write",
        "presenton_task": "write",
        "presenton_embed": "read",
    }
    resource_name = "presentation"
    allow_browser_login = True

    list_columns = [
        "id",
        "uuid",
        "title",
        "description",
        "published",
        "url",
        "created_on",
        "changed_on",
        "changed_on_delta_humanized",
        "source",
        *_user_columns("created_by"),
        *_user_columns("changed_by"),
        *_user_columns("owners"),
    ]
    show_columns = [*list_columns, "content", "page_settings", "prompt"]
    add_columns = [
        "title",
        "description",
        "content",
        "page_settings",
        "prompt",
        "source",
        "published",
        "owners",
    ]
    edit_columns = add_columns
    order_columns = ["title", "changed_on_delta_humanized", "created_on", "published"]
    search_columns = ["title", "created_by", "owners", "published"]
    search_filters = {"title": [PresentationAllTextFilter]}
    base_filters = [["id", PresentationAccessFilter, lambda: []]]
    base_order = ("changed_on", "desc")
    allowed_rel_fields = {"created_by", "changed_by", "owners"}
    validators_columns = {
        "content": validate_json,
        "page_settings": validate_json,
        "source": validate_json,
    }

    apispec_parameter_schemas = {"get_delete_ids_schema": get_delete_ids_schema}
    openapi_spec_tag = "Presentations"
    openapi_spec_methods = openapi_spec_methods_override

    related_field_filters = {
        "owners": RelatedFieldFilter("first_name", FilterRelatedOwners),
        "created_by": RelatedFieldFilter("first_name", FilterRelatedOwners),
        "changed_by": RelatedFieldFilter("first_name", FilterRelatedOwners),
    }
    base_related_field_filters = {
        "owners": [["id", BaseFilterRelatedUsers, lambda: []]],
        "created_by": [["id", BaseFilterRelatedUsers, lambda: []]],
        "changed_by": [["id", BaseFilterRelatedUsers, lambda: []]],
    }

    def pre_add(self, item: Presentation) -> None:
        if g.user not in item.owners:
            item.owners.append(g.user)

    def pre_update(self, item: Presentation) -> None:
        security_manager.raise_for_ownership(item)

    def pre_delete(self, item: Presentation) -> None:
        security_manager.raise_for_ownership(item)

    @expose("/ai_status/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    def ai_status_info(self) -> Response:
        """Whether AI generation is available, and with which model.
        ---
        get:
          summary: AI generation status
          responses:
            200:
              description: Availability and model; never includes credentials
            401:
              $ref: '#/components/responses/401'
        """
        return self.response(200, result={**ai_status(), "presenton": presenton_status()})

    def _load_generate_payload(self) -> tuple[dict[str, Any] | None, Response | None]:
        """Validate a generation request; only charts the user can read may feed a deck."""
        try:
            payload = PresentationGenerateSchema().load(request.get_json(silent=True) or {})
        except ValidationError as error:
            return None, self.response_400(message=error.messages)
        ids = [chart["id"] for chart in payload["charts"]]
        slices = {s.id: s for s in db.session.query(Slice).filter(Slice.id.in_(ids)).all()}
        for chart_id in ids:
            chart = slices.get(chart_id)
            if not chart or not chart.datasource or not security_manager.can_access_datasource(chart.datasource):
                return None, self.response_403()
        for chart in payload["charts"]:
            chart["rows"] = chart["rows"][:MAX_ROWS_PER_CHART]
        return payload, None

    @expose("/generate/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.generate",
        log_to_statsd=False,
    )
    @handle_api_exception
    def generate(self) -> Response:
        """Draft a deck outline from a brief and chart data, with Claude when configured.
        ---
        post:
          summary: Generate a deck outline
          requestBody:
            required: true
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/PresentationGenerateSchema'
          responses:
            200:
              description: The deck outline and the engine that wrote it
            400:
              $ref: '#/components/responses/400'
            403:
              $ref: '#/components/responses/403'
        """
        payload, error_response = self._load_generate_payload()
        if error_response:
            return error_response
        try:
            result = generate_deck(payload)
        except GenerationError as error:
            return self.response(error.status, message=str(error))
        return self.response(200, result=result)

    @expose("/presenton/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.presenton_start",
        log_to_statsd=False,
    )
    @handle_api_exception
    def presenton_start(self) -> Response:
        """Start designing a deck with Presenton from a brief and chart data.
        ---
        post:
          summary: Start a Presenton generation
          requestBody:
            required: true
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/PresentationGenerateSchema'
          responses:
            200:
              description: The Presenton task to poll
            400:
              $ref: '#/components/responses/400'
            403:
              $ref: '#/components/responses/403'
        """
        if not may_spend_credits():
            return self.response_403()
        payload, error_response = self._load_generate_payload()
        if error_response:
            return error_response
        try:
            task_id = start_generation(payload)
        except GenerationError as error:
            return self.response(error.status, message=str(error))
        return self.response(200, result={"task_id": task_id})

    @expose("/presenton/task/<string:task_id>/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    @handle_api_exception
    def presenton_task(self, task_id: str) -> Response:
        """State of a Presenton generation.
        ---
        get:
          summary: Poll a Presenton generation
          parameters:
          - in: path
            schema:
              type: string
            name: task_id
          responses:
            200:
              description: pending, completed (with the deck's links) or error
            404:
              $ref: '#/components/responses/404'
        """
        if not may_spend_credits():
            return self.response_403()
        try:
            return self.response(200, result=task_status(task_id))
        except GenerationError as error:
            return self.response(error.status, message=str(error))

    @expose("/<int:pk>/presenton_embed/", methods=("GET",))
    @protect()
    @safe
    @statsd_metrics
    @handle_api_exception
    def presenton_embed(self, pk: int) -> Response:
        """A short-lived URL that shows a Presenton deck inside Superset.
        ---
        get:
          summary: Embed a Presenton deck
          parameters:
          - in: path
            schema:
              type: integer
            name: pk
          responses:
            200:
              description: Embed URL and expiry; owners also get editing
            404:
              $ref: '#/components/responses/404'
        """
        item = self.datamodel.get(pk, self._base_filters)
        if not item:
            return self.response_404()
        try:
            source = json.loads(item.source or "{}")
        except ValueError:
            source = {}
        if source.get("engine") != "presenton" or not source.get("presenton_id"):
            return self.response_404()
        try:
            security_manager.raise_for_ownership(item)
            can_edit = may_spend_credits()
        except SupersetSecurityException:
            can_edit = False
        try:
            return self.response(200, result=embed_url(str(source["presenton_id"]), can_edit))
        except GenerationError as error:
            return self.response(error.status, message=str(error))

    @expose("/<int:pk>/copy/", methods=("POST",))
    @protect()
    @safe
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.copy",
        log_to_statsd=False,
    )
    @handle_api_exception
    def copy(self, pk: int) -> Response:
        """Copy a presentation into a new one owned by the current user.
        ---
        post:
          summary: Copy a presentation
          parameters:
          - in: path
            schema:
              type: integer
            name: pk
          requestBody:
            required: false
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/PresentationCopySchema'
          responses:
            201:
              description: The new presentation
            401:
              $ref: '#/components/responses/401'
            404:
              $ref: '#/components/responses/404'
        """
        source = self.datamodel.get(pk, self._base_filters)
        if not source:
            return self.response_404()
        try:
            payload = PresentationCopySchema().load(request.get_json(silent=True) or {})
        except ValidationError as error:
            return self.response_400(message=error.messages)
        item = Presentation(
            title=payload.get("title") or f"Copy of {source.title}",
            description=source.description,
            content=source.content,
            page_settings=source.page_settings,
            prompt=source.prompt,
            source=source.source,
            published=False,
            owners=[g.user],
        )
        db.session.add(item)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(201, id=item.id, result={"title": item.title, "url": item.url})

    @expose("/", methods=("DELETE",))
    @protect()
    @safe
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.bulk_delete",
        log_to_statsd=False,
    )
    @rison(get_delete_ids_schema)
    def bulk_delete(self, **kwargs: Any) -> Response:
        """Bulk delete presentations.
        ---
        delete:
          summary: Bulk delete presentations
          parameters:
          - in: query
            name: q
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/get_delete_ids_schema'
          responses:
            200:
              description: Presentations deleted
            403:
              $ref: '#/components/responses/403'
            404:
              $ref: '#/components/responses/404'
        """
        ids = kwargs["rison"]
        query = self.datamodel.session.query(Presentation).filter(Presentation.id.in_(ids))
        items = self._base_filters.apply_all(query).all()
        if len(items) != len(ids):
            return self.response_404()
        try:
            for item in items:
                security_manager.raise_for_ownership(item)
        except SupersetSecurityException:
            return self.response_403()
        for item in items:
            db.session.delete(item)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(
            200,
            message=ngettext(
                "Deleted %(num)d presentation", "Deleted %(num)d presentations", num=len(ids)
            ),
        )
