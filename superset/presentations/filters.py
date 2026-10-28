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
from typing import Any

from flask import g
from flask_babel import lazy_gettext as _
from sqlalchemy import or_
from sqlalchemy.orm.query import Query

from superset import security_manager
from superset.models.presentation import Presentation
from superset.views.base import BaseFilter


class PresentationAllTextFilter(BaseFilter):  # pylint: disable=too-few-public-methods
    name = _("All Text")
    arg_name = "presentation_all_text"

    def apply(self, query: Query, value: Any) -> Query:
        if not value:
            return query
        ilike_value = f"%{value}%"
        return query.filter(
            or_(
                Presentation.title.ilike(ilike_value),
                Presentation.description.ilike(ilike_value),
                Presentation.prompt.ilike(ilike_value),
            )
        )


class PresentationAccessFilter(BaseFilter):  # pylint: disable=too-few-public-methods
    """
    Admins see every presentation. Everyone else sees published presentations
    and the ones they own or created.
    """

    def apply(self, query: Query, value: Any) -> Query:
        if security_manager.is_admin():
            return query
        user_id = getattr(g.user, "id", None)
        owned = Presentation.owners.any(security_manager.user_model.id == user_id)
        return query.filter(
            or_(
                Presentation.published.is_(True),
                Presentation.created_by_fk == user_id,
                owned,
            )
        )
