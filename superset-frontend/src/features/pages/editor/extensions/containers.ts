import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { collapseAwareUpdate } from '../lib/dom'
import { colorAttrs, mergeStyles, normalizeColor } from '../lib/palette'
import { CalloutView } from '../nodeviews/CalloutView'
import { CardView } from '../nodeviews/CardView'

/**
 * Containers that wrap ordinary blocks: callouts (and their collapsible FAQ
 * variant), editorial cards and banners. They share the color system and
 * accept any blocks, so authors type into them like normal page content.
 */

const str = (name: string, fallback: string) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
  renderHTML: () => ({}),
})
const bool = (name: string, fallback: boolean) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => (el.hasAttribute(`data-${name}`) ? el.getAttribute(`data-${name}`) === 'true' : fallback),
  renderHTML: () => ({}),
})
const color = (name: string, fallback: string | null) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => (el.hasAttribute(`data-${name}`) ? normalizeColor(el.getAttribute(`data-${name}`)) : fallback),
  renderHTML: () => ({}),
})

export type CalloutAttrs = {
  color: string | null
  icon: string
  variant: 'tint' | 'bar' | 'outline' | 'solid'
  collapsible: boolean
  defaultOpen: boolean
}

export function calloutDomAttrs(attrs: CalloutAttrs) {
  const colors = colorAttrs(attrs.color)
  return {
    'data-type': 'callout',
    class: 'pg-callout',
    'data-variant': attrs.variant,
    'data-color-value': attrs.color ?? undefined,
    'data-color': colors['data-color'],
    'data-icon': attrs.icon,
    'data-collapsible': String(attrs.collapsible),
    'data-default-open': String(attrs.defaultOpen),
    style: colors.style,
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      color: color('color-value', 'teal'),
      icon: str('icon', '💡'),
      variant: str('variant', 'tint'),
      collapsible: bool('collapsible', false),
      defaultOpen: bool('default-open', true),
    }
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]', contentElement: '.pg-callout__body' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as CalloutAttrs
    return [
      'aside',
      mergeAttributes(HTMLAttributes, calloutDomAttrs(attrs)),
      ...(attrs.icon ? [['span', { class: 'pg-callout__icon', 'aria-hidden': 'true' }, attrs.icon]] : []),
      ['div', { class: 'pg-callout__body' }, 0],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView, { className: 'pg-callout-view', ...collapseAwareUpdate })
  },
})

export type CardAttrs = {
  image: string | null
  alt: string
  aspect: '16/9' | '4/3' | '1/1' | '21/9'
  color: string | null
  variant: 'elevated' | 'outline' | 'tint'
  layout: 'stacked' | 'side'
  href: string
  cta: string
}

export function cardDomAttrs(attrs: CardAttrs) {
  const colors = colorAttrs(attrs.color)
  return {
    'data-type': 'card',
    class: 'pg-card',
    'data-variant': attrs.variant,
    'data-layout': attrs.layout,
    'data-aspect': attrs.aspect,
    'data-color-value': attrs.color ?? undefined,
    'data-color': colors['data-color'],
    'data-href': attrs.href || undefined,
    'data-cta': attrs.cta || undefined,
    style: mergeStyles(`--aspect: ${attrs.aspect};`, colors.style),
  }
}

export const Card = Node.create({
  name: 'card',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      image: {
        default: null,
        parseHTML: el => el.querySelector('.pg-card__media img')?.getAttribute('src') ?? null,
        renderHTML: () => ({}),
      },
      alt: {
        default: '',
        parseHTML: el => el.querySelector('.pg-card__media img')?.getAttribute('alt') ?? '',
        renderHTML: () => ({}),
      },
      aspect: str('aspect', '16/9'),
      color: color('color-value', 'teal'),
      variant: str('variant', 'elevated'),
      layout: str('layout', 'stacked'),
      href: str('href', ''),
      cta: str('cta', 'Read more'),
    }
  },

  parseHTML() {
    return [{ tag: 'article[data-type="card"]', contentElement: '.pg-card__body' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as CardAttrs
    return [
      'article',
      mergeAttributes(HTMLAttributes, cardDomAttrs(attrs)),
      ['div', { class: 'pg-card__media' }, ...(attrs.image ? [['img', { src: attrs.image, alt: attrs.alt }]] : [])],
      [
        'div',
        { class: 'pg-card__main' },
        ['div', { class: 'pg-card__body' }, 0],
        ...(attrs.href
          ? [['a', { class: 'pg-card__cta', href: attrs.href, target: '_blank', rel: 'noopener noreferrer' }, `${attrs.cta || 'Read more'} →`]]
          : []),
      ],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CardView, { className: 'pg-card-view' })
  },
})

export type BannerAttrs = {
  color: string | null
  image: string | null
  overlay: number
  size: 'sm' | 'md' | 'lg'
  align: 'left' | 'center'
  fill: 'solid' | 'gradient'
  fullBleed: boolean
}

/** Banner — the cover-page background treatment, usable anywhere in the body. */
export const Banner = Node.create({
  name: 'banner',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      color: color('color-value', 'teal'),
      image: str('image', ''),
      overlay: { default: 45, parseHTML: el => Number(el.getAttribute('data-overlay') ?? 45), renderHTML: () => ({}) },
      size: str('size', 'md'),
      align: str('align', 'left'),
      fill: str('fill', 'gradient'),
      fullBleed: bool('full-bleed', true),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="banner"]', contentElement: '.pg-banner__inner' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as BannerAttrs
    const colors = colorAttrs(attrs.color)
    const image = attrs.image ? `--banner-image: url("${attrs.image.replace(/"/g, '%22')}");` : ''
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'banner',
        class: 'pg-banner',
        'data-size': attrs.size,
        'data-align': attrs.align,
        'data-fill': attrs.fill,
        'data-full-bleed': String(attrs.fullBleed),
        'data-has-image': attrs.image ? 'true' : undefined,
        'data-image': attrs.image || undefined,
        'data-overlay': attrs.overlay,
        'data-color-value': attrs.color ?? undefined,
        'data-color': colors['data-color'],
        style: mergeStyles(`--overlay: ${attrs.overlay / 100};`, image, colors.style),
      }),
      ['div', { class: 'pg-banner__inner' }, 0],
    ]
  },
})
