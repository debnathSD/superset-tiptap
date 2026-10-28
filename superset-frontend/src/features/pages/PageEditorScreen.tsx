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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { t } from '@apache-superset/core/translation';
import { isThemeDark, useTheme } from '@apache-superset/core/theme';
import { ArrowLeft, BarChart3, Check, Copy, Download, Eye, FileText, ListTree, LoaderCircle, Lock, PanelRight, PanelsTopBottom, Pencil, Play, Presentation, RectangleHorizontal, RectangleVertical, ScrollText, Settings2, TriangleAlert, Upload } from 'lucide-react';
import { BlockHandle } from './editor/BlockHandle';
import { TableControls } from './editor/TableControls';
import { blankDoc } from './editor/content/builders';
import { editorExtensions } from './editor/extensions';
import { EditableContext } from './editor/lib/mode';
import { textStats, type TextStats } from './editor/lib/textStats';
import { OutlinePanel } from './editor/panels/OutlinePanel';
import { PropertyPane } from './editor/panels/PropertyPane';
import { Toolbar } from './editor/toolbar/Toolbar';
import { Field, Popover, Segmented } from './editor/ui/controls';
import { ChartPicker } from './chart/ChartPicker';
import { pageBreaks, waitForPagination } from './pagination/pagination';
import { PageSheet } from './pagination/PageSheet';
import { SlideShow } from './pagination/SlideShow';
import { HeaderFooterPanel, type HeaderFooterFocus } from './pagination/HeaderFooterPanel';
import { formatDate, type HeaderFooterZone, type PageVars } from './pagination/settings';
import { copyPage, isPaged, parseContent, parseSettings, updatePage, type LayoutMode, type PageRecord, type PageSettings } from './api';
import { exportLayout, runExporter, type ExportKind } from './export/run';
import './styles/tokens.css';
import './styles/content.css';
import './styles/app.css';
import './styles/superset.css';

/** What differs between the documents that share this editor: pages and presentations. */
export type EditorKind = {
  listPath: string;
  listLabel: string;
  itemPath: (id: number) => string;
  nameLabel: string;
  untitled: string;
  save: (id: number, body: Parameters<typeof updatePage>[1]) => Promise<void>;
  copy: (id: number) => Promise<number>;
  copied: (title: string) => string;
  saveError: string;
  copyError: string;
  /** A fixed layout hides the layout switch (presentations are always slides). */
  layout?: LayoutMode;
  /** Offer a fullscreen slideshow. */
  present?: boolean;
};

export const PAGE_KIND: EditorKind = {
  listPath: '/page/list/',
  listLabel: t('Pages'),
  itemPath: id => `/page/${id}/`,
  nameLabel: t('Page name'),
  untitled: t('Untitled page'),
  save: updatePage,
  copy: id => copyPage(id),
  copied: title => t('Copied "%s" to your pages', title),
  saveError: t('Could not save the page.'),
  copyError: t('Could not copy the page.'),
};

/** The record the editor works on; presentations have no templates. */
export type EditorRecord = Omit<PageRecord, 'is_template'> & { is_template?: boolean };

type Props = {
  page: EditorRecord;
  kind?: EditorKind;
  canEdit: boolean;
  addSuccessToast: (msg: string) => void;
  addDangerToast: (msg: string) => void;
};
type SaveStatus = 'saved' | 'saving' | 'error' | 'readonly';

function useDebounced<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  const timer = useRef<number>();
  const latest = useRef(fn);
  latest.current = fn;
  const call = useCallback((...args: T) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => latest.current(...args), ms);
  }, [ms]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return call;
}

