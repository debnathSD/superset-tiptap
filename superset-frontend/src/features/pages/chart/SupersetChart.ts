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
import { mergeAttributes, Node, Extension } from '@tiptap/core';
import { NodeSelection, Plugin } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ChartView } from './ChartView';

export const CHART_MIME = 'application/x-superset-chart';

export type ChartDragData = { id: number; slice_name: string; viz_type: string };

/**
 * A saved Superset chart embedded in a page. It renders live through
 * SuperChart, so every chart type Superset supports works here.
 */
export const SupersetChart = Node.create({
  name: 'supersetChart',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    const num = (name: string, fallback: number) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => Number(el.getAttribute(`data-${name}`)) || fallback,
      renderHTML: () => ({}),
    });
    const text = (name: string, fallback: string) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
      renderHTML: () => ({}),
    });
    return {
      chartId: num('chart-id', 0),
      sliceName: text('slice-name', ''),
      vizType: text('viz-type', ''),
      height: num('height', 380),
      showTitle: { default: true, parseHTML: el => el.getAttribute('data-show-title') !== 'false', renderHTML: () => ({}) },
      caption: text('caption', ''),
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="superset-chart"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'superset-chart',
        class: 'pg-chart-embed',
        'data-chart-id': a.chartId,
        'data-slice-name': a.sliceName,
        'data-viz-type': a.vizType,
        'data-height': a.height,
        'data-show-title': String(a.showTitle),
        'data-caption': a.caption || undefined,
      }),
      ['figcaption', {}, a.sliceName || `Chart ${a.chartId}`],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartView, { className: 'pg-chart-embed-view' });
  },
});

/** Accept charts dragged from the chart picker and drop them where the cursor is. */
export const ChartDrop = Extension.create({
  name: 'chartDrop',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop: (view, event) => {
            const raw = event.dataTransfer?.getData(CHART_MIME);
            if (!raw || !view.editable) return false;
            event.preventDefault();
            const data = JSON.parse(raw) as ChartDragData;
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!coords) return true;
            const { state } = view;
            const node = state.schema.nodes.supersetChart.create({ chartId: data.id, sliceName: data.slice_name, vizType: data.viz_type });
            const $pos = state.doc.resolve(coords.pos);
            let from = coords.pos;
            let to = coords.pos;
            // Drop next to the block under the pointer; replace it if it is an empty paragraph.
            if ($pos.parent.isTextblock && $pos.depth > 0) {
              const empty = $pos.parent.content.size === 0;
              from = empty ? $pos.before() : $pos.after();
              to = empty ? $pos.after() : from;
            }
            const tr = state.tr.replaceWith(from, to, node);
            const at = tr.doc.nodeAt(from)?.type === node.type ? from : tr.mapping.map(from);
            tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
            view.dispatch(tr);
            view.focus();
            return true;
          },
        },
      }),
    ];
  },
});
