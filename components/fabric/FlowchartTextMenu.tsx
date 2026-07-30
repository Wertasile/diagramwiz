'use client'

import React, { useEffect, useState } from 'react'
import { Canvas, Textbox } from 'fabric'
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import {
  getFlowchartAnchorScreenRect,
  type FlowchartNode,
} from '@/components/fabric-helper/flowchart-node'
import { Button } from '@/components/ui/button'
import styles from './flowchart-text-menu.module.css'

type FlowchartTextMenuProps = {
  canvas: Canvas
  group: FlowchartNode
  textbox: Textbox
  visible: boolean
}

type TextStyleState = {
  fontSize: number
  fill: string
  fontWeight: string | number
  fontStyle: string
  textAlign: string
}

const readStyle = (textbox: Textbox): TextStyleState => ({
  fontSize: textbox.fontSize ?? 16,
  fill: typeof textbox.fill === 'string' ? textbox.fill : '#000000',
  fontWeight: textbox.fontWeight ?? 'normal',
  fontStyle: textbox.fontStyle ?? 'normal',
  textAlign: textbox.textAlign ?? 'center',
})

function FlowchartTextMenu({ canvas, group, textbox, visible }: FlowchartTextMenuProps) {
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [style, setStyle] = useState<TextStyleState>(() => readStyle(textbox))

  const updatePosition = () => {
    const anchor = getFlowchartAnchorScreenRect(canvas, group)
    setPosition({
      left: anchor.centerX,
      top: anchor.top - 12,
    })
  }

  useEffect(() => {
    if (!visible) return

    setStyle(readStyle(textbox))
    updatePosition()

    const refresh = () => {
      setStyle(readStyle(textbox))
      updatePosition()
    }

    canvas.on('after:render', updatePosition)
    textbox.on('changed', refresh)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      canvas.off('after:render', updatePosition)
      textbox.off('changed', refresh)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [canvas, group, textbox, visible])

  if (!visible) return null

  const apply = (patch: Partial<TextStyleState>) => {
    textbox.set(patch)
    textbox.setCoords()
    canvas.requestRenderAll()
    setStyle(readStyle(textbox))
  }

  const isBold = style.fontWeight === 'bold' || style.fontWeight === 700
  const isItalic = style.fontStyle === 'italic'

  return (
    <div
      className={styles.menu}
      style={{
        left: position.left,
        top: position.top,
      }}
      onMouseDown={(e) => {
        e.preventDefault()
      }}
    >
      <div className={styles.field}>
        <span>Size</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Decrease font size"
          onClick={() => apply({ fontSize: Math.max(8, Math.round(style.fontSize) - 1) })}
        >
          −
        </Button>
        <span className={styles.sizeValue}>{Math.round(style.fontSize)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Increase font size"
          onClick={() => apply({ fontSize: Math.min(96, Math.round(style.fontSize) + 1) })}
        >
          +
        </Button>
      </div>

      <label className={styles.field}>
        <span>Color</span>
        <input
          type="color"
          className={styles.colorInput}
          value={style.fill}
          onChange={(e) => apply({ fill: e.target.value })}
        />
      </label>

      <div className={styles.divider} />

      <Button
        type="button"
        variant={isBold ? 'secondary' : 'ghost'}
        size="icon-xs"
        title="Bold"
        onClick={() => apply({ fontWeight: isBold ? 'normal' : 'bold' })}
      >
        <Bold />
      </Button>

      <Button
        type="button"
        variant={isItalic ? 'secondary' : 'ghost'}
        size="icon-xs"
        title="Italic"
        onClick={() => apply({ fontStyle: isItalic ? 'normal' : 'italic' })}
      >
        <Italic />
      </Button>

      <div className={styles.divider} />

      <Button
        type="button"
        variant={style.textAlign === 'left' ? 'secondary' : 'ghost'}
        size="icon-xs"
        title="Align left"
        onClick={() => apply({ textAlign: 'left' })}
      >
        <AlignLeft />
      </Button>
      <Button
        type="button"
        variant={style.textAlign === 'center' ? 'secondary' : 'ghost'}
        size="icon-xs"
        title="Align center"
        onClick={() => apply({ textAlign: 'center' })}
      >
        <AlignCenter />
      </Button>
      <Button
        type="button"
        variant={style.textAlign === 'right' ? 'secondary' : 'ghost'}
        size="icon-xs"
        title="Align right"
        onClick={() => apply({ textAlign: 'right' })}
      >
        <AlignRight />
      </Button>
    </div>
  )
}

export default FlowchartTextMenu