function PageSetup({ settings, paper, onChange, onHeaderFooter }: { settings: PageSettings; paper: boolean; onChange: (s: PageSettings) => void; onHeaderFooter: () => void }) {
  const set = (patch: Partial<PageSettings>) => onChange({ ...settings, ...patch });
  return (
    <div className="popover__body pg-page-setup">
      <div className="popover__title">{t('Page setup')}</div>
      {paper && (
        <Field label={t('Portrait paper')} hint={t('Landscape pages are always 16:9 PowerPoint slides.')}>
          <Segmented value={settings.size} onChange={size => set({ size })} options={['A4', 'Letter', 'Legal'].map(v => ({ value: v as PageSettings['size'], label: v }))} />
        </Field>
      )}
      <Field label={t('Margins')}>
        <Segmented value={settings.margins} onChange={margins => set({ margins })} options={[{ value: 'narrow', label: t('Narrow') }, { value: 'normal', label: t('Normal') }, { value: 'wide', label: t('Wide') }]} />
      </Field>
      <button type="button" className="btn pg-page-setup__more" onClick={onHeaderFooter}>
        <PanelsTopBottom size={15} /> {t('Header, footer & page numbers…')}
      </button>
    </div>
  );
}

const LAYOUTS: Array<{ value: LayoutMode; label: string; title: string; Icon: typeof FileText }> = [
  { value: 'portrait', label: t('Portrait'), title: t('Word-style pages with automatic page breaks'), Icon: RectangleVertical },
  { value: 'landscape', label: t('Landscape'), title: t('16:9 PowerPoint-style slides with automatic breaks'), Icon: RectangleHorizontal },
  { value: 'canvas', label: t('Canvas'), title: t('One seamless page, no breaks'), Icon: ScrollText },
];

