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
import { PageEditorScreen, type EditorKind } from 'src/features/pages/PageEditorScreen';
import { copyPresentation, fetchPresentation, parseSource, updatePresentation, type PresentationRecord } from 'src/features/presentations/api';
import { PresentonDeck } from 'src/features/presentations/PresentonDeck';

type User = { userId?: number | string; roles?: Record<string, unknown> };

interface PresentationEditorProps {
  user: User;
  addDangerToast: (msg: string) => void;
  addSuccessToast: (msg: string) => void;
}

/** The Pages editor, locked to 16:9 slides, with a fullscreen slideshow. */
const PRESENTATION_KIND: EditorKind = {
  listPath: '/presentation/list/',
  listLabel: t('Presentations'),
  itemPath: id => `/presentation/${id}/`,
  nameLabel: t('Presentation name'),
  untitled: t('Untitled presentation'),
  save: updatePresentation,
  copy: id => copyPresentation(id),
  copied: title => t('Copied "%s" to your presentations', title),
  saveError: t('Could not save the presentation.'),
  copyError: t('Could not copy the presentation.'),
  layout: 'landscape',
  present: true,
};

function PresentationEditor({ user, addDangerToast, addSuccessToast }: PresentationEditorProps) {
  const { presentationId } = useParams<{ presentationId: string }>();
  const [item, setItem] = useState<PresentationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItem(null);
    setError(null);
    fetchPresentation(Number(presentationId)).then(setItem, () => setError(t('This presentation does not exist or you do not have access to it.')));
  }, [presentationId]);

  if (error) return <div style={{ padding: 32 }}>{error}</div>;
  if (!item) return <Loading />;

  const isAdmin = Object.keys(user?.roles ?? {}).includes('Admin');
  const owns = item.owners.some(owner => String(owner.id) === String(user?.userId));
  // Presenton decks are designed, edited and stored in Presenton; Superset embeds them.
  if (parseSource(item).engine === 'presenton') {
    return <PresentonDeck key={item.id} item={item} canEdit={owns || isAdmin} addDangerToast={addDangerToast} />;
  }
  return (
    <PageEditorScreen
      key={item.id}
      page={item}
      kind={PRESENTATION_KIND}
      canEdit={owns || isAdmin}
      addDangerToast={addDangerToast}
      addSuccessToast={addSuccessToast}
    />
  );
}

export default withToasts(PresentationEditor);
