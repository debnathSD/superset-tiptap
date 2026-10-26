import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { ImagePlus } from 'lucide-react'
import { cardDomAttrs, type CardAttrs } from '../extensions/containers'
import { pickImageFile, toReactProps } from '../lib/dom'
import { useEditable } from '../lib/mode'

/** Editorial card: image + any blocks (heading/paragraph by default) + optional call to action. */
export function CardView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const attrs = node.attrs as CardAttrs
  const editable = useEditable()

  const chooseImage = async () => {
    const src = await pickImageFile()
    if (src) updateAttributes({ image: src })
  }

  return (
    <NodeViewWrapper as="article" {...toReactProps(cardDomAttrs(attrs))} data-selected={selected ? 'true' : undefined}>
      <div className="pg-card__media" contentEditable={false}>
        {attrs.image ? (
          <img src={attrs.image} alt={attrs.alt} draggable={false} />
        ) : (
          editable && (
            <button type="button" className="pg-card__placeholder" onClick={chooseImage}>
              <ImagePlus size={22} />
              Add image
            </button>
          )
        )}
        {editable && attrs.image && (
          <button type="button" className="pg-card__change" onClick={chooseImage}>
            Change image
          </button>
        )}
      </div>
      <div className="pg-card__main">
        <NodeViewContent className="pg-card__body" />
        {attrs.href && (
          <a
            className="pg-card__cta"
            href={attrs.href}
            target="_blank"
            rel="noopener noreferrer"
            contentEditable={false}
            onClick={event => editable && event.preventDefault()}
          >
            {attrs.cta || 'Read more'} →
          </a>
        )}
      </div>
    </NodeViewWrapper>
  )
}
