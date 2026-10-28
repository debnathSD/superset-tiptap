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
import { useEffect, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { Alert } from '@apache-superset/core/components';
import { getClientErrorObject } from '@superset-ui/core';
import { AsyncSelect, FormLabel, Input, InputNumber, Modal, Radio } from '@superset-ui/core/components';
import {
  chartData,
  createPresentation,
  dashboardCharts,
  fetchAiStatus,
  generateDeck,
  presentonTask,
  searchCharts,
  searchDashboards,
  startPresenton,
  type AiStatus,
  type ChartData,
  type Engine,
  type GenerateRequest,
  type Option,
  type Tone,
} from './api';
import { deckToDoc, PRESENTATION_SETTINGS } from './deckToDoc';

const MAX_CHARTS = 12;
/** Presenton usually finishes in one to three minutes. */
const POLL_MS = 4000;
const PRESENTON_LIMIT_MS = 10 * 60 * 1000;

const TONES: Array<{ value: Tone; label: string }> = [
  { value: 'executive', label: t('Executive') },
  { value: 'analytical', label: t('Analytical') },
  { value: 'storytelling', label: t('Storytelling') },
  { value: 'casual', label: t('Casual') },
];

const Body = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.sizeUnit * 4}px;

  .field {
    display: grid;
    gap: ${({ theme }) => theme.sizeUnit}px;
  }
  .field--row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 140px;
    gap: ${({ theme }) => theme.sizeUnit * 4}px;
  }
  .hint {
    color: ${({ theme }) => theme.colorTextDescription};
    font-size: ${({ theme }) => theme.fontSizeSM}px;
  }
  .engines {
    display: grid;
    gap: ${({ theme }) => theme.sizeUnit * 2}px;
  }
  .engines .ant-radio-wrapper {
    align-items: flex-start;
    margin: 0;
  }
  .engine__name {
    font-weight: ${({ theme }) => theme.fontWeightStrong};
  }
  .progress {
    color: ${({ theme }) => theme.colorTextSecondary};
  }
