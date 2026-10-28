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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { Button, Loading, Tag } from '@superset-ui/core/components';
import { ArrowLeft, Download, ExternalLink, Maximize2, Sparkles } from 'lucide-react';
import { parseSource, presentonEmbed, updatePresentation, type PresentationRecord, type PresentonEmbed } from './api';

/** Renew the embed link this long before it expires. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

const Root = styled.div`
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colorBgLayout};

  .deck-header {
    display: flex;
    align-items: center;
    gap: ${({ theme }) => theme.sizeUnit * 3}px;
    padding: ${({ theme }) => theme.sizeUnit * 2}px ${({ theme }) => theme.sizeUnit * 4}px;
    border-bottom: 1px solid ${({ theme }) => theme.colorBorderSecondary};
    background: ${({ theme }) => theme.colorBgContainer};
    flex-wrap: wrap;
  }
  .deck-header__back {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.sizeUnit}px;
    color: ${({ theme }) => theme.colorTextSecondary};
  }
  .deck-header__title {
    flex: 1 1 240px;
    min-width: 0;
    padding: ${({ theme }) => theme.sizeUnit}px ${({ theme }) => theme.sizeUnit * 2}px;
    border: 1px solid transparent;
    border-radius: ${({ theme }) => theme.borderRadius}px;
    background: transparent;
    color: ${({ theme }) => theme.colorText};
    font-size: ${({ theme }) => theme.fontSizeLG}px;
    font-weight: ${({ theme }) => theme.fontWeightStrong};
    text-overflow: ellipsis;
  }
  input.deck-header__title:hover,
  input.deck-header__title:focus {
    border-color: ${({ theme }) => theme.colorBorder};
    outline: none;
  }
  .deck-header__badge {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.sizeUnit}px;
    color: ${({ theme }) => theme.colorTextSecondary};
    font-size: ${({ theme }) => theme.fontSizeSM}px;
  }
  .deck-header__actions {
    display: flex;
    gap: ${({ theme }) => theme.sizeUnit * 2}px;
    flex-wrap: wrap;
  }
  .deck-header__actions svg {
    margin-right: ${({ theme }) => theme.sizeUnit}px;
    vertical-align: -2px;
  }
  .deck-frame {
    position: relative;
    flex: 1;
    min-height: 0;
    padding: ${({ theme }) => theme.sizeUnit * 3}px;
  }
  .deck-frame iframe {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 420px;
    border: 0;
    border-radius: ${({ theme }) => theme.borderRadiusLG}px;
    background: ${({ theme }) => theme.colorBgContainer};
    box-shadow: ${({ theme }) => theme.boxShadowTertiary};
  }
  .deck-message {
    display: grid;
    place-items: center;
    height: 100%;
    gap: ${({ theme }) => theme.sizeUnit * 3}px;
    text-align: center;
    color: ${({ theme }) => theme.colorTextSecondary};
  }
  .deck-footer {
    padding: 0 ${({ theme }) => theme.sizeUnit * 4}px ${({ theme }) => theme.sizeUnit * 2}px;
    color: ${({ theme }) => theme.colorTextDescription};
    font-size: ${({ theme }) => theme.fontSizeSM}px;
  }
`;

type Props = {
  item: PresentationRecord;
  canEdit: boolean;
  addDangerToast: (msg: string) => void;
};

/**
 * A deck Presenton designed, shown inside Superset through a scoped,
 * short-lived embed link: owners can edit it in place; everyone can view and download it.
 */
export function PresentonDeck({ item, canEdit, addDangerToast }: Props) {
  const source = parseSource(item);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [top, setTop] = useState(0);
  const [embed, setEmbed] = useState<PresentonEmbed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title);
  const [published, setPublished] = useState(item.published);
  const saveTimer = useRef<number>();

  // Fill the window under Superset's nav.
  useLayoutEffect(() => {
    const update = () => setTop((rootRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Fetch the embed link, and renew it shortly before it expires.
  useEffect(() => {
    let timer = 0;
    let cancelled = false;
    const load = () =>
      presentonEmbed(item.id).then(
        next => {
          if (cancelled) return;
          setEmbed(next);
          setError(null);
          const expires = next.expires_at ? Date.parse(next.expires_at) : NaN;
          if (Number.isFinite(expires)) timer = window.setTimeout(load, Math.max(60000, expires - Date.now() - RENEW_BEFORE_MS));
        },
        () => !cancelled && setError(t('Presenton could not be reached. You can still download the deck.')),
      );
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [item.id]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const save = (body: Parameters<typeof updatePresentation>[1]) =>
    updatePresentation(item.id, body).catch(() => addDangerToast(t('Could not save the presentation.')));

  const rename = (value: string) => {
    setTitle(value);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => save({ title: value.trim() || t('Untitled presentation') }), 600);
  };

  return (
    <Root ref={rootRef} style={{ height: `calc(100vh - ${top}px)` }}>
      <header className="deck-header">
        <Link to="/presentation/list/" className="deck-header__back">
          <ArrowLeft size={16} /> {t('Presentations')}
        </Link>
        {canEdit ? (
          <input
            className="deck-header__title"
            value={title}
            aria-label={t('Presentation name')}
            onChange={e => rename(e.target.value)}
            onKeyDown={e => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
          />
        ) : (
          <span className="deck-header__title">{title}</span>
        )}
        <Tag color={published ? 'green' : undefined}>{published ? t('Published') : t('Draft')}</Tag>
        <span className="deck-header__badge">
          <Sparkles size={14} /> {t('Designed with Presenton')}
        </span>
        <div className="deck-header__actions">
          {canEdit && (
            <Button
              buttonStyle="secondary"
              buttonSize="small"
              onClick={() => {
                setPublished(!published);
                save({ published: !published });
              }}
            >
              {published ? t('Unpublish') : t('Publish')}
            </Button>
          )}
          {source.file_url && (
            <Button buttonStyle="secondary" buttonSize="small" href={source.file_url} target="_blank" rel="noopener noreferrer">
              <Download size={14} /> {t('Download .pptx')}
            </Button>
          )}
          {embed && (
            <Button buttonStyle="secondary" buttonSize="small" href={embed.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> {t('Open in new tab')}
            </Button>
          )}
          <Button buttonStyle="primary" buttonSize="small" disabled={!embed} onClick={() => frameRef.current?.requestFullscreen?.().catch(() => undefined)}>
            <Maximize2 size={14} /> {t('Present')}
          </Button>
        </div>
      </header>
      <div className="deck-frame">
        {embed ? (
          <iframe
            ref={frameRef}
            key={embed.url}
            src={embed.url}
            title={t('Presenton presentation: %s', title)}
            allow="fullscreen; clipboard-write"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : error ? (
          <div className="deck-message">
            <span>{error}</span>
            {source.file_url && (
              <Button buttonStyle="primary" href={source.file_url} target="_blank" rel="noopener noreferrer">
                {t('Download .pptx')}
              </Button>
            )}
          </div>
        ) : (
          <Loading />
        )}
      </div>
      <div className="deck-footer">
        {embed?.can_edit ? t('Edits you make here are saved in Presenton.') : t('View only. Owners can edit this deck.')}
        {source.chart_ids?.length ? ` ${t('Built from %s Superset charts.', source.chart_ids.length)}` : ''}
      </div>
    </Root>
  );
}
