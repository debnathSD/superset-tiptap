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
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
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
  }
  .deck-header__back {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.sizeUnit}px;
    color: ${({ theme }) => theme.colorTextSecondary};
    white-space: nowrap;
  }
  .deck-header__title {
    flex: 1 1 160px;
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
    white-space: nowrap;
  }
  .deck-header__actions {
    display: flex;
    flex: none;
    gap: ${({ theme }) => theme.sizeUnit * 2}px;
  }
  .deck-header__actions svg {
    vertical-align: -2px;
  }
  .deck-header__label {
    margin-left: ${({ theme }) => theme.sizeUnit}px;
  }
  /* Keep one header row on narrower windows: icons only, names in tooltips. */
  @media (max-width: 1240px) {
    .deck-header__label,
    .deck-header__badge-text {
      display: none;
    }
  }
  .deck-frame {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  /* Edge to edge: Presenton's editor brings its own chrome. */
  .deck-frame iframe {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    border: 0;
    background: ${({ theme }) => theme.colorBgContainer};
  }
  .deck-message {
    display: grid;
    place-items: center;
    height: 100%;
    gap: ${({ theme }) => theme.sizeUnit * 3}px;
    text-align: center;
    color: ${({ theme }) => theme.colorTextSecondary};
  }
`;

/**
 * Presenton's editor (slide list, canvas and AI assistant) is laid out for a
 * desktop window. A smaller area gets the same layout, zoomed out to fit,
 * rather than a cramped assistant or Presenton's mobile layout.
 */
const DESKTOP = { width: 1280, height: 720 };

function useDesktopCanvas(ref: RefObject<HTMLElement>) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  const scale = box.width && box.height ? Math.min(1, box.width / DESKTOP.width, box.height / DESKTOP.height) : 1;
  return { scale, width: box.width / scale, height: box.height / scale };
}

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
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvas = useDesktopCanvas(canvasRef);
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
        <span
          className="deck-header__badge"
          title={[
            embed?.can_edit ? t('Edits you make here are saved in Presenton.') : t('View only. Owners can edit this deck.'),
            source.chart_ids?.length ? t('Built from %s Superset charts.', source.chart_ids.length) : '',
          ].join(' ')}
        >
          <Sparkles size={14} /> <span className="deck-header__badge-text">{t('Designed with Presenton')}</span>
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
            <Button buttonStyle="secondary" buttonSize="small" href={source.file_url} target="_blank" rel="noopener noreferrer" title={t('Download .pptx')}>
              <Download size={14} />
              <span className="deck-header__label">{t('Download .pptx')}</span>
            </Button>
          )}
          {embed && (
            <Button buttonStyle="secondary" buttonSize="small" href={embed.url} target="_blank" rel="noopener noreferrer" title={t('Open in new tab')}>
              <ExternalLink size={14} />
              <span className="deck-header__label">{t('Open in new tab')}</span>
            </Button>
          )}
          <Button buttonStyle="primary" buttonSize="small" title={t('Present full screen')} disabled={!embed} onClick={() => frameRef.current?.requestFullscreen?.().catch(() => undefined)}>
            <Maximize2 size={14} />
            <span className="deck-header__label">{t('Present')}</span>
          </Button>
        </div>
      </header>
      <div className="deck-frame" ref={canvasRef}>
        {embed ? (
          <iframe
            ref={frameRef}
            key={embed.url}
            src={embed.url}
            // zoom (not a transform) re-lays the page out at the smaller size, so text stays sharp.
            style={{ width: canvas.width, height: canvas.height, zoom: canvas.scale < 1 ? canvas.scale : undefined }}
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
    </Root>
  );
}