`;

type Phase = { step: 'data'; done: number; total: number } | { step: 'presenton'; started: number } | { step: 'ai' | 'draft' | 'build' } | null;

type Props = {
  show: boolean;
  onHide: () => void;
  onCreated: (id: number) => void;
  addDangerToast: (msg: string) => void;
  addSuccessToast: (msg: string) => void;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Presenton names the exported file after the deck: ".../Contoso-Data-Cloud--Delivery-Summary_<uuid>.pptx". */
function titleFromFile(url: string | null | undefined): string | null {
  const name = decodeURIComponent((url ?? '').split('/').pop() ?? '').replace(/_[0-9a-f-]{36}\.\w+$/i, '').replace(/\.\w+$/, '');
  const title = name.replace(/--/g, ' — ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return title.length >= 3 ? title.slice(0, 200) : null;
}

const headline = (brief: string) => brief.split(/[:.\n]/)[0].trim().slice(0, 120) || t('Untitled presentation');

/**
 * Describe the presentation, pick the dashboard or charts it should draw on,
 * and let Presenton design it, or Claude write it, from the charts' real numbers.
 */
export function CreatePresentationModal({ show, onHide, onCreated, addDangerToast, addSuccessToast }: Props) {
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [engine, setEngine] = useState<Engine>('draft');
  const [brief, setBrief] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState<Tone>('executive');
  const [slides, setSlides] = useState(8);
  const [dashboard, setDashboard] = useState<Option | null>(null);
  const [charts, setCharts] = useState<Option[]>([]);
  const [phase, setPhase] = useState<Phase>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!show) return;
    fetchAiStatus().then(
      status => {
        setAi(status);
        setEngine(status.presenton?.available ? 'presenton' : status.available ? 'claude' : 'draft');
      },
      () => setAi({ available: false, model: null, reason: 'unavailable', presenton: { available: false, reason: 'unavailable' } }),
    );
  }, [show]);

  // Re-render every second while Presenton works, for the elapsed time.
  useEffect(() => {
    if (phase?.step !== 'presenton') return undefined;
    const timer = window.setInterval(() => setTick(n => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase?.step]);

  const pickDashboard = (option: Option | null) => {
    setDashboard(option);
    if (!option) return;
    dashboardCharts(option.value).then(
      list => {
        setCharts(list.slice(0, MAX_CHARTS));
        if (!brief.trim()) setBrief(t('Review of %s', option.label));
      },
      () => addDangerToast(t('Could not load the charts of this dashboard.')),
    );
  };

  const presentonReady = !!ai?.presenton?.available;
  const claudeReady = !!ai?.available;
  const busy = phase !== null;
  const ready = !!brief.trim() && charts.length > 0 && !busy;

  const common = (data: ChartData[]) => ({
    dashboard_id: dashboard?.value ?? null,
    chart_ids: data.map(chart => chart.id),
    audience: audience.trim(),
    tone,
  });

  /** Presenton designs and exports the deck; Superset keeps a record that embeds it. */
  const withPresenton = async (request: GenerateRequest, data: ChartData[]) => {
    setPhase({ step: 'presenton', started: Date.now() });
    const taskId = await startPresenton(request);
    const started = Date.now();
    for (;;) {
      await sleep(POLL_MS);
      const task = await presentonTask(taskId);
      if (task.status === 'error') throw new Error(t('Presenton could not design the deck: %s', task.message));
      if (task.status === 'completed') {
        setPhase({ step: 'build' });
        const title = titleFromFile(task.file_url) ?? headline(request.brief);
        const cover = deckToDoc(
          { title, subtitle: '', slides: [{ kind: 'title', title, subtitle: t('Designed with Presenton'), bullets: [], chart_ids: [], kpis: [], notes: '' }] },
          new Map(),
        );
        const id = await createPresentation({
          title,
          description: request.audience,
          content: JSON.stringify(cover),
          page_settings: JSON.stringify(PRESENTATION_SETTINGS),
          prompt: request.brief,
          source: JSON.stringify({
            engine: 'presenton',
            presenton_id: task.presentation_id,
            file_url: task.file_url,
            edit_url: task.edit_url,
            credits: task.credits,
            ...common(data),
          }),
          published: false,
        });
        addSuccessToast(task.credits ? t('Presenton designed your deck (%s credits)', task.credits) : t('Presenton designed your deck'));
        onCreated(id);
        return;
      }
      if (Date.now() - started > PRESENTON_LIMIT_MS) throw new Error(t('Presenton is taking too long. Try again with fewer slides.'));
    }
  };

  /** Claude (or the plain draft) writes an outline that becomes an editable deck with live charts. */
  const withOutline = async (request: GenerateRequest, data: ChartData[]) => {
    setPhase({ step: request.use_ai ? 'ai' : 'draft' });
    const result = await generateDeck(request);
    setPhase({ step: 'build' });
    const names = new Map(data.map(chart => [chart.id, chart.name]));
    const { deck } = result;
    const id = await createPresentation({
      title: deck.title || headline(request.brief),
      description: deck.subtitle,
      content: JSON.stringify(deckToDoc(deck, names)),
      page_settings: JSON.stringify(PRESENTATION_SETTINGS),
      prompt: request.brief,
      source: JSON.stringify({ engine: result.engine, model: result.model, ...common(data), notes: deck.slides.map(slide => slide.notes) }),
      published: false,
    });
    addSuccessToast(result.engine === 'claude' ? t('Claude wrote %s slides', deck.slides.length) : t('Drafted %s slides from your data', deck.slides.length));
    onCreated(id);
  };

  const generate = async () => {
    setWarning(null);
    try {
      // Each chart's query runs in the browser with the viewer's own permissions.
      setPhase({ step: 'data', done: 0, total: charts.length });
      let done = 0;
      const results = await Promise.allSettled(
        charts.map(chart =>
          chartData(chart.value).finally(() => {
            done += 1;
            setPhase({ step: 'data', done, total: charts.length });
          }),
        ),
      );
      const data = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : [])) as ChartData[];
      const failed = charts.filter((_, i) => results[i].status === 'rejected').map(c => c.label);
      if (!data.length) throw new Error(t('None of the selected charts returned data.'));
      if (failed.length) setWarning(t('Skipped charts that failed to load: %s', failed.join(', ')));

      const request: GenerateRequest = { brief: brief.trim(), audience: audience.trim(), tone, n_slides: slides, use_ai: engine === 'claude', charts: data };
      if (engine === 'presenton') await withPresenton(request, data);
      else await withOutline(request, data);
    } catch (error) {
      const parsed = await getClientErrorObject(error as Response);
      // Validation errors arrive as nested objects; toasts take text only.
      const message = [parsed?.message, parsed?.error, (error as Error)?.message].find(m => typeof m === 'string' && m);
      addDangerToast((message as string | undefined) ?? t('Could not generate the presentation.'));
      setPhase(null);
    }
  };

  const elapsed = phase?.step === 'presenton' ? Math.round((Date.now() - phase.started) / 1000) : 0;
  const progress =
    phase?.step === 'data'
      ? t('Reading chart data… %s of %s', phase.done, phase.total)
      : phase?.step === 'presenton'
        ? t('Presenton is designing your slides… %s:%s (usually 1–3 minutes)', Math.floor(elapsed / 60), String(elapsed % 60).padStart(2, '0'))
        : phase?.step === 'ai'
          ? t('Claude is writing your slides — this can take a minute…')
          : phase?.step === 'draft'
            ? t('Drafting slides from your data…')
            : phase?.step === 'build'
              ? t('Building the deck…')
              : null;

  const engines: Array<{ value: Engine; name: string; detail: string; disabled: boolean }> = [
    {
      value: 'presenton',
      name: t('Presenton'),
      detail: presentonReady ? t('Designs a polished PowerPoint deck from your data. View, edit and download it here.') : t('Not set up: add PRESENTON_API_KEY to the server configuration.'),
      disabled: !presentonReady,
    },
    {
      value: 'claude',
      name: t('Claude'),
      detail: claudeReady ? t('Writes an editable deck with live Superset charts (%s).', ai?.model) : t('Not set up: add ANTHROPIC_API_KEY to the server configuration.'),
      disabled: !claudeReady,
    },
    { value: 'draft', name: t('Plain draft'), detail: t('No AI: an editable deck with live charts and the key numbers.'), disabled: false },
  ];

  const sentTo = engine === 'presenton' ? t('sent to Presenton to design the slides') : engine === 'claude' ? t('sent to Claude to write the slides') : t('kept in Superset');

  return (
    <Modal
      show={show}
      onHide={() => !busy && onHide()}
      title={t('Create a presentation with AI')}
      primaryButtonName={engine === 'presenton' ? t('Design with Presenton') : engine === 'claude' ? t('Generate with Claude') : t('Generate draft')}
      onHandledPrimaryAction={generate}
      disablePrimaryButton={!ready}
      primaryButtonLoading={busy}
      width="640px"
      maskClosable={false}
      destroyOnHidden
    >
      <Body>
        <div className="field">
          <FormLabel>{t('Built by')}</FormLabel>
          <Radio.Group className="engines" value={engine} onChange={e => setEngine(e.target.value)} disabled={busy}>
            {engines.map(option => (
              <Radio key={option.value} value={option.value} disabled={option.disabled}>
                <span className="engine__name">{option.name}</span> <span className="hint">— {option.detail}</span>
              </Radio>
            ))}
          </Radio.Group>
        </div>

        <div className="field">
          <FormLabel required>{t('What is the presentation about?')}</FormLabel>
          <Input.TextArea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            rows={3}
            maxLength={4000}
            disabled={busy}
            placeholder={t('e.g. Quarterly delivery review for the leadership team: what improved, what is at risk, and what we need from them')}
          />
        </div>

        <div className="field--row">
          <div className="field">
            <FormLabel>{t('Audience')}</FormLabel>
            <Input value={audience} onChange={e => setAudience(e.target.value)} maxLength={300} disabled={busy} placeholder={t('e.g. Executive team')} />
          </div>
          <div className="field">
            <FormLabel>{t('Slides')}</FormLabel>
            <InputNumber min={3} max={20} value={slides} onChange={value => setSlides(Number(value) || 8)} disabled={busy} style={{ width: '100%' }} />
          </div>
        </div>

        <div className="field">
          <FormLabel>{t('Tone')}</FormLabel>
          <Radio.Group value={tone} onChange={e => setTone(e.target.value)} disabled={busy} optionType="button" options={TONES} />
        </div>

        <div className="field">
          <FormLabel>{t('Start from a dashboard')}</FormLabel>
          <AsyncSelect
            ariaLabel={t('Dashboard')}
            allowClear
            labelInValue
            value={dashboard}
            options={searchDashboards}
            onChange={value => pickDashboard((value as Option | undefined) ?? null)}
            onClear={() => setDashboard(null)}
            disabled={busy}
            placeholder={t('Choose a dashboard to use its charts')}
          />
        </div>

        <div className="field">
          <FormLabel required>{t('Charts to use')}</FormLabel>
          <AsyncSelect
            ariaLabel={t('Charts')}
            mode="multiple"
            labelInValue
            value={charts}
            options={searchCharts}
            onChange={value => setCharts(((value as Option[] | undefined) ?? []).slice(0, MAX_CHARTS))}
            disabled={busy}
            placeholder={t('Search charts')}
          />
          <span className="hint">{t('Up to %s charts. Their data is read with your permissions and %s.', MAX_CHARTS, sentTo)}</span>
        </div>

        {warning && <Alert type="warning" showIcon message={warning} />}
        {progress && <div className="progress" aria-live="polite">{progress}</div>}
      </Body>
    </Modal>
  );
}
