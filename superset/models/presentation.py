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
"""Presentations: AI-assisted 16:9 slide decks built from Superset charts."""

from __future__ import annotations

from flask_appbuilder import Model
from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import relationship

from superset import security_manager
from superset.models.helpers import AuditMixinNullable, UUIDMixin
from superset.utils import core as utils

metadata = Model.metadata  # pylint: disable=no-member

presentation_user = Table(
    "presentation_user",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("ab_user.id", ondelete="CASCADE")),
    Column(
        "presentation_id",
        Integer,
        ForeignKey("presentations.id", ondelete="CASCADE"),
    ),
)


class Presentation(AuditMixinNullable, UUIDMixin, Model):
    """A slide deck: Tiptap JSON content laid out as 16:9 slides."""

    __tablename__ = "presentations"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    # Tiptap/ProseMirror document JSON; page breaks separate the slides.
    content = Column(utils.MediumText())
    # JSON: margins, header/footer, slide numbers (the layout is always 16:9).
    page_settings = Column(Text)
    # The brief the deck was generated from, and the charts it used (JSON list of ids).
    prompt = Column(Text)
    source = Column(Text)
    published = Column(Boolean, default=False, nullable=False)
    owners = relationship(
        security_manager.user_model,
        secondary=presentation_user,
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return str(self.title)

    @property
    def url(self) -> str:
        return f"/presentation/{self.id}/"
