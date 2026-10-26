import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { useEditorState } from '@tiptap/react'
import { ArrowDown, ArrowUp, ChevronRight, Copy, ImagePlus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { BlockVariant } from '../extensions/blockStyle'
import { LAYOUTS, type SectionLayout } from '../extensions/section'
import type { ChartDatum, KpiItem, PageProperty, QuickLink } from '../extensions/webparts'
import { pickImageFile } from '../lib/dom'
import { selectionContext, setNodeAttrs } from '../lib/nodeAttrs'
import { TONES, type Tone } from '../lib/palette'
import type { TextStats } from '../lib/textStats'
import { CALLOUT_ICONS } from '../nodeviews/CalloutView'
import { LayoutGlyph } from '../nodeviews/SectionView'
import { Field, PaneSection, Segmented, Slider, Swatches, TextInput, Toggle } from '../ui/controls'
import { ItemsEditor } from './ItemsEditor'

const LABELS: Record<string, string> = {
  supersetChart: 'Chart',
  pageBreak: 'Page break',
  statusPill: 'Status pill',
  horizontalRule: 'Divider',
  spacer: 'Spacer',
  image: 'Image',
  kpiGrid: 'KPI tiles',
  chart: 'Bar chart',
  quickLinks: 'Quick links',
  pageProperties: 'Page properties',
  callout: 'Callout',
  card: 'Editorial card',
  banner: 'Banner',
  table: 'Table',
  section: 'Section',
  heading: 'Heading',
  paragraph: 'Text',
  blockquote: 'Quote',
}
const TEXT_TYPES = new Set(['heading', 'paragraph', 'blockquote'])

type Target = { type: string; pos: number; node: PMNode }

function useTargets(editor: Editor): Target[] {
  return useEditorState({
    editor,
    selector: ({ editor: e }) =>
      selectionContext(e.state)
        .ancestors.filter(a => a.node.type.name in LABELS)
        .map(a => ({ type: a.node.type.name, pos: a.pos, node: a.node })),
    equalityFn: (a, b) => !!a && !!b && a.length === b.length && a.every((t, i) => t.node === b[i].node && t.pos === b[i].pos),
  })
}

/** Right-hand property pane: settings for the selected block, with a breadcrumb to edit its containers. */
export function PropertyPane({ editor, stats, onClose }: { editor: Editor; stats: TextStats; onClose: () => void }) {
  const targets = useTargets(editor)
  const fallback = targets.find(t => !TEXT_TYPES.has(t.type)) ?? targets[0] ?? null
  const [pinned, setPinned] = useState<string | null>(null)
  const fallbackKey = fallback ? `${fallback.type}@${fallback.pos}` : 'page'
  useEffect(() => setPinned(null), [fallbackKey])

  const target = pinned === 'page' ? null : (pinned && targets.find(t => t.type === pinned)) || fallback
  const crumbs = [...targets].reverse()

  return (
    <aside className="pane" aria-label="Properties">
      <header className="pane__header">
        <div>
          <div className="pane__eyebrow">Properties</div>
          <h2>{target ? LABELS[target.type] : 'Page'}</h2>
        </div>
        <button type="button" className="icon-btn" title="Close properties" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <nav className="pane__crumbs" aria-label="Selection path">
        <button type="button" data-active={!target || undefined} onClick={() => setPinned('page')}>
          Page
        </button>
        {crumbs.map(crumb => (
          <span key={`${crumb.type}@${crumb.pos}`} className="pane__crumb">
            <ChevronRight size={12} />
            <button type="button" data-active={target?.pos === crumb.pos && target.type === crumb.type ? true : undefined} onClick={() => setPinned(crumb.type)}>
              {LABELS[crumb.type]}
            </button>
          </span>
        ))}
      </nav>
      <div className="pane__body">{target ? <TargetPane key={`${target.type}`} editor={editor} target={target} /> : <PagePane editor={editor} stats={stats} />}</div>
    </aside>
  )
}

function TargetPane({ editor, target }: { editor: Editor; target: Target }) {
  const set = (patch: Record<string, unknown>) => setNodeAttrs(editor, target.pos, patch)
  const a = target.node.attrs
  switch (target.type) {
    case 'section':
      return <SectionPane editor={editor} target={target} set={set} />
    case 'horizontalRule':
      return (
        <>
          <PaneSection title="Line">
            <Field label="Style">
              <Segmented
                value={a.lineStyle}
                onChange={lineStyle => set({ lineStyle })}
                options={['solid', 'dashed', 'dotted', 'double', 'gradient'].map(v => ({ value: v, label: <span className={`divider-sample divider-sample--${v}`} />, title: v }))}
              />
            </Field>
            <Field label="Weight">
              <Slider label="Weight" value={a.weight} min={1} max={8} unit="px" onChange={weight => set({ weight })} />
            </Field>
            <Field label="Length">
              <Slider label="Length" value={a.length} min={10} max={100} step={5} unit="%" onChange={length => set({ length })} />
            </Field>
            <Field label="Alignment">
              <Segmented value={a.align} onChange={align => set({ align })} options={['left', 'center', 'right'].map(v => ({ value: v, label: cap(v) }))} />
            </Field>
            <Field label="Color">
              <Swatches value={a.color} noneLabel="Default" onChange={color => set({ color })} />
            </Field>
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'supersetChart':
      return (
        <>
          <PaneSection title="Chart">
            <Field label="Saved chart" hint={`Chart #${a.chartId}`}>
              <div className="btn-row">
                <a className="btn" href={`/explore/?slice_id=${a.chartId}`} target="_blank" rel="noopener noreferrer">
                  Open in Explore
                </a>
                <button type="button" className="btn btn--ghost" onClick={() => window.dispatchEvent(new CustomEvent('pg:open-chart-picker'))}>
                  Browse charts
                </button>
              </div>
            </Field>
            <Toggle checked={a.showTitle} onChange={showTitle => set({ showTitle })} label="Show title" />
            <Field label="Caption">
              <TextInput value={a.caption} onChange={caption => set({ caption })} placeholder="Source, notes…" label="Caption" />
            </Field>
            <Field label="Height" hint="You can also drag the handle under the chart.">
              <Slider label="Height" value={a.height} min={160} max={1200} step={20} unit="px" onChange={height => set({ height })} />
            </Field>
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'pageBreak':
      return (
        <>
          <PaneSection title="Page break">
            <p className="pane__note">Content after this block starts on a new page in Portrait, on a new slide in Landscape, and in the PDF, Word and PowerPoint downloads.</p>
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'spacer':
      return (
        <>
          <PaneSection title="Spacing">
            <Field label="Height" hint="You can also drag the handle at the bottom of the spacer.">
              <Slider label="Height" value={a.height} min={8} max={480} step={4} unit="px" onChange={height => set({ height })} />
            </Field>
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'image':
      return (
        <>
          <PaneSection title="Image">
            <img className="pane__preview" src={a.src} alt="" />
            <button type="button" className="btn" onClick={async () => { const src = await pickImageFile(); if (src) set({ src }) }}>
              <ImagePlus size={14} /> Replace image
            </button>
            <Field label="Alternative text" hint="Describe the image for screen readers.">
              <TextInput value={a.alt ?? ''} onChange={alt => set({ alt })} label="Alternative text" />
            </Field>
            <Field label="Tooltip">
              <TextInput value={a.title ?? ''} onChange={title => set({ title })} label="Tooltip" />
            </Field>
            <button type="button" className="btn btn--ghost" onClick={() => set({ width: null, height: null })}>
              Reset size
            </button>
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'statusPill':
      return (
        <PaneSection title="Status">
          <Field label="Label">
            <TextInput value={a.label} onChange={label => set({ label })} label="Label" />
          </Field>
          <Field label="Tone">
            <div className="tone-grid">
              {TONES.map(tone => (
                <button key={tone.key} type="button" aria-pressed={a.tone === tone.key} onClick={() => set({ tone: tone.key })}>
                  <span className="pg-pill" data-tone={tone.key}>
                    {tone.label.split(' / ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Presets">
            <div className="tone-grid">
              {(
                [
                  ['On track', 'good'],
                  ['Done', 'good'],
                  ['In progress', 'info'],
                  ['At risk', 'warn'],
                  ['Off track', 'bad'],
                  ['Blocked', 'bad'],
                  ['No change', 'neutral'],
                ] as Array<[string, Tone]>
              ).map(([label, tone]) => (
                <button key={label} type="button" onClick={() => set({ label, tone })}>
                  <span className="pg-pill" data-tone={tone}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </Field>
        </PaneSection>
      )
    case 'kpiGrid':
      return (
        <>
          <PaneSection title="Layout">
            <Field label="Tiles per row">
              <Segmented value={a.columns} onChange={columns => set({ columns })} options={[0, 2, 3, 4, 5, 6, 7].map(v => ({ value: v, label: v === 0 ? 'Auto' : String(v) }))} />
            </Field>
          </PaneSection>
          <PaneSection title="Tiles">
            <ItemsEditor<KpiItem>
              items={a.items}
              onChange={items => set({ items })}
              title={(item, i) => item.label || `Tile ${i + 1}`}
              addLabel="Add tile"
              create={() => ({ label: 'New KPI', value: '0', unit: '', status: '', tone: 'neutral', delta: '', deltaTone: 'neutral', progress: null, target: '', note: '' })}
              fields={[
                { key: 'label', label: 'Label' },
                { key: 'value', label: 'Value', half: true },
                { key: 'unit', label: 'Unit', half: true, placeholder: 'days, %, / 6' },
                { key: 'status', label: 'Status', half: true, placeholder: 'On track' },
                { key: 'tone', label: 'Status tone', type: 'tone', half: true },
                { key: 'delta', label: 'Change', half: true, placeholder: '+12 MoM' },
                { key: 'deltaTone', label: 'Change tone', type: 'tone', half: true },
                { key: 'progress', label: 'Progress %', type: 'percent', half: true, placeholder: 'none' },
                { key: 'target', label: 'Target', half: true, placeholder: 'Target ≤ 36' },
                { key: 'note', label: 'Footnote' },
              ]}
            />
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'chart':
      return (
        <>
          <PaneSection title="Chart">
            <Field label="Title">
              <TextInput value={a.title} onChange={title => set({ title })} label="Title" />
            </Field>
            <Field label="Caption">
              <TextInput value={a.caption} onChange={caption => set({ caption })} label="Caption" />
            </Field>
            <Field label="Orientation">
              <Segmented value={a.kind} onChange={kind => set({ kind })} options={[{ value: 'column', label: 'Columns' }, { value: 'bar', label: 'Bars' }]} />
            </Field>
            <Field label="Number format">
              <Segmented value={a.format} onChange={format => set({ format })} options={[{ value: 'number', label: '1,234' }, { value: 'percent', label: '12%' }, { value: 'compact', label: '1.2K' }]} />
            </Field>
            <Field label="Decimals">
              <Slider label="Decimals" value={a.decimals} min={0} max={3} onChange={decimals => set({ decimals })} />
            </Field>
            <div className="field-row">
              <Field label="Axis min">
                <input className="input" type="number" step="any" placeholder="0" value={a.axisMin ?? ''} onChange={e => set({ axisMin: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Axis max">
                <input className="input" type="number" step="any" placeholder="auto" value={a.axisMax ?? ''} onChange={e => set({ axisMax: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Highlight">
              <Segmented value={a.highlight} onChange={highlight => set({ highlight })} options={[{ value: 'none', label: 'None' }, { value: 'last', label: 'Latest' }, { value: 'max', label: 'Highest' }]} />
            </Field>
            <Field label="Color">
              <Swatches value={a.color} allowNone={false} onChange={color => set({ color })} />
            </Field>
          </PaneSection>
          <PaneSection title="Data">
            <ItemsEditor<ChartDatum>
              items={a.data}
              onChange={data => set({ data })}
              title={(d, i) => `${d.label || `Point ${i + 1}`} · ${d.value}`}
              addLabel="Add data point"
              create={() => ({ label: 'New', sublabel: '', value: 0 })}
              fields={[
                { key: 'label', label: 'Label', half: true },
                { key: 'value', label: 'Value', type: 'number', half: true },
                { key: 'sublabel', label: 'Sub-label', placeholder: 'e.g. 31 Jul' },
              ]}
            />
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'quickLinks':
      return (
        <>
          <PaneSection title="Layout">
            <Field label="Title">
              <TextInput value={a.title} onChange={title => set({ title })} label="Title" placeholder="Quick links" />
            </Field>
            <Field label="Style">
              <Segmented
                value={a.layout}
                onChange={layout => set({ layout })}
                options={[{ value: 'tiles', label: 'Tiles' }, { value: 'list', label: 'List' }, { value: 'buttons', label: 'Buttons' }, { value: 'compact', label: 'Compact' }]}
              />
            </Field>
            <Field label="Columns">
              <Slider label="Columns" value={a.columns} min={1} max={4} onChange={columns => set({ columns })} />
            </Field>
            <Field label="Color">
              <Swatches value={a.color} allowNone={false} onChange={color => set({ color })} />
            </Field>
          </PaneSection>
          <PaneSection title="Links">
            <ItemsEditor<QuickLink>
              items={a.items}
              onChange={items => set({ items })}
              title={(item, i) => item.label || `Link ${i + 1}`}
              addLabel="Add link"
              create={() => ({ label: 'New link', url: 'https://', icon: '🔗', description: '' })}
              fields={[
                { key: 'label', label: 'Label' },
                { key: 'url', label: 'URL', type: 'url' },
                { key: 'icon', label: 'Icon (emoji)', half: true },
                { key: 'description', label: 'Description', half: true },
              ]}
            />
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'pageProperties':
      return (
        <>
          <PaneSection title="Appearance">
            <Field label="Label color">
              <Swatches value={a.color} noneLabel="Inherit" onChange={color => set({ color })} />
            </Field>
          </PaneSection>
          <PaneSection title="Properties">
            <ItemsEditor<PageProperty>
              items={a.items}
              onChange={items => set({ items })}
              title={(item, i) => item.label || `Property ${i + 1}`}
              addLabel="Add property"
              create={() => ({ label: 'Property', value: '' })}
              fields={[
                { key: 'label', label: 'Label', half: true },
                { key: 'value', label: 'Value', half: true },
              ]}
            />
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'callout':
      return (
        <>
          <PaneSection title="Appearance">
            <Field label="Style">
              <Segmented
                value={a.variant}
                onChange={variant => set({ variant })}
                options={[{ value: 'tint', label: 'Tint' }, { value: 'bar', label: 'Accent bar' }, { value: 'outline', label: 'Outline' }, { value: 'solid', label: 'Solid' }]}
              />
            </Field>
            <Field label="Color">
              <Swatches value={a.color} allowNone={false} onChange={color => set({ color })} />
            </Field>
            <Field label="Icon">
              <div className="icon-grid">
                {CALLOUT_ICONS.map(icon => (
                  <button key={icon || 'none'} type="button" aria-pressed={a.icon === icon} title={icon || 'No icon'} onClick={() => set({ icon })}>
                    {icon || '∅'}
                  </button>
                ))}
              </div>
            </Field>
          </PaneSection>
          <PaneSection title="FAQ behaviour">
            <Toggle checked={a.collapsible} onChange={collapsible => set({ collapsible })} label="Collapsible (FAQ)" hint="The first block stays visible as the question." />
            {a.collapsible && <Toggle checked={a.defaultOpen} onChange={defaultOpen => set({ defaultOpen })} label="Expanded by default" />}
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'card':
      return (
        <>
          <PaneSection title="Image">
            {a.image && <img className="pane__preview" src={a.image} alt="" />}
            <div className="btn-row">
              <button type="button" className="btn" onClick={async () => { const image = await pickImageFile(); if (image) set({ image }) }}>
                <ImagePlus size={14} /> {a.image ? 'Replace' : 'Upload'}
              </button>
              {a.image && (
                <button type="button" className="btn btn--ghost" onClick={() => set({ image: null })}>
                  Remove
                </button>
              )}
            </div>
            <Field label="Image URL">
              <TextInput type="url" value={a.image?.startsWith('data:') ? '' : (a.image ?? '')} placeholder={a.image?.startsWith('data:') ? 'Uploaded image' : 'https://…'} onChange={image => set({ image: image || null })} label="Image URL" />
            </Field>
            <Field label="Alternative text">
              <TextInput value={a.alt} onChange={alt => set({ alt })} label="Alternative text" />
            </Field>
            <Field label="Aspect ratio">
              <Segmented value={a.aspect} onChange={aspect => set({ aspect })} options={['16/9', '4/3', '1/1', '21/9'].map(v => ({ value: v, label: v.replace('/', ':') }))} />
            </Field>
          </PaneSection>
          <PaneSection title="Card">
            <Field label="Layout">
              <Segmented value={a.layout} onChange={layout => set({ layout })} options={[{ value: 'stacked', label: 'Image on top' }, { value: 'side', label: 'Image beside' }]} />
            </Field>
            <Field label="Style">
              <Segmented value={a.variant} onChange={variant => set({ variant })} options={[{ value: 'elevated', label: 'Elevated' }, { value: 'outline', label: 'Outline' }, { value: 'tint', label: 'Tint' }]} />
            </Field>
            <Field label="Accent">
              <Swatches value={a.color} allowNone={false} onChange={color => set({ color })} />
            </Field>
            <Field label="Link URL">
              <TextInput type="url" value={a.href} onChange={href => set({ href })} placeholder="https://…" label="Link URL" />
            </Field>
            <Field label="Link text">
              <TextInput value={a.cta} onChange={cta => set({ cta })} label="Link text" />
            </Field>
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'banner':
      return (
        <>
          <PaneSection title="Background">
            <Field label="Fill">
              <Segmented value={a.fill} onChange={fill => set({ fill })} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Solid' }]} />
            </Field>
            <Field label="Color">
              <Swatches value={a.color} allowNone={false} onChange={color => set({ color })} />
            </Field>
            <Field label="Background image">
              <div className="btn-row">
                <button type="button" className="btn" onClick={async () => { const image = await pickImageFile(); if (image) set({ image }) }}>
                  <ImagePlus size={14} /> {a.image ? 'Replace' : 'Upload'}
                </button>
                {a.image && (
                  <button type="button" className="btn btn--ghost" onClick={() => set({ image: '' })}>
                    Remove
                  </button>
                )}
              </div>
            </Field>
            <Field label="Image overlay">
              <Slider label="Overlay" value={a.overlay} min={0} max={90} step={5} unit="%" onChange={overlay => set({ overlay })} />
            </Field>
          </PaneSection>
          <PaneSection title="Layout">
            <Field label="Height">
              <Segmented value={a.size} onChange={size => set({ size })} options={[{ value: 'sm', label: 'Compact' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Tall' }]} />
            </Field>
            <Field label="Text alignment">
              <Segmented value={a.align} onChange={align => set({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }]} />
            </Field>
            <Toggle checked={a.fullBleed} onChange={fullBleed => set({ fullBleed })} label="Full width" hint="Extend edge to edge when placed on the page (outside a section)." />
          </PaneSection>
          <NodeActions editor={editor} target={target} />
        </>
      )
    case 'table':
      return <TablePane editor={editor} target={target} set={set} />
    default:
      return <TextBlockPane editor={editor} target={target} set={set} />
  }
}

function SectionPane({ editor, target, set }: { editor: Editor; target: Target; set: (p: Record<string, unknown>) => void }) {
  const a = target.node.attrs
  return (
    <>
      <PaneSection title="Layout">
        <div className="layout-picker" role="radiogroup" aria-label="Section layout">
          {(Object.keys(LAYOUTS) as SectionLayout[]).map(layout => (
            <button
              key={layout}
              type="button"
              role="radio"
              aria-checked={a.layout === layout}
              title={LAYOUTS[layout].label}
              onClick={() => editor.commands.setSectionLayout(target.pos, layout)}
            >
              <LayoutGlyph layout={layout} />
              <span>{LAYOUTS[layout].label}</span>
            </button>
          ))}
        </div>
      </PaneSection>
      <PaneSection title="Header">
        <Field label="Section title" hint="A title adds a header bar; leave empty for none.">
          <TextInput value={a.title} onChange={title => set({ title })} placeholder="e.g. 1. Delivery summary" label="Section title" />
        </Field>
        <Field label="Header style">
          <Segmented value={a.headerStyle} onChange={headerStyle => set({ headerStyle })} options={[{ value: 'bar', label: 'Accent bar' }, { value: 'solid', label: 'Solid' }, { value: 'plain', label: 'Plain' }]} />
        </Field>
        <Toggle checked={a.collapsible} onChange={collapsible => set({ collapsible })} label="Collapsible section" hint="Readers can fold the section away." />
        {a.collapsible && <Toggle checked={a.defaultCollapsed} onChange={defaultCollapsed => set({ defaultCollapsed })} label="Collapsed by default" />}
      </PaneSection>
      <PaneSection title="Background">
        <Swatches value={a.background} noneLabel="No background" onChange={background => set({ background })} />
        <Segmented
          label="Intensity"
          value={a.backgroundVariant}
          onChange={backgroundVariant => set({ backgroundVariant, background: a.background ?? 'neutral' })}
          options={[{ value: 'tint', label: 'Soft' }, { value: 'solid', label: 'Strong' }]}
        />
      </PaneSection>
      <PaneSection title="Frame">
        <Field label="Accent color" hint="Used by the header and the accent border.">
          <Swatches value={a.accent} allowNone={false} onChange={accent => set({ accent })} />
        </Field>
        <Field label="Border">
          <Segmented value={a.border} onChange={border => set({ border })} options={[{ value: 'none', label: 'None' }, { value: 'subtle', label: 'Subtle' }, { value: 'accent', label: 'Accent' }]} />
        </Field>
        <Field label="Padding">
          <Segmented value={a.spacing} onChange={spacing => set({ spacing })} options={[{ value: 'compact', label: 'Compact' }, { value: 'normal', label: 'Normal' }, { value: 'relaxed', label: 'Relaxed' }]} />
        </Field>
      </PaneSection>
      <NodeActions editor={editor} target={target} movable />
    </>
  )
}

const CELL_ACTIONS: Array<[string, (e: Editor) => boolean]> = [
  ['Row above', e => e.chain().focus().addRowBefore().run()],
  ['Row below', e => e.chain().focus().addRowAfter().run()],
  ['Column left', e => e.chain().focus().addColumnBefore().run()],
  ['Column right', e => e.chain().focus().addColumnAfter().run()],
  ['Delete row', e => e.chain().focus().deleteRow().run()],
  ['Delete column', e => e.chain().focus().deleteColumn().run()],
  ['Merge / split', e => e.chain().focus().mergeOrSplit().run()],
  ['Header row', e => e.chain().focus().toggleHeaderRow().run()],
  ['Header column', e => e.chain().focus().toggleHeaderColumn().run()],
]

function TablePane({ editor, target, set }: { editor: Editor; target: Target; set: (p: Record<string, unknown>) => void }) {
  const a = target.node.attrs
  const cellColor = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.getAttributes('tableCell').cellColor ?? e.getAttributes('tableHeader').cellColor ?? null) as string | null,
  })
  return (
    <>
      <PaneSection title="Table style">
        <Segmented
          value={a.tableStyle}
          onChange={tableStyle => set({ tableStyle })}
          options={[{ value: 'default', label: 'Default' }, { value: 'striped', label: 'Striped' }, { value: 'minimal', label: 'Minimal' }, { value: 'bordered', label: 'Grid' }]}
        />
        <Field label="Header color">
          <Swatches value={a.headerColor} noneLabel="Plain header" onChange={headerColor => set({ headerColor })} />
        </Field>
      </PaneSection>
      <PaneSection title="Selected cells">
        <Field label="Cell color" hint="Applies to the cell under the cursor or every selected cell.">
          <Swatches value={cellColor} onChange={color => editor.chain().focus().setCellAttribute('cellColor', color).run()} />
        </Field>
        <div className="action-grid">
          {CELL_ACTIONS.map(([label, run]) => (
            <button key={label} type="button" className="btn" onMouseDown={event => event.preventDefault()} onClick={() => run(editor)}>
              {label}
            </button>
          ))}
        </div>
      </PaneSection>
      <div className="pane-actions">
        <button type="button" className="btn btn--danger" onClick={() => editor.chain().focus().deleteTable().run()}>
          <Trash2 size={14} /> Delete table
        </button>
      </div>
    </>
  )
}

function TextBlockPane({ editor, target, set }: { editor: Editor; target: Target; set: (p: Record<string, unknown>) => void }) {
  const a = target.node.attrs
  return (
    <>
      <PaneSection title="Block color">
        <Swatches value={a.blockColor} noneLabel="No color" onChange={blockColor => set({ blockColor })} />
        <Segmented<BlockVariant>
          label="Treatment"
          value={a.blockVariant}
          onChange={blockVariant => set({ blockVariant, blockColor: a.blockColor ?? 'teal' })}
          options={[{ value: 'tint', label: 'Tint' }, { value: 'solid', label: 'Solid' }, { value: 'bar', label: 'Accent bar' }]}
        />
      </PaneSection>
      {target.type === 'heading' && (
        <PaneSection title="Heading">
          <Field label="Level">
            <Segmented value={a.level} onChange={level => set({ level })} options={[1, 2, 3, 4].map(level => ({ value: level, label: `H${level}` }))} />
          </Field>
          <p className="pane__note">Headings appear in the outline. Hover a heading and click its chevron to fold everything up to the next heading of the same level.</p>
        </PaneSection>
      )}
      <p className="pane__note">Formatting for the text itself lives in the toolbar.</p>
      {editor.isActive('table') && <p className="pane__note">Use the breadcrumb above to open table settings.</p>}
    </>
  )
}

function PagePane({ editor, stats }: { editor: Editor; stats: TextStats }) {
  const width = useEditorState({ editor, selector: ({ editor: e }) => (e.state.doc.attrs.pageWidth as string) ?? 'standard' })
  const setWidth = (value: string) =>
    editor
      .chain()
      .command(({ tr }) => {
        tr.setDocAttribute('pageWidth', value)
        return true
      })
      .run()
  const rows = useMemo(
    () => [
      ['Words', stats.words.toLocaleString()],
      ['Characters', stats.characters.toLocaleString()],
      ['Reading time', `${stats.readingMinutes} min`],
      ['Headings', String(stats.headings)],
      ['Images', String(stats.images)],
      ['Data web parts', String(stats.webParts)],
    ],
    [stats],
  )
  return (
    <>
      <PaneSection title="Page">
        <Field label="Page width">
          <Segmented value={width} onChange={setWidth} options={[{ value: 'standard', label: 'Standard' }, { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full' }]} />
        </Field>
      </PaneSection>
      <PaneSection title="Statistics">
        <dl className="stat-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </PaneSection>
      <PaneSection title="Tips">
        <ul className="tips">
          <li>
            Type <kbd>/</kbd> anywhere to insert sections, web parts and data blocks.
          </li>
          <li>Click a web part (KPI tiles, chart, divider…) to edit it here.</li>
          <li>Hover a section for its toolbar; use the + under it to add another.</li>
          <li>Drag the ⋮⋮ handle to move blocks, including between columns.</li>
        </ul>
      </PaneSection>
    </>
  )
}

function NodeActions({ editor, target, movable }: { editor: Editor; target: Target; movable?: boolean }) {
  return (
    <div className="pane-actions">
      {movable && (
        <>
          <button type="button" className="btn" onClick={() => editor.commands.moveTopLevelNode(target.pos, -1)}>
            <ArrowUp size={14} /> Up
          </button>
          <button type="button" className="btn" onClick={() => editor.commands.moveTopLevelNode(target.pos, 1)}>
            <ArrowDown size={14} /> Down
          </button>
        </>
      )}
      <button type="button" className="btn" onClick={() => editor.commands.duplicateNodeAt(target.pos)}>
        <Copy size={14} /> Duplicate
      </button>
      <button type="button" className="btn btn--danger" onClick={() => editor.chain().focus().deleteNodeAt(target.pos).run()}>
        <Trash2 size={14} /> Delete
      </button>
    </div>
  )
}

const cap = (value: string) => value[0].toUpperCase() + value.slice(1)
