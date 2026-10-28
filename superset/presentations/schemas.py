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
from marshmallow import fields, Schema, validate

get_delete_ids_schema = {"type": "array", "items": {"type": "integer"}}

openapi_spec_methods_override = {
    "get": {"get": {"summary": "Get a presentation"}},
    "get_list": {"get": {"summary": "Get a list of presentations"}},
    "post": {"post": {"summary": "Create a presentation"}},
    "put": {"put": {"summary": "Update a presentation"}},
    "delete": {"delete": {"summary": "Delete a presentation"}},
}


class PresentationCopySchema(Schema):
    title = fields.String(required=False, allow_none=True)


class ChartDataSchema(Schema):
    """One chart's data as the browser fetched it through the chart data API."""

    id = fields.Integer(required=True)
    name = fields.String(required=True, validate=validate.Length(max=500))
    viz_type = fields.String(load_default="")
    dataset = fields.String(load_default="")
    description = fields.String(load_default="", allow_none=True)
    columns = fields.List(fields.String(), load_default=list)
    rows = fields.List(fields.List(fields.Raw(allow_none=True)), load_default=list)
    row_count = fields.Integer(load_default=0)


class PresentationGenerateSchema(Schema):
    brief = fields.String(required=True, validate=validate.Length(min=1, max=4000))
    audience = fields.String(load_default="", validate=validate.Length(max=300))
    tone = fields.String(
        load_default="executive",
        validate=validate.OneOf(["executive", "analytical", "storytelling", "casual"]),
    )
    n_slides = fields.Integer(load_default=8, validate=validate.Range(min=3, max=20))
    use_ai = fields.Boolean(load_default=True)
    charts = fields.List(
        fields.Nested(ChartDataSchema),
        required=True,
        validate=validate.Length(min=1, max=12),
    )