function LayoutSwitch({ value, onChange }: { value: LayoutMode; onChange: (layout: LayoutMode) => void }) {
  return (
    <div className="mode-switch pg-layout-switch" role="radiogroup" aria-label={t('Layout')}>
      {LAYOUTS.map(({ value: layout, label, title, Icon }) => (
        <button key={layout} type="button" role="radio" aria-checked={value === layout} title={title} onClick={() => onChange(layout)}>
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}

export function PageEditorScreen({ page, kind = PAGE_KIND, canEdit, addSuccessToast, addDangerToast }: Props) {
  const history = useHistory();
  const theme = useTheme();
  const dark = isThemeDark(theme);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [settings, setSettings] = useState(() => {
    const stored = parseSettings(page);
    return kind.layout ? { ...stored, layout: kind.layout } : stored;
  });
  const [mode, setMode] = useState<'edit' | 'view'>(canEdit ? 'edit' : 'view');
  const [left, setLeft] = useState<'outline' | 'charts' | null>(() => (window.innerWidth > 1200 ? (canEdit ? 'charts' : 'outline') : null));
  const [right, setRight] = useState<'properties' | 'headerFooter' | null>(() => (window.innerWidth > 1200 ? 'properties' : null));
  const [hfFocus, setHfFocus] = useState<HeaderFooterFocus | null>(null);
  const [title, setTitle] = useState(page.title);
  const [published, setPublished] = useState(page.published);
  const [status, setStatus] = useState<SaveStatus>(canEdit ? 'saved' : 'readonly');
  const [exporting, setExporting] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  /** While exporting, render in the layout the file needs (Word = portrait, PowerPoint = landscape). */
  const [renderLayout, setRenderLayout] = useState<LayoutMode | null>(null);
  const effective = useMemo(() => (renderLayout ? { ...settings, layout: renderLayout } : settings), [settings, renderLayout]);
  const editing = canEdit && mode === 'edit';

  const extensions = useMemo(() => editorExtensions(settings), []); // eslint-disable-line react-hooks/exhaustive-deps
  const editor = useEditor({
    extensions,
    content: parseContent(page) ?? blankDoc(page.title),
    editable: editing,
    immediatelyRender: true,
    editorProps: { attributes: { class: 'pg-content', 'aria-label': t('Page content'), spellcheck: 'true' } },
  });

  // Fill the window under Superset's nav; the nav's height changes as the window resizes.
  useLayoutEffect(() => {
    const update = () => setTop((rootRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    editor.setEditable(editing);
  }, [editor, editing]);

  // ── Saving ────────────────────────────────────────────────────────────────
  const pending = useRef(false);
  const save = useCallback(
    (body: Parameters<typeof updatePage>[1]) => {
      if (!canEdit) return;
      setStatus('saving');
      kind.save(page.id, body).then(
        () => {
          pending.current = false;
          setStatus('saved');
        },
        () => {
          setStatus('error');
          addDangerToast(kind.saveError);
        },
      );
    },
    [addDangerToast, canEdit, kind, page.id],
  );
  const saveContent = useDebounced(() => save({ content: JSON.stringify(editor.getJSON()) }), 900);
  const saveTitle = useDebounced((value: string) => save({ title: value.trim() || kind.untitled }), 600);
  const saveSettings = useDebounced((value: PageSettings) => save({ page_settings: JSON.stringify(value) }), 400);

  useEffect(() => {
    if (!canEdit) return undefined;
    const onUpdate = ({ transaction }: { transaction: { getMeta: (k: string) => unknown } }) => {
      if (transaction.getMeta('addToHistory') === false) return; // ids, pagination: bookkeeping only
      pending.current = true;
      setStatus('saving');
      saveContent();
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [canEdit, editor, saveContent]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    editor.commands.setPageSettings(effective);
  }, [editor, effective]);

  // Values for the {title}, {author} and {date} header/footer fields.
  const author = [page.created_by?.first_name, page.created_by?.last_name].filter(Boolean).join(' ') || [page.owners[0]?.first_name, page.owners[0]?.last_name].filter(Boolean).join(' ');
  const vars = useMemo<PageVars>(() => ({ title: title.trim() || kind.untitled, author, date: formatDate(new Date()) }), [title, author]);
  useEffect(() => {
    editor.commands.setPageVars(vars);
  }, [editor, vars]);

  const updateSettings = (next: PageSettings) => {
    setSettings(next);
    saveSettings(next);
  };
  const openHeaderFooter = (zone: HeaderFooterZone = 'footer') => {
    if (!canEdit) return;
    if (mode !== 'edit') setMode('edit');
    setRight('headerFooter');
    setHfFocus({ zone, nonce: Date.now() });
  };

  const changeLayout = (layout: LayoutMode) => {
    const next = { ...settings, layout };
    setSettings(next);
    if (canEdit) saveSettings(next); // viewers can switch too, it just isn't saved
  };

  useEffect(() => {
    const open = () => setLeft('charts');
    window.addEventListener('pg:open-chart-picker', open);
    return () => window.removeEventListener('pg:open-chart-picker', open);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState<TextStats>(() => textStats(editor.getJSON()));
  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setStats(textStats(editor.getJSON())), 300);
    };
    editor.on('update', update);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', update);
    };
  }, [editor]);
  const totalPages = useEditorState({ editor, selector: ({ editor: e }) => pageBreaks(e.state)?.total ?? 1 });

  const clone = () =>
    kind.copy(page.id).then(
      id => {
        addSuccessToast(kind.copied(page.title));
        history.push(kind.itemPath(id));
      },
      () => addDangerToast(kind.copyError),
    );

  // ── Slideshow ─────────────────────────────────────────────────────────────
  const editingBeforeShow = useRef(false);
  const startShow = () => {
    editingBeforeShow.current = editing;
    if (editing) setMode('view');
    setPresenting(true);
    rootRef.current?.requestFullscreen?.().catch(() => undefined); // without fullscreen the show still covers the window
  };
  const endShow = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    if (editingBeforeShow.current) setMode('edit');
  }, []);

  const runExport = async (kind: ExportKind) => {
    if (!sheetRef.current) return;
    setExporting(kind);
    const wasEditing = editing;
    if (wasEditing) setMode('view'); // hide editing chrome in captures
    const layout = exportLayout(kind, settings);
    setRenderLayout(layout);
    try {
      await new Promise(resolve => setTimeout(resolve, 200));
      await waitForPagination(editor);
      const context = { editor, sheet: sheetRef.current!, title: title || page.title, settings: { ...settings, layout }, vars, dark };
      await runExporter(kind, context);
      addSuccessToast(t('Download ready'));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      addDangerToast(t('Export failed: %s', (error as Error).message));
    } finally {
      setRenderLayout(null);
      if (wasEditing) setMode('edit');
      setExporting(null);
    }
  };


  return (
    <div className="pg-root pg-editor" data-theme={dark ? 'dark' : 'light'} ref={rootRef} style={{ height: `calc(100vh - ${top}px)` }}>
      <div className="app" data-mode={editing ? 'edit' : 'view'} data-presenting={presenting || undefined} data-exporting={exporting || undefined} data-hf-editing={(editing && right === 'headerFooter' && !exporting) || undefined}>
        <header className="pg-header">
          <div className="pg-header__left">
            <Link to={kind.listPath} className="pg-header__back" title={kind.listLabel}>
              <ArrowLeft size={16} /> {kind.listLabel}
            </Link>
            <span className="pg-header__sep" aria-hidden="true" />
            {canEdit ? (
              <input
                className="pg-header__title"
                value={title}
                aria-label={kind.nameLabel}
                placeholder={kind.untitled}
                onChange={e => {
                  setTitle(e.target.value);
                  pending.current = true;
                  saveTitle(e.target.value);
                }}
                onKeyDown={e => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
              />
            ) : (
              <span className="pg-header__title pg-header__title--static">
                <Lock size={14} /> {title}
              </span>
            )}
            {page.is_template ? (
              <span className="pg-pill" data-tone="info">{t('Template')}</span>
            ) : (
              <span className="pg-pill" data-tone={published ? 'good' : 'neutral'}>{published ? t('Published') : t('Draft')}</span>
            )}
            <span className="pg-header__status" data-status={status} aria-live="polite">
              {status === 'saving' && <><LoaderCircle size={13} className="spin" /> {t('Saving…')}</>}
              {status === 'saved' && <><Check size={13} /> {t('Saved')}</>}
              {status === 'error' && <><TriangleAlert size={13} /> {t('Not saved')}</>}
              {status === 'readonly' && <><Lock size={13} /> {t('Read-only')}</>}
            </span>
          </div>
          <div className="pg-header__right">
            <button type="button" className="icon-btn" title={t('Outline')} aria-pressed={left === 'outline'} onClick={() => setLeft(left === 'outline' ? null : 'outline')}>
              <ListTree size={18} />
            </button>
            <button type="button" className="icon-btn" title={t('Charts')} aria-pressed={left === 'charts'} onClick={() => setLeft(left === 'charts' ? null : 'charts')}>
              <BarChart3 size={18} />
            </button>
            {editing && (
              <button type="button" className="icon-btn" title={t('Properties')} aria-pressed={right === 'properties'} onClick={() => setRight(right === 'properties' ? null : 'properties')}>
                <PanelRight size={18} />
              </button>
            )}
            {canEdit && (
              <button type="button" className="icon-btn" title={t('Header & footer')} aria-pressed={editing && right === 'headerFooter'} onClick={() => (editing && right === 'headerFooter' ? setRight(null) : openHeaderFooter())}>
                <PanelsTopBottom size={18} />
              </button>
            )}
            {!kind.layout && <LayoutSwitch value={effective.layout} onChange={changeLayout} />}
            <Popover title={t('Page setup')} label={<><Settings2 size={16} /> {t('Page setup')}</>} align="end" disabled={!canEdit}>
              {close => (
                <PageSetup
                  settings={settings}
                  paper={!kind.layout || kind.layout === 'portrait'}
                  onChange={updateSettings}
                  onHeaderFooter={() => {
                    close();
                    openHeaderFooter();
                  }}
                />
              )}
            </Popover>
            <Popover title={t('Download')} label={exporting ? <><LoaderCircle size={16} className="spin" /> {t('Exporting…')}</> : <><Download size={16} /> {t('Download')}</>} align="end" disabled={!!exporting}>
              {close => (
                <div className="menu__panel pg-export-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => (close(), runExport('pdf'))}>
                    <FileText size={15} /> {t('PDF document')}
                  </button>
                  <button type="button" role="menuitem" onClick={() => (close(), runExport('docx'))}>
                    <FileText size={15} /> {t('Word document (.docx)')}
                  </button>
                  <button type="button" role="menuitem" onClick={() => (close(), runExport('pptx'))}>
                    <Presentation size={15} /> {t('PowerPoint (.pptx)')}
                  </button>
                </div>
              )}
            </Popover>
            {kind.present && (
              <button type="button" className="btn" title={t('Present full screen (Esc to leave)')} onClick={startShow} disabled={!!exporting}>
                <Play size={15} /> {t('Present')}
              </button>
            )}
            {canEdit && !page.is_template && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPublished(!published);
                  save({ published: !published });
                }}
              >
                <Upload size={15} /> {published ? t('Unpublish') : t('Publish')}
              </button>
            )}
            {canEdit ? (
              <div className="mode-switch" role="radiogroup" aria-label={t('Mode')}>
                <button type="button" role="radio" aria-checked={mode === 'edit'} onClick={() => setMode('edit')}>
                  <Pencil size={15} /> {t('Edit')}
                </button>
                <button type="button" role="radio" aria-checked={mode === 'view'} onClick={() => setMode('view')}>
                  <Eye size={15} /> {t('View')}
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn--primary" onClick={clone}>
                <Copy size={15} /> {t('Clone to edit')}
              </button>
            )}
          </div>
        </header>
        {editing && <Toolbar editor={editor} />}
        <div className="app__body">
          {!presenting && left === 'outline' && <OutlinePanel editor={editor} stats={stats} canvasRef={canvasRef} onClose={() => setLeft(null)} />}
          {!presenting && left === 'charts' && <ChartPicker editor={editor} editable={editing} onClose={() => setLeft(null)} />}
          <main className="pg-canvas" ref={canvasRef} data-paged={isPaged(effective) || undefined}>
            <EditableContext.Provider value={editing}>
              <PageSheet settings={effective} sheetRef={sheetRef} fit={!exporting && !presenting} onEditBand={canEdit ? openHeaderFooter : undefined}>
                <div className="pg-page" data-mode={editing ? 'edit' : 'view'}>
                  <EditorContent editor={editor} />
                  {editing && <BlockHandle editor={editor} />}
                  {editing && !exporting && <TableControls editor={editor} />}
                </div>
              </PageSheet>
            </EditableContext.Provider>
          </main>
          {editing && !presenting && right === 'properties' && <PropertyPane editor={editor} stats={stats} onClose={() => setRight(null)} />}
          {editing && !presenting && right === 'headerFooter' && <HeaderFooterPanel settings={settings} vars={vars} total={totalPages} focus={hfFocus} onChange={updateSettings} onClose={() => setRight(null)} />}
        </div>
        {presenting && <SlideShow settings={effective} canvasRef={canvasRef} sheetRef={sheetRef} onExit={endShow} />}
        <footer className="statusbar">
          <span className="statusbar__item">
            {effective.layout === 'portrait' && t('%s pages · %s portrait', totalPages, settings.size)}
            {effective.layout === 'landscape' && t('%s slides · 16:9 landscape', totalPages)}
            {effective.layout === 'canvas' && t('Seamless canvas')}
          </span>
          <span className="statusbar__item">{t('%s min read', stats.readingMinutes)}</span>
          <span className="statusbar__item">{t('%s words', stats.words.toLocaleString())}</span>
          <span className="statusbar__spacer" />
          <span className="statusbar__item statusbar__mode">{editing ? t('Editing') : t('Viewing')}</span>
        </footer>
      </div>
    </div>
  );
}
