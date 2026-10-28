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
import { t } from '@apache-superset/core/translation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { pageGeometry } from './geometry';
import type { PageSettings } from './settings';

/** Top of every sheet, in unscaled sheet pixels, read from the pagination gaps. */
function sheetTops(sheet: HTMLElement): number[] {
  const box = sheet.getBoundingClientRect();
  const scale = box.width / (sheet.offsetWidth || 1) || 1;
  const tops = [0];
  sheet.querySelectorAll<HTMLElement>('.pg-page-gap__between').forEach(between => tops.push((between.getBoundingClientRect().bottom - box.top) / scale));
  return tops;
}

const useViewport = () => {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
};

/**
 * Fullscreen slideshow over the live, read-only slides: the sheet is scaled to
 * fill the screen and moved one slide at a time, so charts stay interactive.
 * Arrow keys, Page Up/Down, Space, Home/End move; Esc leaves.
 */
export function SlideShow({
  settings,
  canvasRef,
  sheetRef,
  onExit,
}: {
  settings: PageSettings;
  canvasRef: RefObject<HTMLElement>;
  sheetRef: RefObject<HTMLDivElement>;
  onExit: () => void;
}) {
  const geometry = pageGeometry(settings);
  const view = useViewport();
  const scale = Math.min(view.w / geometry.width, view.h / geometry.height);
  const [tops, setTops] = useState<number[]>([0]);
  const [index, setIndex] = useState(0);
  const [idle, setIdle] = useState(false);
  const count = tops.length;
  const last = useRef(onExit);
  last.current = onExit;

  // Slide positions change as charts load and pagination settles.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return undefined;
    const measure = () => {
      const next = sheetTops(sheet);
      setTops(prev => (prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 1) ? prev : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    measure();
    const timer = window.setInterval(measure, 500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [sheetRef]);

  const x = (view.w - geometry.width * scale) / 2;
  const y = (view.h - geometry.height * scale) / 2;
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.setProperty('--present-x', `${x}px`);
    canvas.style.setProperty('--present-y', `${y - (tops[Math.min(index, count - 1)] ?? 0) * scale}px`);
    canvas.style.setProperty('--present-scale', String(scale));
  }, [canvasRef, count, index, scale, tops, x, y]);
  useEffect(
    () => () => {
      ['--present-x', '--present-y', '--present-scale'].forEach(name => canvasRef.current?.style.removeProperty(name));
    },
    [canvasRef],
  );

  const go = (to: number) => setIndex(Math.max(0, Math.min(count - 1, to)));
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const i = indexRef.current;
      const moves: Record<string, number> = {
        ArrowRight: i + 1,
        ArrowDown: i + 1,
        PageDown: i + 1,
        ' ': i + 1,
        Enter: i + 1,
        ArrowLeft: i - 1,
        ArrowUp: i - 1,
        PageUp: i - 1,
        Backspace: i - 1,
        Home: 0,
        End: Number.MAX_SAFE_INTEGER,
      };
      if (event.key === 'Escape') {
        event.preventDefault();
        last.current();
      } else if (event.key in moves) {
        event.preventDefault();
        goRef.current(moves[event.key]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Leaving fullscreen (Esc, or the browser's own control) ends the show.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) last.current();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The controls fade out while the pointer rests.
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), 2500);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2500);
    };
    window.addEventListener('mousemove', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
    };
  }, []);

  return (
    <div className="pg-present" data-idle={idle || undefined}>
      <div className="pg-present__mask" style={{ left: x, top: y, width: geometry.width * scale, height: geometry.height * scale }} />
      <div className="pg-present__bar" role="toolbar" aria-label={t('Slideshow')}>
        <button type="button" className="icon-btn" title={t('Previous slide')} disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeft size={18} />
        </button>
        <span className="pg-present__count" aria-live="polite">
          {t('%s / %s', Math.min(index, count - 1) + 1, count)}
        </span>
        <button type="button" className="icon-btn" title={t('Next slide')} disabled={index >= count - 1} onClick={() => go(index + 1)}>
          <ChevronRight size={18} />
        </button>
        <span className="pg-present__sep" aria-hidden="true" />
        <button type="button" className="icon-btn" title={t('End slideshow (Esc)')} onClick={() => onExit()}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
