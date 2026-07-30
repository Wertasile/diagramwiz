import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Crop,
  Download,
  EyeOff,
  Layers,
  Map,
  Moon,
  MousePointer2,
  PenTool,
  Pencil,
  Shapes,
  Upload,
  Workflow,
  ZoomIn,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import styles from "./home.module.css"

export const metadata: Metadata = {
  title: "Fabric.js Playground — Placeholder",
  description:
    "Placeholder homepage for a local-first Fabric.js canvas playground: flowcharts, shapes, import/export, layers, and more — no login required.",
}

const FEATURES = [
  {
    icon: EyeOff,
    title: "No login required",
    description:
      "Open the playground and start drawing. No accounts, no auth wall, no cloud sync.",
  },
  {
    icon: Workflow,
    title: "Flowchart toolkit",
    description:
      "Process, decision, terminator, I/O, document, database, connectors, YES/NO, and more.",
  },
  {
    icon: Shapes,
    title: "Basic shapes & text",
    description:
      "Rectangles, circles, triangles, lines, and text boxes for quick sketches.",
  },
  {
    icon: Upload,
    title: "Import JSON & images",
    description:
      "Bring back a saved canvas from JSON, or drop in PNG / JPG assets.",
  },
  {
    icon: Download,
    title: "Export JSON & PNG",
    description:
      "Save the full canvas as JSON, export the worked area, or export a selection as PNG.",
  },
  {
    icon: MousePointer2,
    title: "Smart connectors",
    description:
      "Draw connector lines that snap to shape edge midpoints as you drag endpoints.",
  },
  {
    icon: Layers,
    title: "Layers panel",
    description:
      "Reorder, rename, and manage every object on the canvas from a dedicated layer list.",
  },
  {
    icon: Crop,
    title: "Crop frames & export",
    description:
      "Define crop frames on the canvas and export framed regions when you need them.",
  },
  {
    icon: Map,
    title: "Minimap navigation",
    description:
      "Keep orientation on large boards with a live minimap of the workspace.",
  },
  {
    icon: ZoomIn,
    title: "Pan & zoom viewport",
    description:
      "Scroll to zoom, pan the stage, zoom to fit, and reset the viewport from settings.",
  },
  {
    icon: Pencil,
    title: "Freehand drawing",
    description:
      "Switch into pencil mode for freehand strokes with adjustable brush width.",
  },
  {
    icon: PenTool,
    title: "Polygon pen",
    description:
      "Click to place points and build custom polygons with a Figma-like pen tool.",
  },
  {
    icon: Moon,
    title: "Light & dark theme",
    description:
      "Toggle themes anytime — canvas stroke colors follow the active theme.",
  },
]

export default function Page() {
  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <header className={styles.topBar}>
        <span className={styles.brandMark}>Fabric.js Playground</span>
        <div className={styles.topActions}>
          <ThemeToggle />
          <Button render={<Link href="/playground" />} size="sm">
            Open playground
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <Badge variant="outline" className={styles.placeholderBadge}>
            Placeholder homepage
          </Badge>
          <h1 className={styles.brand}>Fabric.js Playground</h1>
          <p className={styles.lede}>
            A local-first canvas for shapes, flowcharts, and exports — no
            signup. This page is a temporary stand-in while the real marketing
            site is built.
          </p>
          <div className={styles.ctaRow}>
            <Button render={<Link href="/playground" />} size="lg">
              Launch playground
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              render={<a href="#features" />}
              variant="outline"
              size="lg"
            >
              See what&apos;s included
            </Button>
          </div>
          <p className={styles.heroNote}>
            Jump straight into the editor — nothing to configure first.
          </p>
        </section>

        <section id="features" className={styles.features}>
          <div className={styles.featuresIntro}>
            <h2 className={styles.featuresTitle}>What you can do today</h2>
            <p className={styles.featuresLede}>
              Everything below is live in the playground. This homepage only
              lists it.
            </p>
          </div>

          <ul className={styles.featureList}>
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className={styles.featureItem}>
                <Icon className={styles.featureIcon} aria-hidden="true" />
                <div>
                  <h3 className={styles.featureName}>{title}</h3>
                  <p className={styles.featureDesc}>{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Placeholder page · built on{" "}
          <a
            href="https://fabricjs.com"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
          >
            Fabric.js
          </a>
        </p>
        <Button render={<Link href="/playground" />} variant="ghost" size="sm">
          Go to playground
          <ArrowRight data-icon="inline-end" />
        </Button>
      </footer>
    </div>
  )
}
