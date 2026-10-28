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
Superset settings for the public deployment in deploy/oracle.

Every secret comes from the environment (the .env file deploy.sh writes on the
server). Anyone can browse published dashboards, pages and presentations;
creating and editing needs an account; only admins spend Presenton credits.
"""

import os

import superset.config as defaults

SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]

_pg = f"postgresql+psycopg2://{os.environ['POSTGRES_USER']}:{os.environ['POSTGRES_PASSWORD']}@db:5432"
SQLALCHEMY_DATABASE_URI = f"{_pg}/superset"
SQLALCHEMY_EXAMPLES_URI = f"{_pg}/examples"

_redis = "redis://redis:6379"
CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_URL": f"{_redis}/0",
}
DATA_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_data_", "CACHE_DEFAULT_TIMEOUT": 3600, "CACHE_REDIS_URL": f"{_redis}/1"}
RATELIMIT_STORAGE_URI = f"{_redis}/2"

# Behind Caddy, which terminates HTTPS.
ENABLE_PROXY_FIX = True
PROXY_FIX_CONFIG = {"x_for": 1, "x_proto": 1, "x_host": 1, "x_port": 1, "x_prefix": 1}
PREFERRED_URL_SCHEME = "https"
TALISMAN_ENABLED = True
TALISMAN_CONFIG = {**defaults.TALISMAN_CONFIG, "session_cookie_secure": True}
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"

# Visitors who are not logged in get the read-only Public role that
# scripts/public_role.py maintains, and land on the Presentations list.
AUTH_ROLE_PUBLIC = "Public"
PUBLIC_ROLE_LIKE = None
PUBLIC_HOME_PATH = "/presentation/list/"

# AI: Presenton for admins only (it spends credits); Claude when a key is set.
PRESENTON_API_KEY = os.environ.get("PRESENTON_API_KEY") or None
PRESENTON_ADMIN_ONLY = True
PRESENTATIONS_AI_API_KEY = os.environ.get("ANTHROPIC_API_KEY") or None

SUPERSET_WEBSERVER_TIMEOUT = 180
