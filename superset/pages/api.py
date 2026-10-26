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
from superset.models.page import Page
from superset.pages.filters import PageAccessFilter, PageAllTextFilter
from superset.pages.schemas import (
    get_delete_ids_schema,
    openapi_spec_methods_override,
    PageCopySchema,
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


def validate_json(value: str | None) -> None:
    """Content and settings are stored as JSON strings."""
    if value:
        try:
            json.loads(value)
        except ValueError as ex:
            raise ValidationError("Must be valid JSON.") from ex


def _user_columns(prefix: str) -> list[str]:
    return [f"{prefix}.{field}" for field in USER_FIELDS]


class PageRestApi(BaseSupersetModelRestApi):
    """CRUD for Pages, plus copy (clone a page or template) and bulk delete."""

    datamodel = SQLAInterface(Page)

    include_route_methods = RouteMethod.REST_MODEL_VIEW_CRUD_SET | {
        RouteMethod.RELATED,
        "bulk_delete",
        "copy",
    }
    class_permission_name = "Page"
    method_permission_name = {
        **MODEL_API_RW_METHOD_PERMISSION_MAP,
        "copy": "write",
    }
    resource_name = "page"
    allow_browser_login = True

    list_columns = [
        "id",
        "uuid",
        "title",
        "description",
        "published",
        "is_template",
        "url",
        "created_on",
        "changed_on",
        "changed_on_delta_humanized",
        *_user_columns("created_by"),
        *_user_columns("changed_by"),
        *_user_columns("owners"),
    ]
    show_columns = [*list_columns, "content", "page_settings"]
    add_columns = [
        "title",
        "description",
        "content",
        "page_settings",
        "published",
        "is_template",
        "owners",
    ]
    edit_columns = add_columns
    order_columns = ["title", "changed_on_delta_humanized", "created_on", "published"]
    search_columns = ["title", "created_by", "owners", "published", "is_template"]
    search_filters = {"title": [PageAllTextFilter]}
    base_filters = [["id", PageAccessFilter, lambda: []]]
    base_order = ("changed_on", "desc")
    allowed_rel_fields = {"created_by", "changed_by", "owners"}
    validators_columns = {"content": validate_json, "page_settings": validate_json}

    apispec_parameter_schemas = {"get_delete_ids_schema": get_delete_ids_schema}
    openapi_spec_tag = "Pages"
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

    def pre_add(self, item: Page) -> None:
        # The creator always owns the page; only admins may create templates.
        if g.user not in item.owners:
            item.owners.append(g.user)
        if item.is_template and not security_manager.is_admin():
            item.is_template = False

    def pre_update(self, item: Page) -> None:
        security_manager.raise_for_ownership(item)
        if item.is_template and not security_manager.is_admin():
            item.is_template = False

    def pre_delete(self, item: Page) -> None:
        security_manager.raise_for_ownership(item)

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
        """Copy a page (or template) into a new page owned by the current user.
        ---
        post:
          summary: Copy a page
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
                  $ref: '#/components/schemas/PageCopySchema'
          responses:
            201:
              description: The new page
            401:
              $ref: '#/components/responses/401'
            404:
              $ref: '#/components/responses/404'
        """
        source = self.datamodel.get(pk, self._base_filters)
        if not source:
            return self.response_404()
        try:
            payload = PageCopySchema().load(request.get_json(silent=True) or {})
        except ValidationError as error:
            return self.response_400(message=error.messages)
        page = Page(
            title=payload.get("title") or f"Copy of {source.title}",
            description=source.description,
            content=source.content,
            page_settings=source.page_settings,
            published=False,
            is_template=False,
            owners=[g.user],
        )
        db.session.add(page)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(201, id=page.id, result={"title": page.title, "url": page.url})

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
        """Bulk delete pages.
        ---
        delete:
          summary: Bulk delete pages
          parameters:
          - in: query
            name: q
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/get_delete_ids_schema'
          responses:
            200:
              description: Pages deleted
            403:
              $ref: '#/components/responses/403'
            404:
              $ref: '#/components/responses/404'
        """
        ids = kwargs["rison"]
        query = self.datamodel.session.query(Page).filter(Page.id.in_(ids))
        pages = self._base_filters.apply_all(query).all()
        if len(pages) != len(ids):
            return self.response_404()
        try:
            for page in pages:
                security_manager.raise_for_ownership(page)
        except SupersetSecurityException:
            return self.response_403()
        for page in pages:
            db.session.delete(page)
        db.session.commit()  # pylint: disable=consider-using-transaction
        return self.response(
            200,
            message=ngettext("Deleted %(num)d page", "Deleted %(num)d pages", num=len(ids)),
        )
