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
"""Pages: rich, SharePoint-style documents that embed Superset charts."""

from __future__ import annotations

from flask_appbuilder import Model
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import relationship

from superset import security_manager
from superset.models.helpers import AuditMixinNullable, UUIDMixin
from superset.utils import core as utils

metadata = Model.metadata  # pylint: disable=no-member

page_user = Table(
    "page_user",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("ab_user.id", ondelete="CASCADE")),
    Column("page_id", Integer, ForeignKey("pages.id", ondelete="CASCADE")),
)


class Page(AuditMixinNullable, UUIDMixin, Model):
    """A page document: Tiptap JSON content plus page-layout settings."""

    __tablename__ = "pages"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    # Tiptap/ProseMirror document JSON.
    content = Column(utils.MediumText())
    # JSON: paper size, orientation, margins, header/footer, page numbers.
    page_settings = Column(Text)
    published = Column(Boolean, default=False, nullable=False)
    # Templates are read-only for everyone but their owners; users copy them.
    is_template = Column(Boolean, default=False, nullable=False)
    owners = relationship(
        security_manager.user_model,
        secondary=page_user,
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return str(self.title)

    @property
    def url(self) -> str:
        return f"/page/{self.id}/"
