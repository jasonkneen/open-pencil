/**
 * SceneGraph → HTML string emitter.
 * Produces a self-contained HTML document (or fragment) from a SceneGraph subtree.
 * Used for Level 1-3 preview mode (iframe srcdoc).
 */

import { nodeToCSS, cssPropsToString } from './style-translator'
import type { SceneGraph, SceneNode } from '../scene-graph'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nodeTag(node: SceneNode): string {
  switch (node.type) {
    case 'TEXT': return 'span'
    case 'LINE': return 'hr'
    default: return 'div'
  }
}

function renderNode(
  node: SceneNode,
  graph: SceneGraph,
  parentIsAutoLayout: boolean,
  isRoot: boolean,
  indent: number
): string {
  if (!node.visible) return ''

  const css = nodeToCSS(node, parentIsAutoLayout, isRoot)
  const styleStr = cssPropsToString(css)
  const tag = nodeTag(node)
  const pad = '  '.repeat(indent)
  const dataName = node.name ? ` data-name="${escapeHtml(node.name)}"` : ''

  if (node.type === 'TEXT') {
    const text = escapeHtml(node.text ?? '')
    return `${pad}<${tag} style="${styleStr}"${dataName}>${text}</${tag}>`
  }

  if (node.type === 'LINE') {
    return `${pad}<${tag} style="${styleStr}"${dataName} />`
  }

  // VECTOR / STAR / POLYGON — render as a placeholder box
  if (node.type === 'VECTOR' || node.type === 'STAR' || node.type === 'POLYGON') {
    const fill = (node.fills || []).find((f) => f.visible && f.type === 'SOLID')
    const color = fill ? `rgba(${Math.round(fill.color.r*255)},${Math.round(fill.color.g*255)},${Math.round(fill.color.b*255)},${fill.opacity})` : '#ccc'
    return `${pad}<div style="${styleStr};background:${color}"${dataName}></div>`
  }

  const children = graph.getChildren(node.id)
  const isAutoLayout = node.layoutMode !== 'NONE'

  if (children.length === 0) {
    return `${pad}<${tag} style="${styleStr}"${dataName}></${tag}>`
  }

  const childLines = children
    .map((c) => renderNode(c, graph, isAutoLayout, false, indent + 1))
    .filter(Boolean)

  return [
    `${pad}<${tag} style="${styleStr}"${dataName}>`,
    ...childLines,
    `${pad}</${tag}>`,
  ].join('\n')
}

export interface HtmlEmitOptions {
  /** Include a full HTML document wrapper (default: true) */
  fullDocument?: boolean
  /** Background color for the document body */
  background?: string
  /** Include click-to-navigate between top-level frames (Level 3) */
  interactive?: boolean
  /** Scale factor (default: 1) */
  scale?: number
}

export interface CanvasViewport {
  panX: number
  panY: number
  zoom: number
}

/**
 * Emit a single node (and its subtree) as HTML.
 */
export function nodeToHtml(
  nodeId: string,
  graph: SceneGraph,
  opts: HtmlEmitOptions = {}
): string {
  const node = graph.getNode(nodeId)
  if (!node) return ''
  const html = renderNode(node, graph, false, true, 0)
  if (opts.fullDocument === false) return html
  return wrapDocument(html, opts)
}

/**
 * Emit the full current page as HTML.
 * Top-level FRAME children of the page = "screens".
 */
export function pageToHtml(
  pageId: string,
  graph: SceneGraph,
  opts: HtmlEmitOptions = {}
): string {
  const page = graph.getNode(pageId)
  if (!page) return ''

  const frames = graph.getChildren(pageId).filter((n) => n.visible)

  if (opts.interactive) {
    return interactivePageHtml(frames, graph, opts)
  }

  // Non-interactive: stack all frames vertically
  const frameHtml = frames
    .map((f) => {
      const css = nodeToCSS(f, false, true)
      const styleStr = cssPropsToString(css)
      return `  <div style="position:relative;margin-bottom:40px">\n    <div style="${styleStr}">\n${renderChildren(f, graph, 2)}\n    </div>\n  </div>`
    })
    .join('\n')

  return wrapDocument(frameHtml, opts)
}

/**
 * Emit selected nodes as HTML fragments, side-by-side.
 */
export function selectionToHtml(
  nodeIds: string[],
  graph: SceneGraph,
  opts: HtmlEmitOptions = {}
): string {
  const parts = nodeIds
    .map((id) => {
      const node = graph.getNode(id)
      if (!node) return ''
      return renderNode(node, graph, false, true, 1)
    })
    .filter(Boolean)
  const inner = parts.join('\n')
  if (opts.fullDocument === false) return inner
  return wrapDocument(`<div style="display:flex;flex-wrap:wrap;gap:24px;padding:24px">\n${inner}\n</div>`, opts)
}

/**
 * Emit a single frame's inner content as an HTML fragment (no outer box).
 * Used for per-frame preview overlays — the caller controls the outer container.
 */
export function frameInnerHtml(frameId: string, graph: SceneGraph): string {
  const frame = graph.getNode(frameId)
  if (!frame) return ''
  const isAutoLayout = frame.layoutMode !== 'NONE'
  return graph
    .getChildren(frameId)
    .map((c) => renderNode(c, graph, isAutoLayout, false, 0))
    .filter(Boolean)
    .join('\n')
}

