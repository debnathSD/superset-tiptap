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
import type { JSONContent } from '@tiptap/core';
import { t } from '@apache-superset/core/translation';
import { DEFAULT_PAGE_SETTINGS, type PageSettings } from 'src/features/pages/api';
import { banner, bullets, callout, h, kpis, p, section, spacer, text } from 'src/features/pages/editor/content/builders';
import type { Tone } from 'src/features/pages/editor/lib/palette';

/** The deck outline the generator returns (see superset/presentations/ai.py). */
export type SlideKind = 'title' | 'chart' | 'chart_with_insights' | 'kpis' | 'insights' | 'closing';
export type DeckKpi = { label: string; value: string; detail: string; tone: Tone };
export type Slide = {
  kind: SlideKind;
  title: string;
  subtitle: string;
  bullets: string[];
  chart_ids: number[];
  kpis: DeckKpi[];
  notes: string;
};
export type Deck = { title: string; subtitle: string; slides: Slide[] };

/** Presentations are always 16:9 slides; the cover slide carries no header or footer. */
export const PRESENTATION_SETTINGS: PageSettings = {
  ...DEFAULT_PAGE_SETTINGS,
  layout: 'landscape',
  margins: 'normal',
  footer: { left: '{title}', center: '', right: '{page} / {pages}' },
  differentFirstPage: true,
};

const ACCENT = 'indigo';
/** Heights that keep a slide title, subtitle and chart on one 1280 × 720 slide. */
const CHART_HEIGHT = { full: 400, half: 340 };
/** Space above the cover and closing banners, which roughly centres them on the slide. */
const BANNER_OFFSET = { lg: 112, md: 150 };

const pageBreak: JSONContent = { type: 'pageBreak' };

const chartNode = (chartId: number, names: Map<number, string>, height: number, showTitle: boolean): JSONContent => ({
  type: 'supersetChart',
  attrs: { chartId, sliceName: names.get(chartId) ?? '', vizType: '', height, showTitle, caption: '' },
});

const heading = (slide: Slide): JSONContent[] => [h(2, slide.title), ...(slide.subtitle ? [p(text(slide.subtitle, 'italic'))] : [])];

const points = (items: string[]) => bullets(...items.map(item => [item]));

const kpiTiles = (items: DeckKpi[]) =>
  kpis(
    items.map(kpi => ({ label: kpi.label, value: kpi.value, tone: kpi.tone, delta: kpi.detail, deltaTone: kpi.tone })),
    Math.min(4, Math.max(2, items.length)),
  );

function slideBlocks(slide: Slide, deck: Deck, names: Map<number, string>, when: string): JSONContent[] {
  const charts = slide.chart_ids.slice(0, 2);
  switch (slide.kind) {
    case 'title':
      return [
        spacer(BANNER_OFFSET.lg),
        banner(
          { color: ACCENT, size: 'lg', align: 'left', fill: 'gradient', fullBleed: true },
          h(1, slide.title || deck.title),
          ...(slide.subtitle || deck.subtitle ? [p(slide.subtitle || deck.subtitle)] : []),
          p(text(when, 'bold')),
        ),
      ];
    case 'kpis':
      return [...heading(slide), kpiTiles(slide.kpis), ...(slide.bullets.length ? [points(slide.bullets)] : [])];
    case 'chart':
      if (charts.length === 2) {
        return [...heading(slide), section('two', {}, [chartNode(charts[0], names, CHART_HEIGHT.half, true)], [chartNode(charts[1], names, CHART_HEIGHT.half, true)])];
      }
      return [...heading(slide), chartNode(charts[0], names, CHART_HEIGHT.full, false)];
    case 'chart_with_insights':
      return [
        ...heading(slide),
        section(
          'oneThirdRight',
          {},
          charts.map(id => chartNode(id, names, charts.length === 2 ? CHART_HEIGHT.half / 2 + 10 : CHART_HEIGHT.half, charts.length === 2)),
          [callout({ color: ACCENT, icon: '💡', variant: 'tint' }, points(slide.bullets.length ? slide.bullets : [t('Add your takeaway here')]))],
        ),
      ];
    case 'closing':
      return [
        spacer(BANNER_OFFSET.md),
        banner(
          { color: ACCENT, size: 'md', align: 'left', fill: 'gradient', fullBleed: true },
          h(2, slide.title),
          ...(slide.subtitle ? [p(slide.subtitle)] : []),
          ...(slide.bullets.length ? [points(slide.bullets)] : []),
        ),
      ];
    case 'insights':
    default:
      return [
        ...heading(slide),
        ...(slide.kpis.length ? [kpiTiles(slide.kpis)] : []),
        points(slide.bullets.length ? slide.bullets : [t('Add your points here')]),
      ];
  }
}

/**
 * Turn a generated deck into the editor's document: one slide per deck slide,
 * separated by page breaks, with live Superset charts where the deck names them.
 */
export function deckToDoc(deck: Deck, chartNames: Map<number, string>, now = new Date()): JSONContent {
  const when = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const content: JSONContent[] = [];
  deck.slides.forEach((slide, index) => {
    if (index > 0) content.push(pageBreak);
    content.push(...slideBlocks(slide, deck, chartNames, when));
  });
  content.push(p());
  return { type: 'doc', attrs: { pageWidth: 'standard' }, content };
}

/** A new, empty deck: a cover slide and one content slide. */
export function blankDeck(title: string): JSONContent {
  return deckToDoc(
    {
      title,
      subtitle: '',
      slides: [
        { kind: 'title', title, subtitle: t('Subtitle'), bullets: [], chart_ids: [], kpis: [], notes: '' },
        { kind: 'insights', title: t('Slide title'), subtitle: '', bullets: [t('Type / to add charts, KPIs and more')], chart_ids: [], kpis: [], notes: '' },
      ],
    },
    new Map(),
  );
}
