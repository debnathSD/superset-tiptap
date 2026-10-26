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
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { getChartMetadataRegistry } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { BarChart3, GripVertical, Plus, Search, X } from 'lucide-react';
import { fetchCharts, type ChartSummary } from '../api';
import { insertBlock } from '../editor/lib/insert';
import { CHART_MIME, type ChartDragData } from './SupersetChart';

const PAGE = 30;

/** Every saved chart, searchable and paginated; drag one onto the page or click + to insert it at the cursor. */
export function ChartPicker({ editor, editable, onClose }: { editor: Editor; editable: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [charts, setCharts] = useState<ChartSummary[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(() => {
      setLoading(true);
      fetchCharts(query.trim(), 0, PAGE)
        .then(result => {
          if (id !== request.current) return;
          setCharts(result.charts);
          setCount(result.count);
          setPage(0);
        })
        .finally(() => id === request.current && setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadMore = () => {
    setLoading(true);
    fetchCharts(query.trim(), page + 1, PAGE)
      .then(result => {
        setCharts(previous => [...previous, ...result.charts]);
        setPage(page + 1);
      })
      .finally(() => setLoading(false));
  };

  const insert = (chart: ChartSummary) =>
    insertBlock(editor, { type: 'supersetChart', attrs: { chartId: chart.id, sliceName: chart.slice_name, vizType: chart.viz_type } });

  return (
    <aside className="outline pg-chart-picker" aria-label={t('Charts')}>
      <header className="outline__header">
        <div>
          <div className="pane__eyebrow">{t('Charts')}</div>
          <div className="outline__meta">{editable ? t('Drag a chart onto the page') : t('Switch to Edit to add charts')}</div>
        </div>
        <button type="button" className="icon-btn" title={t('Close')} onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <label className="pg-chart-picker__search">
        <Search size={14} />
        <input placeholder={t('Search %s charts', count)} value={query} onChange={e => setQuery(e.target.value)} aria-label={t('Search charts')} />
      </label>
      <ul className="pg-chart-picker__list">
        {charts.map(chart => {
          const name = getChartMetadataRegistry().get(chart.viz_type)?.name ?? chart.viz_type;
          const drag: ChartDragData = { id: chart.id, slice_name: chart.slice_name, viz_type: chart.viz_type };
          return (
            <li
              key={chart.id}
              draggable={editable}
              data-editable={editable || undefined}
              onDragStart={event => {
                event.dataTransfer.setData(CHART_MIME, JSON.stringify(drag));
                event.dataTransfer.setData('text/plain', chart.slice_name);
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              {editable && <GripVertical size={14} className="pg-chart-picker__grip" aria-hidden="true" />}
              <BarChart3 size={16} className="pg-chart-picker__icon" aria-hidden="true" />
              <span className="pg-chart-picker__text">
                <span className="pg-chart-picker__name" title={chart.slice_name}>
                  {chart.slice_name}
                </span>
                <span className="pg-chart-picker__meta">
                  {name}
                  {chart.datasource_name_text ? ` · ${chart.datasource_name_text}` : ''}
                </span>
              </span>
              {editable && (
                <button type="button" className="icon-btn" title={t('Insert at cursor')} onClick={() => insert(chart)}>
                  <Plus size={15} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {charts.length < count && (
        <button type="button" className="btn btn--ghost pg-chart-picker__more" disabled={loading} onClick={loadMore}>
          {loading ? t('Loading…') : t('Load more (%s of %s)', charts.length, count)}
        </button>
      )}
      {!loading && charts.length === 0 && <p className="outline__empty">{t('No charts match.')}</p>}
    </aside>
  );
}
