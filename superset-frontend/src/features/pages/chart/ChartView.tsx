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
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { getChartMetadataRegistry, SuperChart } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { Loading } from '@superset-ui/core/components';
import { ExternalLink, GripVertical, RefreshCw } from 'lucide-react';
import { useEditable } from '../editor/lib/mode';
import { loadChart, type ChartPayload } from './chartData';

const MIN_HEIGHT = 160;
const MAX_HEIGHT = 1200;

type State = { status: 'loading' } | { status: 'ready'; payload: ChartPayload } | { status: 'error'; message: string };

/** No-op interaction hooks: charts in a page are read-only views of saved charts. */
const HOOKS = { setDataMask: () => {}, onAddFilter: () => {}, setControlValue: () => {} };

export function ChartView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const { chartId, height, showTitle, caption, sliceName, vizType } = node.attrs as {
    chartId: number;
    height: number;
    showTitle: boolean;
    caption: string;
    sliceName: string;
    vizType: string;
  };
  const editable = useEditable();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [width, setWidth] = useState(0);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; height: number } | null>(null);

  const fetchChart = (force = false) => {
    setState({ status: 'loading' });
    loadChart(chartId, force).then(
      payload => {
        setState({ status: 'ready', payload });
        // Keep the stored title/type in sync with the saved chart (used by exports and HTML).
        if (payload.sliceName !== sliceName || payload.vizType !== vizType) {
          updateAttributes({ sliceName: payload.sliceName, vizType: payload.vizType });
        }
      },
      (error: { message?: string; statusText?: string }) =>
        setState({ status: 'error', message: error?.message || error?.statusText || t('This chart could not be loaded.') }),
    );
  };

  useEffect(() => {
    if (chartId) fetchChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId]);

  useEffect(() => {
    const el = body.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const vizName = useMemo(() => getChartMetadataRegistry().get(vizType)?.name ?? vizType, [vizType]);
  const shownHeight = dragHeight ?? height;
  const clamp = (value: number) => Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, value)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { y: event.clientY, height };
    setDragHeight(height);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current) setDragHeight(clamp(start.current.height + event.clientY - start.current.y));
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    if (dragHeight !== null) updateAttributes({ height: dragHeight });
    setDragHeight(null);
  };

  return (
    <NodeViewWrapper as="figure" className="pg-chart-embed" data-type="superset-chart" data-chart-id={chartId} data-selected={selected ? 'true' : undefined}>
      {(showTitle || editable) && (
        <div className="pg-chart-embed__head" contentEditable={false} data-drag-handle>
          {editable && <GripVertical size={14} className="pg-chart-embed__grip" aria-hidden="true" />}
          {showTitle && <span className="pg-chart-embed__title">{sliceName || t('Chart %s', chartId)}</span>}
          <span className="pg-chart-embed__type">{vizName}</span>
          {editable && (
            <span className="pg-chart-embed__actions">
              <button type="button" title={t('Refresh data')} onClick={() => fetchChart(true)}>
                <RefreshCw size={14} />
              </button>
              <a href={`/explore/?slice_id=${chartId}`} target="_blank" rel="noopener noreferrer" title={t('Open in Explore')}>
                <ExternalLink size={14} />
              </a>
            </span>
          )}
        </div>
      )}
      <div className="pg-chart-embed__body" ref={body} style={{ height: shownHeight }} contentEditable={false} data-chart-capture>
        {state.status === 'loading' && <Loading position="floating" />}
        {state.status === 'error' && <div className="pg-chart-embed__error">{state.message}</div>}
        {state.status === 'ready' && width > 0 && (
          <SuperChart
            chartType={state.payload.formData.viz_type}
            formData={state.payload.formData}
            datasource={state.payload.datasource as never}
            queriesData={state.payload.queriesData}
            hooks={HOOKS}
            width={width}
            height={shownHeight}
            enableNoResults
          />
        )}
      </div>
      {caption && <figcaption className="pg-chart-embed__caption">{caption}</figcaption>}
      {editable && (
        <div
          className="pg-chart-embed__resize"
          contentEditable={false}
          role="slider"
          aria-label={t('Chart height')}
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={MAX_HEIGHT}
          aria-valuenow={shownHeight}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      )}
    </NodeViewWrapper>
  );
}
