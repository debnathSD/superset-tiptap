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
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PaneSection, Toggle } from '../editor/ui/controls';
import { pageGeometry } from './geometry';
import {
  fillFields,
  HEADER_FOOTER_FIELDS,
  HEADER_FOOTER_PRESETS,
  isPaged,
  showsHeaderFooter,
  type HeaderFooterSlot,
  type HeaderFooterSlots,
  type HeaderFooterZone,
  type PageSettings,
  type PageVars,
} from './settings';

/**
 * Header & footer editor: three slots (left, center, right) per band, fields
 * such as {page} and {title} inserted at the cursor, quick styles, a
 * different first page and divider lines. The page itself is the live
 * preview; a miniature sheet shows the result in the canvas layout too.
 */

type Target = { zone: HeaderFooterZone; slot: HeaderFooterSlot };
export type HeaderFooterFocus = { zone: HeaderFooterZone; nonce: number };

const SLOTS: Array<{ slot: HeaderFooterSlot; label: string }> = [
  { slot: 'left', label: 'Left' },
  { slot: 'center', label: 'Center' },
  { slot: 'right', label: 'Right' },
];
const ZONES: Array<{ zone: HeaderFooterZone; label: string }> = [
  { zone: 'header', label: 'Header' },
  { zone: 'footer', label: 'Footer' },
];
const sameSlots = (a: HeaderFooterSlots, b: HeaderFooterSlots) => a.left === b.left && a.center === b.center && a.right === b.right;

function MiniBand({ settings, zone, page, total, vars }: { settings: PageSettings; zone: HeaderFooterZone; page: number; total: number; vars: PageVars }) {
  const show = showsHeaderFooter(settings, page);
  return (
    <div className="hf-mini__band" data-zone={zone} data-divider={(show && settings.divider) || undefined}>
      {SLOTS.map(({ slot }) => (
        <span key={slot} data-slot={slot}>
          {show ? fillFields(settings[zone][slot], page, total, vars) : ''}
        </span>
      ))}
    </div>
  );
}

export function HeaderFooterPanel({
  settings,
  vars,
  total,
  focus,
  onChange,
  onClose,
}: {
  settings: PageSettings;
  vars: PageVars;
  /** Pages in the current layout, for the preview. */
  total: number;
  /** Band to focus, e.g. after a double-click on the page. */
  focus?: HeaderFooterFocus | null;
  onChange: (settings: PageSettings) => void;
  onClose: () => void;
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const last = useRef<Target>({ zone: 'footer', slot: 'right' });

  useEffect(() => {
    if (!focus) return;
    const slots = settings[focus.zone];
    const slot = SLOTS.find(s => slots[s.slot])?.slot ?? 'left';
    const el = inputs.current.get(`${focus.zone}.${slot}`);
    el?.focus();
    el?.select();
    last.current = { zone: focus.zone, slot };
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSlot = (zone: HeaderFooterZone, slot: HeaderFooterSlot, value: string) => onChange({ ...settings, [zone]: { ...settings[zone], [slot]: value } });

  const insert = (token: string) => {
    const { zone, slot } = last.current;
    const el = inputs.current.get(`${zone}.${slot}`);
    const value = settings[zone][slot];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setSlot(zone, slot, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const preset = HEADER_FOOTER_PRESETS.find(p => sameSlots(p.header, settings.header) && sameSlots(p.footer, settings.footer))?.id;
  const layout = isPaged(settings) ? settings.layout : 'portrait';
  const geometry = pageGeometry(settings, layout);
  const pages = Math.max(total, 2);
  const previewPage = settings.differentFirstPage ? 2 : 1;

  return (
    <aside className="pane hf-pane" aria-label="Header and footer">
      <header className="pane__header">
        <div>
          <div className="pane__eyebrow">Page</div>
          <h2>Header &amp; footer</h2>
        </div>
        <button type="button" className="icon-btn" title="Close header and footer" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="pane__body">
        <div className="hf-mini" data-layout={layout} style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }} aria-label={`Preview of page ${previewPage}`}>
          <MiniBand settings={settings} zone="header" page={previewPage} total={pages} vars={vars} />
          <div className="hf-mini__body" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <MiniBand settings={settings} zone="footer" page={previewPage} total={pages} vars={vars} />
        </div>
        {!isPaged(settings) && (
          <p className="pane__note">Headers and footers show on Portrait pages, Landscape slides and in every download. Switch the layout to see them on the page.</p>
        )}

        <PaneSection title="Quick styles">
          <div className="hf-presets">
            {HEADER_FOOTER_PRESETS.map(p => (
              <button key={p.id} type="button" className="hf-preset" aria-pressed={preset === p.id} onClick={() => onChange({ ...settings, header: p.header, footer: p.footer })}>
                {p.label}
              </button>
            ))}
          </div>
        </PaneSection>

        {ZONES.map(({ zone, label }) => (
          <PaneSection key={zone} title={label}>
            <div className="hf-slots">
              {SLOTS.map(({ slot, label: slotLabel }) => (
                <label key={slot} className="hf-slot">
                  <span className="field__label">{slotLabel}</span>
                  <input
                    className="input"
                    ref={el => {
                      if (el) inputs.current.set(`${zone}.${slot}`, el);
                      else inputs.current.delete(`${zone}.${slot}`);
                    }}
                    value={settings[zone][slot]}
                    aria-label={`${label} ${slotLabel.toLowerCase()}`}
                    data-align={slot}
                    onFocus={() => {
                      last.current = { zone, slot };
                    }}
                    onChange={event => setSlot(zone, slot, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </PaneSection>
        ))}

        <PaneSection title="Insert field">
          <div className="hf-fields">
            {HEADER_FOOTER_FIELDS.map(field => (
              <button key={field.token} type="button" className="hf-field" title={`Insert ${field.token}`} onMouseDown={event => event.preventDefault()} onClick={() => insert(field.token)}>
                {field.label}
              </button>
            ))}
          </div>
          <p className="pane__note">Inserts at the cursor in the last box you used. Fields fill in on every page and in downloads; Word keeps page numbers as live fields.</p>
        </PaneSection>

        <PaneSection title="Options">
          <Toggle checked={settings.differentFirstPage} onChange={differentFirstPage => onChange({ ...settings, differentFirstPage })} label="Different first page" hint="Leave page 1 without a header and footer, for a cover page." />
          <Toggle checked={settings.divider} onChange={divider => onChange({ ...settings, divider })} label="Divider lines" hint="A thin rule under the header and above the footer." />
        </PaneSection>
      </div>
    </aside>
  );
}
