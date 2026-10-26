import type { JSONContent } from '@tiptap/core'
import {
  artwork,
  b,
  banner,
  bullets,
  callout,
  card,
  chart,
  colored,
  divider,
  h,
  kpis,
  link,
  p,
  pageProperties,
  pill,
  quickLinks,
  section,
  spacer,
  styled,
  table,
  text,
} from './builders'

/**
 * A fictional bi-weekly status report (Contoso is Microsoft's demo company).
 * It mirrors the structure of a typical SharePoint report page and exercises
 * every block the editor offers.
 */
export function samplePage(): JSONContent {
  const star = colored('★ ', '#d97706')
  const up = (n: string) => pill(`+${n} vs prev`, 'good')
  const flat = pill('No change', 'neutral')

  return {
    type: 'doc',
    attrs: { pageWidth: 'wide' },
    content: [
      banner(
        { color: 'teal', fill: 'gradient', size: 'sm', align: 'left', fullBleed: true, image: '', overlay: 0 },
        p(b('CONTOSO'), text('  ·  Engineering — Integration & Data Cloud')),
        h(1, 'FY26 Data Cloud — Bi-Weekly Progress Report'),
        pageProperties([
          ['Reporting period', '07 Oct – 23 Oct 2026'],
          ['Scope', 'Jul – Dec FY26'],
          ['Functional group', 'Integration Cloud'],
          ['Data as of', '25 Oct 2026 · 08:00 UTC'],
          ['Classification', 'Sample data'],
        ]),
      ),

      section(
        'one',
        { border: 'subtle', spacing: 'compact' },
        [
          styled(h(2, 'Headline KPIs'), 'teal', 'bar'),
          kpis([
            { label: 'Strategic deliverables', value: '1', unit: '/ 6', status: 'Off track', tone: 'bad', progress: 17, note: '5 of 6 committed within FY26' },
            { label: 'Epic lead time — Ingest', value: '52.8', unit: 'days', status: '+16.8 d over', tone: 'bad', progress: 100, target: 'Target ≤ 36' },
            { label: 'Epic lead time — Analytics', value: '39.1', unit: 'days', status: '+3.1 d over', tone: 'warn', progress: 92, target: 'Target ≤ 36' },
            { label: 'AI transformation', value: 'Gateway live', status: 'On track', tone: 'good', note: 'Gateway ✓ · Tooling ✓' },
            { label: 'Customer health', value: 'In progress', status: 'In progress', tone: 'info', note: 'Baseline due 05 Nov 2026' },
            { label: 'Active integrations', value: '6,812', status: 'Growing', tone: 'good', delta: '+767 MoM', deltaTone: 'good', progress: 81, note: 'As of 23 Oct' },
            { label: 'Account coverage', value: '97.62', unit: '%', status: 'Declining', tone: 'bad', delta: '−0.28 pp MoM', deltaTone: 'bad', progress: 97, note: 'As of 22 Oct' },
          ]),
        ],
      ),

      styled(h(2, '1. Delivery summary'), 'teal', 'bar'),
      section(
        'two',
        { border: 'subtle' },
        [
          styled(h(3, '1.1 Ingestion cloud'), 'teal', 'solid'),
          bullets(
            [b('Identity integration'), ' — design review complete; build ', b('70%'), ' done. ', pill('UAT 27 Oct', 'info')],
            {
              item: [b('Connector SDK'), ' — integration testing complete ', pill('Done', 'good')],
              children: [
                ['Client-specific path mapping defined in UI — ', b('ready 09 Oct')],
                ['Bulk upload — in development ', pill('20%', 'warn')],
              ],
            },
            [b('Gateway service split'), ' for internal and external traffic is ', b('live'), '.'],
            {
              item: [b('Other key activities')],
              children: [
                ['Additional fields for leave and emergency contacts'],
                ['SFTP delivery in production; validation with the partner account in progress'],
                ['Nightly job to clean data for closed accounts'],
              ],
            },
          ),
        ],
        [
          styled(h(3, '1.2 Analytics cloud'), 'teal', 'solid'),
          bullets(
            {
              item: [b('Partner feeds & usage events')],
              children: [
                ['CSV format support in UAT; client configuration complete ', pill('UAT', 'info')],
                ['Usage events — frequency and schedule ', pill('Live 26 Oct', 'good')],
              ],
            },
            {
              item: [b('25 analytics clients automated')],
              children: [
                ['Case-creation logic enhanced for multi-region accounts'],
                ['Planning integration — ', b('in development')],
                ['Vendor carrier onboarded and coverage at ', b('100%')],
              ],
            },
            [link('Release notes', 'https://tiptap.dev'), ' are published for every drop.'],
          ),
        ],
      ),

      styled(h(2, '2. Appreciation'), 'teal', 'bar'),
      section(
        'two',
        { border: 'subtle', spacing: 'compact' },
        [
          p(star, b('CSV feed released to UAT'), ' — Avery, Jordan, Sam, Riley'),
          p(star, b('New partner onboarding'), ' — Morgan'),
          p(star, b('Same-day UAT fix'), ' — Casey'),
        ],
        [
          p(star, b('Open-enrolment workaround'), ' unblocked several clients — Quinn, Taylor'),
          p(star, b('Gateway is live'), ' — thanks to everyone who contributed — Drew, Jamie, Rowan'),
        ],
      ),

      styled(h(2, '3. Integration growth — comparison & analysis'), 'teal', 'bar'),
      section(
        'one',
        { border: 'subtle', spacing: 'compact' },
        [
          p(colored('Source: warehouse collection 55 · 31 Jul 2026 → 23 Oct 2026 · active accounts only', '#64748b')),
          kpis([
            { label: 'Active integrations', value: '6,812', note: 'at 23 Oct 2026 · was 6,045', tone: 'info' },
            { label: 'Net movement', value: '+767', note: '9 up · 0 down · 4 flat', tone: 'good' },
            { label: 'Account coverage', value: '97.62%', note: '−0.28 pp month on month', tone: 'bad' },
          ]),
        ],
      ),
      section(
        'two',
        { border: 'subtle', spacing: 'compact' },
        [
          chart(
            {
              title: 'Account coverage — month end',
              caption: 'Axis 97.00–98.50%, not zero · MTD = month to date',
              format: 'percent',
              decimals: 2,
              axisMin: 97,
              axisMax: 98.5,
              color: 'teal',
              highlight: 'last',
            },
            [
              ['Jul', 97.94, '31 Jul'],
              ['Aug', 98.21, '31 Aug'],
              ['Sep', 97.9, '30 Sep'],
              ['Oct', 97.62, '22 Oct · MTD'],
            ],
          ),
        ],
        [
          chart(
            { title: 'Total integration rows — month end', caption: 'Axis 0–7,000 · month-end partitions', format: 'number', axisMin: 0, axisMax: 7000, color: 'blue', highlight: 'last' },
            [
              ['Jul', 4920, '31 Jul'],
              ['Aug', 5610, '31 Aug'],
              ['Sep', 6045, '30 Sep'],
              ['Oct', 6812, '23 Oct · MTD'],
            ],
          ),
        ],
      ),
      section(
        'one',
        { border: 'subtle', spacing: 'compact' },
        [
          table(
            ['Provider category', '31 Jul', '31 Aug', '30 Sep', '23 Oct', 'MoM', 'Movement'],
            [
              [['CRM'], ['74'], ['910'], ['1,104'], ['1,690'], ['+586'], [up('586')]],
              [['HRIS'], ['1,612'], ['1,655'], ['1,701'], ['1,768'], ['+67'], [up('67')]],
              [['Payroll'], ['1,170'], ['1,192'], ['1,236'], ['1,290'], ['+54'], [up('54')]],
              [['ERP'], ['402'], ['417'], ['433'], ['470'], ['+37'], [up('37')]],
              [['Identity'], ['311'], ['318'], ['326'], ['331'], ['+5'], [up('5')]],
              [['Ticketing'], ['205'], ['207'], ['190'], ['190'], ['0'], [flat]],
              [['Analytics'], ['96'], ['99'], ['104'], ['108'], ['+4'], [up('4')]],
              [['Messaging'], ['58'], ['61'], ['64'], ['66'], ['+2'], [up('2')]],
              [['Billing'], ['2'], ['2'], ['2'], ['2'], ['0'], [flat]],
              [{ content: [b('Total')], color: 'teal' }, { content: [b('4,920')], color: 'teal' }, { content: [b('5,610')], color: 'teal' }, { content: [b('6,045')], color: 'teal' }, { content: [b('6,812')], color: 'teal' }, { content: [b('+767')], color: 'teal' }, { content: [pill('+767 vs prev', 'good')], color: 'teal' }],
            ],
            { tableStyle: 'striped', headerColor: 'teal' },
          ),
          callout(
            { color: 'amber', icon: '📌', variant: 'bar' },
            p(b('Counts are rows.'), ' One account can register several connections, so rows overstate distinct accounts. Counting each account once gives 3,980 → 4,402.'),
          ),
        ],
      ),

      styled(h(2, '4. KPI tracker'), 'purple', 'bar'),
      section(
        'one',
        { border: 'subtle', spacing: 'compact', accent: 'purple' },
        [
          p(colored('Owner: Program office · tracked weekly', '#64748b')),
          table(
            ['KPI', 'Category', 'Target', 'Status', 'Remarks'],
            [
              [[b('Top KPI')], ['Customer health'], ['95%+ healthy integration score'], [pill('Dashboard in progress', 'warn')], ['Baseline moved to 05 Nov to focus on critical delivery.']],
              [[b('KPI 1')], ['Impact'], ['5 of 6 deliverables in FY26'], [pill('1/6', 'bad')], ['Workforce categories deprioritised; focus on connector SDK.']],
              [[b('KPI 2')], ['Velocity'], ['Epic lead time ≤ 36 days'], [pill('+3.1 d over', 'warn')], ['Analytics trending down after the split.']],
              [[b('KPI 3')], ['Quality'], ['< 2 sev-2 incidents / month'], [pill('On track', 'good')], ['No sev-2 incidents this period.']],
            ],
            { tableStyle: 'default', headerColor: 'purple' },
          ),
        ],
      ),

      styled(h(2, '5. Resources & FAQ'), 'blue', 'bar'),
      section(
        'oneThirdRight',
        { border: 'subtle', accent: 'blue' },
        [
          callout(
            { color: 'blue', icon: '❓', variant: 'bar', collapsible: true, defaultOpen: true },
            p(b('Why do row counts differ from account counts?')),
            p('Some providers register a connection per product line. The tracker reports rows; the note under the table explains the deduplicated figure.'),
          ),
          callout(
            { color: 'blue', icon: '❓', variant: 'bar', collapsible: true, defaultOpen: false },
            p(b('When is the next report?')),
            p('Every second Friday. Data is frozen the Wednesday before at 08:00 UTC.'),
          ),
          callout(
            { color: 'blue', icon: '❓', variant: 'bar', collapsible: true, defaultOpen: false },
            p(b('How do I request a new KPI?')),
            p('Open a request on the program board with the owner, target and data source. New KPIs start in the next reporting cycle.'),
          ),
        ],
        [
          quickLinks({ title: 'Quick links', layout: 'list', columns: 1, color: 'blue' }, [
            { label: 'Program board', url: 'https://example.com/board', icon: '🗂️', description: 'Epics and owners' },
            { label: 'Warehouse dashboards', url: 'https://example.com/dash', icon: '📊', description: 'Source for every chart' },
            { label: 'Release notes', url: 'https://example.com/releases', icon: '📝', description: 'What shipped' },
            { label: 'Tiptap documentation', url: 'https://tiptap.dev/docs', icon: '📘', description: 'The editor behind this page' },
          ]),
        ],
      ),

      styled(h(2, '6. Highlights'), 'teal', 'bar'),
      section(
        'three',
        {},
        [
          card(
            { image: artwork('#0f766e', '#0e7490', 0), href: 'https://example.com/gateway', cta: 'Read the launch post' },
            h(3, 'The gateway is live'),
            p('Internal and external traffic now run on separate, independently scaled services.'),
          ),
        ],
        [
          card(
            { image: artwork('#4338ca', '#7e22ce', 1), href: 'https://example.com/sdk', cta: 'Explore the SDK' },
            h(3, 'Connector SDK reaches UAT'),
            p('Partners can build and test connectors without waiting on the core team.'),
          ),
        ],
        [
          card(
            { image: artwork('#c2410c', '#be185d', 2), href: 'https://example.com/health', cta: 'See the plan' },
            h(3, 'Customer health, measured'),
            p('A single health score per integration, with the baseline landing in November.'),
          ),
        ],
      ),

      spacer(24),
      divider({ lineStyle: 'gradient', weight: 2, length: 60, color: 'teal' }),
      spacer(8),

      section(
        'one',
        { title: 'Appendix — how this page is built', collapsible: true, defaultCollapsed: true, border: 'subtle', background: 'neutral', backgroundVariant: 'tint' },
        [
          p(
            'Every region above is a ',
            b('section'),
            ' with its own layout, background and border. Headings fold their content (hover a heading and use the chevron), FAQ callouts fold their answers, and this appendix is a collapsible section that starts closed.',
          ),
          p('Switch to ', b('Edit'), ' to change any of it: type ', text('/', 'code'), ' for the block catalog, select a block to open its property pane, or drag the handle on the left to reorder.'),
        ],
      ),
      p(),
    ],
  }
}
