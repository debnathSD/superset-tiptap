/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { t } from '@apache-superset/core/translation';
import { Loading } from '@superset-ui/core/components';
import withToasts from 'src/components/MessageToasts/withToasts';
import { fetchPage, type PageRecord } from 'src/features/pages/api';
import { PageEditorScreen } from 'src/features/pages/PageEditorScreen';

type User = { userId?: number | string; roles?: Record<string, unknown> };

interface PageEditorProps {
  user: User;
  addDangerToast: (msg: string) => void;
  addSuccessToast: (msg: string) => void;
}

function PageEditor({ user, addDangerToast, addSuccessToast }: PageEditorProps) {
  const { pageId } = useParams<{ pageId: string }>();
  const [page, setPage] = useState<PageRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(null);
    setError(null);
    fetchPage(Number(pageId)).then(setPage, () => setError(t('This page does not exist or you do not have access to it.')));
  }, [pageId]);

  if (error) return <div style={{ padding: 32 }}>{error}</div>;
  if (!page) return <Loading />;

  const isAdmin = Object.keys(user?.roles ?? {}).includes('Admin');
  const owns = page.owners.some(owner => String(owner.id) === String(user?.userId));
  // Owners and admins edit pages. Templates are read-only for everyone but admins; others clone them.
  const canEdit = (owns || isAdmin) && (!page.is_template || isAdmin);
  return <PageEditorScreen key={page.id} page={page} canEdit={canEdit} addDangerToast={addDangerToast} addSuccessToast={addSuccessToast} />;
}

export default withToasts(PageEditor);
