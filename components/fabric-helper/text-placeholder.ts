import { Textbox } from 'fabric'

export type PlaceholderTextbox = Textbox & {
  placeholderText?: string
  isPlaceholder?: boolean
  placeholderFill?: string
  contentFill?: string
}

/**
 * Treat the current text as a placeholder. On edit it clears;
 * if the user exits with empty text, the placeholder returns.
 */
/** Re-bind edit handlers after JSON import (properties already on the object). */
export function bindPlaceholderHandlers(textbox: Textbox) {
  const target = textbox as PlaceholderTextbox
  if (!target.placeholderText) return

  textbox.off('editing:entered')
  textbox.off('editing:exited')

  textbox.on('editing:entered', () => {
    clearPlaceholderOnEdit(target)
  })

  textbox.on('editing:exited', () => {
    restorePlaceholderIfEmpty(target)
  })
}

export function withPlaceholder(
  textbox: Textbox,
  placeholder: string,
  options: { placeholderFill?: string; contentFill?: string } = {}
): Textbox {
  const target = textbox as PlaceholderTextbox
  const contentFill =
    options.contentFill ??
    (typeof textbox.fill === 'string' ? textbox.fill : '#000000')
  const placeholderFill = options.placeholderFill ?? 'rgba(107, 114, 128, 0.85)'

  target.placeholderText = placeholder
  target.isPlaceholder = true
  target.contentFill = contentFill
  target.placeholderFill = placeholderFill

  textbox.set({
    text: placeholder,
    fill: placeholderFill,
  })

  bindPlaceholderHandlers(textbox)

  return textbox
}

/** Clear placeholder when entering edit (dblclick / enterEditing). */
export function clearPlaceholderOnEdit(textbox: PlaceholderTextbox) {
  if (!textbox.isPlaceholder) return

  textbox.isPlaceholder = false
  textbox.set({
    text: '',
    fill: textbox.contentFill ?? '#000000',
  })

  if (textbox.hiddenTextarea) {
    textbox.hiddenTextarea.value = ''
  }

  textbox.canvas?.requestRenderAll()
}

/** Restore placeholder if the user left the field empty. */
export function restorePlaceholderIfEmpty(textbox: PlaceholderTextbox) {
  const text = (textbox.text ?? '').trim()
  if (text.length > 0) {
    textbox.isPlaceholder = false
    if (textbox.contentFill) {
      textbox.set('fill', textbox.contentFill)
    }
    return
  }

  textbox.isPlaceholder = true
  textbox.set({
    text: textbox.placeholderText ?? '',
    fill: textbox.placeholderFill ?? 'rgba(107, 114, 128, 0.85)',
  })
  textbox.canvas?.requestRenderAll()
}
