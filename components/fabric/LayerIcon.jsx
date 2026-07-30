import React from 'react'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinejoin: 'round',
}

function Icon({ children, viewBox = '0 0 40 32' }) {
  return (
    <svg viewBox={viewBox} aria-hidden="true" className="layerIconSvg">
      {children}
    </svg>
  )
}

const ICONS = {
  rectangle: (
    <Icon>
      <rect x="6" y="6" width="28" height="20" rx="1" {...stroke} />
    </Icon>
  ),
  circle: (
    <Icon>
      <circle cx="20" cy="16" r="11" {...stroke} />
    </Icon>
  ),
  triangle: (
    <Icon>
      <polygon points="20,4 34,28 6,28" {...stroke} />
    </Icon>
  ),
  polygon: (
    <Icon>
      <polygon points="8,8 28,4 36,18 24,28 6,22" {...stroke} />
    </Icon>
  ),
  line: (
    <Icon>
      <line x1="6" y1="26" x2="34" y2="6" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  textbox: (
    <Icon>
      <path d="M10 8h20M20 8v16M14 24h12" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  comment: (
    <Icon>
      <rect x="5" y="5" width="30" height="18" rx="3" {...stroke} />
      <path d="M14 23v5l5-5" {...stroke} strokeLinecap="round" />
      <line x1="11" y1="11" x2="29" y2="11" {...stroke} strokeLinecap="round" />
      <line x1="11" y1="16" x2="24" y2="16" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  stickyNote: (
    <Icon>
      <path d="M8 4h20v18l-6 6H8z" {...stroke} />
      <path d="M22 28v-6h6" {...stroke} strokeLinecap="round" />
      <line x1="12" y1="12" x2="24" y2="12" {...stroke} strokeLinecap="round" />
      <line x1="12" y1="17" x2="20" y2="17" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  path: (
    <Icon>
      <path d="M8 22c4-10 8-14 12-8s8 2 12-6" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  image: (
    <Icon>
      <rect x="5" y="5" width="30" height="22" rx="2" {...stroke} />
      <circle cx="13" cy="13" r="3" {...stroke} />
      <path d="M5 22l8-7 6 5 6-4 10 6" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  process: (
    <Icon>
      <rect x="4" y="8" width="32" height="16" {...stroke} />
    </Icon>
  ),
  decision: (
    <Icon>
      <polygon points="20,3 36,16 20,29 4,16" {...stroke} />
    </Icon>
  ),
  terminator: (
    <Icon>
      <rect x="4" y="9" width="32" height="14" rx="7" {...stroke} />
    </Icon>
  ),
  inputOutput: (
    <Icon>
      <polygon points="10,8 36,8 30,24 4,24" {...stroke} />
    </Icon>
  ),
  document: (
    <Icon>
      <path d="M6 4h28v18q-7 6-14 2t-14 2z" {...stroke} />
    </Icon>
  ),
  database: (
    <Icon>
      <ellipse cx="20" cy="8" rx="12" ry="4" {...stroke} />
      <path d="M8 8v14c0 2.2 5.4 4 12 4s12-1.8 12-4V8" {...stroke} />
      <path d="M8 15c0 2.2 5.4 4 12 4s12-1.8 12-4" {...stroke} />
    </Icon>
  ),
  manualInput: (
    <Icon>
      <polygon points="10,6 36,6 36,26 4,26" {...stroke} />
    </Icon>
  ),
  preparation: (
    <Icon>
      <polygon points="10,6 30,6 36,16 30,26 10,26 4,16" {...stroke} />
    </Icon>
  ),
  connector: (
    <Icon>
      <circle cx="20" cy="16" r="10" {...stroke} />
    </Icon>
  ),
  delay: (
    <Icon>
      <path d="M6 6h14a10 10 0 0 1 0 20H6z" {...stroke} />
    </Icon>
  ),
  logicalOR: (
    <Icon>
      <circle cx="20" cy="16" r="11" {...stroke} />
      <line x1="20" y1="9" x2="20" y2="23" {...stroke} strokeLinecap="round" />
      <line x1="13" y1="16" x2="27" y2="16" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  logicalAND: (
    <Icon>
      <circle cx="20" cy="16" r="11" {...stroke} />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        fontSize="12"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fill="currentColor"
      >
        &amp;
      </text>
    </Icon>
  ),
  yes: (
    <Icon>
      <rect x="5" y="8" width="30" height="16" rx="2" {...stroke} />
      <text
        x="20"
        y="19.5"
        textAnchor="middle"
        fontSize="9"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fill="currentColor"
      >
        YES
      </text>
    </Icon>
  ),
  no: (
    <Icon>
      <rect x="5" y="8" width="30" height="16" rx="2" {...stroke} />
      <text
        x="20"
        y="19.5"
        textAnchor="middle"
        fontSize="9"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fill="currentColor"
      >
        NO
      </text>
    </Icon>
  ),
  crop: (
    <Icon>
      <path d="M12 6v18M6 12h18M28 10v16H12" {...stroke} strokeLinecap="round" />
    </Icon>
  ),
  group: (
    <Icon>
      <rect x="6" y="6" width="16" height="12" rx="1" {...stroke} />
      <rect x="14" y="14" width="16" height="12" rx="1" {...stroke} />
    </Icon>
  ),
  unknown: (
    <Icon>
      <rect x="8" y="6" width="24" height="20" rx="2" {...stroke} />
      <circle cx="20" cy="16" r="2" fill="currentColor" />
    </Icon>
  ),
}

const TYPE_ALIASES = {
  rect: 'rectangle',
  Rect: 'rectangle',
  circle: 'circle',
  Circle: 'circle',
  triangle: 'triangle',
  Triangle: 'triangle',
  polygon: 'polygon',
  Polygon: 'polygon',
  polyline: 'line',
  Polyline: 'line',
  line: 'line',
  Line: 'line',
  textbox: 'textbox',
  Textbox: 'textbox',
  'i-text': 'textbox',
  IText: 'textbox',
  text: 'textbox',
  Text: 'textbox',
  path: 'path',
  Path: 'path',
  image: 'image',
  Image: 'image',
  group: 'group',
  Group: 'group',
}

const LABEL_ALIASES = {
  Process: 'process',
  Decision: 'decision',
  Start: 'terminator',
  End: 'terminator',
  Terminator: 'terminator',
  'Input / Output': 'inputOutput',
  Document: 'document',
  Database: 'database',
  'Manual Input': 'manualInput',
  Preparation: 'preparation',
  Connector: 'connector',
  Delay: 'delay',
  OR: 'logicalOR',
  '&': 'logicalAND',
  YES: 'yes',
  NO: 'no',
}

export function resolveLayerSymbol(layer) {
  if (layer.shapeKind && ICONS[layer.shapeKind]) {
    return layer.shapeKind
  }

  if (layer.name?.startsWith?.('Crop')) {
    return 'crop'
  }

  if (layer.label && LABEL_ALIASES[layer.label]) {
    return LABEL_ALIASES[layer.label]
  }

  const fromType = TYPE_ALIASES[layer.type] || TYPE_ALIASES[String(layer.type || '').toLowerCase()]
  if (fromType && ICONS[fromType]) {
    return fromType
  }

  return 'unknown'
}

export function getLayerBaseName(layer) {
  const kind = resolveLayerSymbol(layer)
  const titles = {
    rectangle: 'Rectangle',
    circle: 'Circle',
    triangle: 'Triangle',
    polygon: 'Polygon',
    line: 'Line',
    textbox: 'Text',
    comment: 'Comment',
    stickyNote: 'Sticky',
    path: 'Path',
    image: 'Image',
    process: 'Process',
    decision: 'Decision',
    terminator: 'Terminator',
    inputOutput: 'Input / Output',
    document: 'Document',
    database: 'Database',
    manualInput: 'Manual Input',
    preparation: 'Preparation',
    connector: 'Connector',
    delay: 'Delay',
    logicalOR: 'OR',
    logicalAND: 'AND',
    yes: 'YES',
    no: 'NO',
    crop: 'Crop',
    group: 'Group',
    unknown: layer.type || 'Object',
  }
  return titles[kind] || layer.type || 'Object'
}

/** Display label only — never use this as object.id. */
export function getLayerDisplayName(layer) {
  const base = getLayerBaseName(layer)
  const n = layer.displayNumber
  return typeof n === 'number' && n > 0 ? `${base} ${n}` : base
}

export function LayerIcon({ shapeKind, type, name, label }) {
  const key = resolveLayerSymbol({ shapeKind, type, name, label })
  return <span className="layerIcon">{ICONS[key] || ICONS.unknown}</span>
}
