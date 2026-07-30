import React from 'react'
import styles from './shapes.module.css'

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinejoin: 'round',
}

function ShapeIcon({ children, viewBox = '0 0 40 32' }) {
  return (
    <svg viewBox={viewBox} aria-hidden="true">
      {children}
    </svg>
  )
}

const SHAPE_ITEMS = [
  {
    id: 'rectangle',
    name: 'Rectangle',
    icon: (
      <ShapeIcon>
        <rect x="6" y="6" width="28" height="20" rx="1" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'circle',
    name: 'Circle',
    icon: (
      <ShapeIcon>
        <circle cx="20" cy="16" r="11" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'triangle',
    name: 'Triangle',
    icon: (
      <ShapeIcon>
        <polygon points="20,4 34,28 6,28" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'line',
    name: 'Line',
    icon: (
      <ShapeIcon>
        <line x1="6" y1="26" x2="34" y2="6" {...strokeProps} strokeLinecap="round" />
      </ShapeIcon>
    ),
  },
  {
    id: 'textbox',
    name: 'Text',
    icon: (
      <ShapeIcon>
        <path d="M10 8h20M20 8v16M14 24h12" {...strokeProps} strokeLinecap="round" />
      </ShapeIcon>
    ),
  },
//   {
//     id: 'comment',
//     name: 'Comment',
//     icon: (
//       <ShapeIcon>
//         <rect x="5" y="5" width="30" height="18" rx="3" {...strokeProps} />
//         <path d="M14 23v5l5-5" {...strokeProps} strokeLinecap="round" />
//         <line x1="11" y1="11" x2="29" y2="11" {...strokeProps} strokeLinecap="round" />
//         <line x1="11" y1="16" x2="24" y2="16" {...strokeProps} strokeLinecap="round" />
//       </ShapeIcon>
//     ),
//   },
//   {
//     id: 'stickyNote',
//     name: 'Sticky',
//     icon: (
//       <ShapeIcon>
//         <path d="M8 4h20v18l-6 6H8z" {...strokeProps} />
//         <path d="M22 28v-6h6" {...strokeProps} strokeLinecap="round" />
//         <line x1="12" y1="12" x2="24" y2="12" {...strokeProps} strokeLinecap="round" />
//         <line x1="12" y1="17" x2="20" y2="17" {...strokeProps} strokeLinecap="round" />
//       </ShapeIcon>
//     ),
//   },
]

const FLOWCHART_ITEMS = [
  {
    id: 'process',
    name: 'Process',
    icon: (
      <ShapeIcon>
        <rect x="4" y="8" width="32" height="16" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'decision',
    name: 'Decision',
    icon: (
      <ShapeIcon>
        <polygon points="20,3 36,16 20,29 4,16" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'terminator',
    name: 'Terminator',
    icon: (
      <ShapeIcon>
        <rect x="4" y="9" width="32" height="14" rx="7" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'inputOutput',
    name: 'Input / Output',
    icon: (
      <ShapeIcon>
        <polygon points="10,8 36,8 30,24 4,24" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'document',
    name: 'Document',
    icon: (
      <ShapeIcon>
        <path
          d="M6 4h28v18q-7 6-14 2t-14 2z"
          {...strokeProps}
        />
      </ShapeIcon>
    ),
  },
  {
    id: 'database',
    name: 'Database',
    icon: (
      <ShapeIcon>
        <ellipse cx="20" cy="8" rx="12" ry="4" {...strokeProps} />
        <path d="M8 8v14c0 2.2 5.4 4 12 4s12-1.8 12-4V8" {...strokeProps} />
        <path d="M8 15c0 2.2 5.4 4 12 4s12-1.8 12-4" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'manualInput',
    name: 'Manual Input',
    icon: (
      <ShapeIcon>
        <polygon points="10,6 36,6 36,26 4,26" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'preparation',
    name: 'Preparation',
    icon: (
      <ShapeIcon>
        <polygon points="10,6 30,6 36,16 30,26 10,26 4,16" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'connector',
    name: 'Connector',
    icon: (
      <ShapeIcon>
        <circle cx="20" cy="16" r="10" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'delay',
    name: 'Delay',
    icon: (
      <ShapeIcon>
        <path d="M6 6h14a10 10 0 0 1 0 20H6z" {...strokeProps} />
      </ShapeIcon>
    ),
  },
  {
    id: 'logicalOR',
    name: 'OR',
    icon: (
      <ShapeIcon>
        <circle cx="20" cy="16" r="11" {...strokeProps} />
        <line x1="20" y1="9" x2="20" y2="23" {...strokeProps} strokeLinecap="round" />
        <line x1="13" y1="16" x2="27" y2="16" {...strokeProps} strokeLinecap="round" />
      </ShapeIcon>
    ),
  },
  {
    id: 'logicalAND',
    name: 'AND',
    icon: (
      <ShapeIcon>
        <circle cx="20" cy="16" r="11" {...strokeProps} />
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
      </ShapeIcon>
    ),
  },
  {
    id: 'yes',
    name: 'YES',
    icon: (
      <ShapeIcon>
        <rect x="5" y="8" width="30" height="16" rx="2" {...strokeProps} />
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
      </ShapeIcon>
    ),
  },
  {
    id: 'no',
    name: 'NO',
    icon: (
      <ShapeIcon>
        <rect x="5" y="8" width="30" height="16" rx="2" {...strokeProps} />
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
      </ShapeIcon>
    ),
  },
]

function ShapeSidebar({ onAddShape }) {
  const renderItems = (items) =>
    items.map((item) => (
      <button
        key={item.id}
        type="button"
        className={styles.shapesItem}
        onClick={() => onAddShape?.(item.id)}
        title={`Add ${item.name}`}
      >
        <div className={styles.shapesItemIcon}>{item.icon}</div>
        <span className={styles.shapesItemName}>{item.name}</span>
      </button>
    ))

  return (
    <aside className={styles.shapesContainer}>
      <h2 className={styles.shapesTitle}>Insert</h2>

      <section className={styles.shapesSection}>
        <h3 className={styles.shapesSectionTitle}>Shapes</h3>
        <div className={styles.shapesGrid}>{renderItems(SHAPE_ITEMS)}</div>
      </section>

      <section className={styles.shapesSection}>
        <h3 className={styles.shapesSectionTitle}>Flowchart</h3>
        <div className={styles.shapesGrid}>{renderItems(FLOWCHART_ITEMS)}</div>
      </section>
    </aside>
  )
}

export default ShapeSidebar