/**
 * Emit the page with frames positioned exactly as they are on the canvas,
 * applying the current pan + zoom so the preview matches 1:1 with the Skia view.
 */
export function canvasPageToHtml(
  pageId: string,
  graph: SceneGraph,
  viewport: CanvasViewport,
): string {
  const frames = graph.getChildren(pageId).filter((n) => n.visible)
  if (frames.length === 0) {
    return wrapDocument('<p style="padding:24px;color:#555">No frames on this page</p>', {})
  }

  const frameBlocks = frames.map((f) => {
    // Render children (inner content), not the frame itself — we control its outer box
    const isAutoLayout = f.layoutMode !== 'NONE'
    const childrenHtml = graph
      .getChildren(f.id)
      .map((c) => renderNode(c, graph, isAutoLayout, false, 3))
      .filter(Boolean)
      .join('\n')

    // Override position to match design coordinates exactly
    const { paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl } = f
    const paddingStr = (pt || pr || pb || pl)
      ? `${pt ?? 0}px ${pr ?? 0}px ${pb ?? 0}px ${pl ?? 0}px`
      : '0'

    const bgFill = (f.fills || []).find((fill) => fill.visible && fill.type === 'SOLID')
    const bg = bgFill
      ? `rgba(${Math.round(bgFill.color.r*255)},${Math.round(bgFill.color.g*255)},${Math.round(bgFill.color.b*255)},${bgFill.opacity})`
      : 'transparent'
    const radius = f.cornerRadius > 0 ? `border-radius:${f.cornerRadius}px;` : ''
    const overflow = f.clipsContent ? 'overflow:hidden;' : ''

    return `      <div style="position:absolute;left:${Math.round(f.x)}px;top:${Math.round(f.y)}px;width:${Math.round(f.width)}px;height:${Math.round(f.height)}px;background:${bg};padding:${paddingStr};${radius}${overflow}box-sizing:border-box">\n${childrenHtml}\n      </div>`
  }).join('\n')

  const { panX, panY, zoom } = viewport
  const bg = '#1e1e1e'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;overflow:hidden;background:${bg}}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  img{max-width:100%;display:block}
  #stage{position:absolute;top:0;left:0;transform-origin:0 0;transform:translate(${Math.round(panX)}px,${Math.round(panY)}px) scale(${zoom})}
</style>
</head>
<body>
  <div id="stage">
${frameBlocks}
  </div>
</body>
</html>`
}

// ── Helpers ────────────────────────────────────────────────────────────

function renderChildren(node: SceneNode, graph: SceneGraph, indent: number): string {
  const isAutoLayout = node.layoutMode !== 'NONE'
  return graph.getChildren(node.id)
    .map((c) => renderNode(c, graph, isAutoLayout, false, indent))
    .filter(Boolean)
    .join('\n')
}

function wrapDocument(body: string, opts: HtmlEmitOptions): string {
  const bg = opts.background ?? '#f5f5f5'
  const scale = opts.scale ?? 1
  const scaleStyle = scale !== 1 ? `transform:scale(${scale});transform-origin:top left;` : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${bg};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;${scaleStyle}}
  img{max-width:100%;display:block}
</style>
</head>
<body>
${body}
</body>
</html>`
}

function interactivePageHtml(
  frames: SceneNode[],
  graph: SceneGraph,
  opts: HtmlEmitOptions
): string {
  if (frames.length === 0) return wrapDocument('<p style="padding:24px;color:#999">No frames on this page</p>', opts)

  const frameBlocks = frames.map((f, i) => {
    const css = nodeToCSS(f, false, true)
    const styleStr = cssPropsToString(css)
    const children = renderChildren(f, graph, 3)
    return `      <div id="frame-${i}" class="frame" style="${styleStr};display:${i === 0 ? 'block' : 'none'}">\n${children}\n      </div>`
  }).join('\n')

  const navItems = frames.map((f, i) =>
    `        <button onclick="show(${i})" id="nav-${i}" class="nav-btn${i === 0 ? ' active' : ''}">${escapeHtml(f.name || `Frame ${i + 1}`)}</button>`
  ).join('\n')

  const bg = opts.background ?? '#1a1a1a'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:${bg};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  img{max-width:100%;display:block}
  .nav{display:flex;gap:6px;padding:12px;background:#111;position:sticky;top:0;z-index:100;width:100%}
  .nav-btn{padding:4px 10px;border:1px solid #444;background:transparent;color:#888;border-radius:4px;cursor:pointer;font-size:11px}
  .nav-btn.active{background:#333;color:#fff;border-color:#666}
  .stage{padding:40px;display:flex;justify-content:center}
  .frame{position:relative}
</style>
</head>
<body>
<nav class="nav">
${navItems}
</nav>
<div class="stage">
${frameBlocks}
</div>
<script>
  function show(i) {
    document.querySelectorAll('.frame').forEach(function(el,j){ el.style.display = j===i?'block':'none' })
    document.querySelectorAll('.nav-btn').forEach(function(el,j){ el.classList.toggle('active',j===i) })
  }
<\/script>
</body>
</html>`
}
