#!/usr/bin/env bash
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

# Build and (re)start the public site from this checkout.
#
#   First run:  ./deploy.sh <hostname>     e.g. ./deploy.sh 203-0-113-10.sslip.io
#   Updates:    git pull && ./deploy.sh
#
# The first run writes .env with fresh random secrets (owner-only, never committed).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  if [ $# -lt 1 ]; then
    echo "usage: $0 <hostname>   (first run; e.g. 203-0-113-10.sslip.io)" >&2
    exit 1
  fi
  umask 077
  cat > .env <<EOF
SITE_ADDRESS=$1
SUPERSET_SECRET_KEY=$(openssl rand -hex 42)
POSTGRES_USER=superset
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(openssl rand -hex 16)
PRESENTON_API_KEY=
ANTHROPIC_API_KEY=
EOF
  echo "wrote .env with new secrets"
fi
mkdir -p content

(cd ../.. && docker build --target lean -t superset-tiptap:lean .)
docker build -t superset-tiptap:app .

docker compose up -d db redis
docker compose run --rm init
docker compose up -d superset caddy
docker compose ps
echo "Deployed: https://$(grep '^SITE_ADDRESS=' .env | cut -d= -f2)/"
