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

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { pageGeometry } from './geometry';
import { isPaged, type HeaderFooterZone, type PageSettings } from './settings';

/** Scale that fits a sheet `width` px wide into the frame's scroll container (1 when it fits or when disabled). */
function useFitScale(frameRef: RefObject<HTMLElement | null>, width: number) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    // The canvas is the frame's parent; read it from the DOM because a parent's ref isn't attached yet when this runs.
    const canvas = frameRef.current?.parentElement;
    if (!canvas || !width) {
      setScale(1);
      return;
    }
    const update = () => {
      const style = getComputedStyle(canvas);
      const available = canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setScale(Math.min(1, Math.max(0.2, available / width)));
    };
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    update();
    return () => observer.disconnect();
  }, [frameRef, width]);
  return scale;
}

function useHeight(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    setHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return height;
}

/**
 * The page surface: a fixed-size sheet for portrait pages and landscape
 * slides (scaled down to fit narrow windows, never while exporting), or a
 * plain seamless canvas. Double-clicking a header or footer band edits it.
 */
export function PageSheet({
  settings,
  sheetRef,
  fit,
  onEditBand,
  children,
}: {
  /** Settings with the layout to render. */
  settings: PageSettings;
  sheetRef: RefObject<HTMLDivElement>;
  /** Scale wide sheets down to the canvas width. */
  fit: boolean;
  onEditBand?: (zone: HeaderFooterZone) => void;
  children: ReactNode;
}) {
  const paged = isPaged(settings);
  const geometry = pageGeometry(settings);
  const frameRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(frameRef, paged && fit ? geometry.width : 0);
  const scaled = paged && scale < 1;
  const height = useHeight(sheetRef, scaled);
  const style = {
    width: paged ? geometry.width : undefined,
    minHeight: paged ? geometry.height : undefined,
    '--margin': `${geometry.margin}px`,
    transform: scaled ? `scale(${scale})` : undefined,
  } as CSSProperties;

  return (
    <div className="pg-sheet-frame" ref={frameRef} data-layout={settings.layout} style={scaled ? { width: geometry.width * scale, height: height * scale } : undefined}>
      <div
        className="pg-sheet"
        ref={sheetRef}
        style={style}
        data-layout={settings.layout}
        data-paginate={paged || undefined}
        data-scaled={scaled || undefined}
        onDoubleClick={event => {
          const band = (event.target as HTMLElement).closest<HTMLElement>('.pg-hf');
          if (band && onEditBand) onEditBand(band.dataset.zone as HeaderFooterZone);
        }}
      >
        {children}
      </div>
    </div>
  );
}
