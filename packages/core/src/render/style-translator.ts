/**
 * Translates SceneNode properties to CSS inline style objects.
 * Used by the HTML emitter and (later) Tailwind/CSS-modules adapters.
 */

import { colorToHex } from '../color'
import type { SceneNode, Fill, Stroke, Effect, Color } from '../scene-graph'

function rgba(color: Color, opacity = 1): string {
  const a = Math.round(color.a * opacity * 100) / 100
  if (a >= 1) return colorToHex(color)
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  return `rgba(${r},${g},${b},${a})`
}

function solidFill(fills: Fill[]): string | null {
  if (!fills || !Array.isArray(fills)) return null;
  const f = fills.find((f) => f.visible && f.type === 'SOLID')
  return f ? rgba(f.color, f.opacity) : null
}

function gradientFill(fills: Fill[]): string | null {
  if (!fills || !Array.isArray(fills)) return null;
  const f = fills.find((f) => f.visible && (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL'))
  if (!f || !f.gradientStops) return null
  const stops = f.gradientStops
    .map((s) => `${rgba(s.color, s.color.a)} ${Math.round(s.position * 100)}%`)
    .join(', ')
  return f.type === 'GRADIENT_RADIAL'
    ? `radial-gradient(${stops})`
    : `linear-gradient(90deg, ${stops})`
}

function strokeCss(strokes: Stroke[]): string | null {
  if (!strokes || !Array.isArray(strokes)) return null;
  const s = strokes.find((s) => s.visible)
  if (!s) return null
  const align = s.align === 'INSIDE' ? 'inset' : s.align === 'OUTSIDE' ? 'outset' : ''
  return `${s.weight}px solid ${rgba(s.color, s.opacity)}${align ? ` ${align}` : ''}`
}

function shadowCss(effects: Effect[]): string {
  if (!effects || !Array.isArray(effects)) return '';
  return effects
    .filter((e) => e.visible && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'))
    .map((e) => {
      const inset = e.type === 'INNER_SHADOW' ? 'inset ' : ''
      return `${inset}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread ?? 0}px ${rgba(e.color, e.color.a)}`
    })
    .join(', ')
}

function blurCss(effects: Effect[]): string | null {
  if (!effects || !Array.isArray(effects)) return null;
  const blur = effects.find((e) => e.visible && e.type === 'LAYER_BLUR')
  return blur ? `blur(${blur.radius}px)` : null
}

const BLEND_MODE: Record<string, string> = {
  MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay',
  DARKEN: 'darken', LIGHTEN: 'lighten', COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn', HARD_LIGHT: 'hard-light', SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference', EXCLUSION: 'exclusion', HUE: 'hue',
  SATURATION: 'saturation', COLOR: 'color', LUMINOSITY: 'luminosity',
}

const TEXT_ALIGN: Record<string, string> = {
  LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify',
}

export interface CSSProps {
  position?: string
  left?: string
  top?: string
  width?: string
  height?: string
  minWidth?: string
  maxWidth?: string
  display?: string
  flexDirection?: string
  gap?: string
  flexWrap?: string
  justifyContent?: string
  alignItems?: string
  alignSelf?: string
  flexGrow?: string
  padding?: string
  paddingTop?: string
  paddingRight?: string
  paddingBottom?: string
  paddingLeft?: string
  background?: string
  border?: string
  borderRadius?: string
  opacity?: string
  transform?: string
  mixBlendMode?: string
  overflow?: string
  boxShadow?: string
  filter?: string
  fontSize?: string
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  color?: string
  textAlign?: string
  lineHeight?: string
  letterSpacing?: string
  whiteSpace?: string
  boxSizing?: string
  pointerEvents?: string
  userSelect?: string
}

const JUSTIFY: Record<string, string> = {
  MIN: 'flex-start', MAX: 'flex-end', CENTER: 'center', SPACE_BETWEEN: 'space-between',
}
const ALIGN: Record<string, string> = {
  MIN: 'flex-start', MAX: 'flex-end', CENTER: 'center', STRETCH: 'stretch',
}

export function nodeToCSS(
  node: SceneNode,
  parentIsAutoLayout: boolean,
  isRoot = false
): CSSProps {
  const css: CSSProps = { boxSizing: 'border-box' }
  const isAutoLayout = node.layoutMode !== 'NONE'

  // Positioning
  if (isRoot) {
    css.position = 'relative'
  } else if (!parentIsAutoLayout) {
    css.position = 'absolute'
    css.left = `${Math.round(node.x)}px`
    css.top = `${Math.round(node.y)}px`
  }

  // Size
  if (!isAutoLayout || node.primaryAxisSizing === 'FIXED') {
    css.width = node.layoutAlignSelf === 'STRETCH' ? '100%' : `${Math.round(node.width)}px`
  }
  if (node.height > 0 && node.counterAxisSizing === 'FIXED') {
    css.height = `${Math.round(node.height)}px`
  }

  // Flex layout
  if (isAutoLayout) {
    css.display = 'flex'
    css.flexDirection = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'
    if (node.itemSpacing > 0) css.gap = `${node.itemSpacing}px`
    if (node.layoutWrap === 'WRAP') css.flexWrap = 'wrap'
    if (node.primaryAxisAlign) css.justifyContent = JUSTIFY[node.primaryAxisAlign] ?? 'flex-start'
    if (node.counterAxisAlign) css.alignItems = ALIGN[node.counterAxisAlign] ?? 'flex-start'

    const { paddingTop: pt, paddingRight: pr, paddingBottom: pb, paddingLeft: pl } = node
    if (pt || pr || pb || pl) {
      if (pt === pr && pr === pb && pb === pl) css.padding = `${pt}px`
      else css.padding = `${pt}px ${pr}px ${pb}px ${pl}px`
    }
  }

  // Flex child
  if (parentIsAutoLayout && node.layoutGrow > 0) css.flexGrow = String(node.layoutGrow)
  if (node.layoutAlignSelf === 'STRETCH') css.alignSelf = 'stretch'

  // Background
  const bg = solidFill(node.fills) ?? gradientFill(node.fills)
  if (bg) css.background = bg

  // Border
  const border = strokeCss(node.strokes)
  if (border) css.border = border

  // Corner radius
  if (node.cornerRadius > 0) {
    if (node.independentCorners) {
      const { topLeftRadius: tl, topRightRadius: tr, bottomRightRadius: br, bottomLeftRadius: bl } = node
      css.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`
    } else {
      css.borderRadius = `${node.cornerRadius}px`
    }
  }
  if (node.type === 'ELLIPSE') css.borderRadius = '50%'

  // Opacity & blend
  if (node.opacity < 1) css.opacity = String(Math.round(node.opacity * 100) / 100)
  const blend = BLEND_MODE[node.blendMode]
  if (blend) css.mixBlendMode = blend

  // Overflow
  if (node.clipsContent) css.overflow = 'hidden'

  // Effects
  const shadow = shadowCss(node.effects)
  if (shadow) css.boxShadow = shadow
  const blur = blurCss(node.effects)
  if (blur) css.filter = blur

  // Transform (rotation)
  if (node.rotation && node.rotation !== 0) {
    css.transform = `rotate(${Math.round(node.rotation * 100) / 100}deg)`
  }

  // Pointer events and user select
  css.pointerEvents = 'none'
  css.userSelect = 'none'

  // Text
  if (node.type === 'TEXT') {
    if (node.fontSize) css.fontSize = `${node.fontSize}px`
    if (node.fontFamily) css.fontFamily = `"${node.fontFamily}", sans-serif`
    if (node.fontWeight) css.fontWeight = String(node.fontWeight)
    const textColor = solidFill(node.fills)
    if (textColor) { css.color = textColor; delete css.background }
    if (node.textAlignHorizontal) css.textAlign = TEXT_ALIGN[node.textAlignHorizontal] ?? 'left'
    if (node.lineHeight && typeof node.lineHeight === 'object') {
      const lh = node.lineHeight as { value: number; unit: string }
      css.lineHeight = lh.unit === 'PERCENT' ? `${lh.value}%` : `${lh.value}px`
    }
    if (node.letterSpacing && typeof node.letterSpacing === 'object') {
      const ls = node.letterSpacing as { value: number; unit: string }
      css.letterSpacing = ls.unit === 'PERCENT' ? `${ls.value / 100}em` : `${ls.value}px`
    }
    css.whiteSpace = node.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'nowrap' : 'pre-wrap'
  }

  return css
}

export function cssPropsToString(css: CSSProps): string {
  return Object.entries(css)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
    .join(';')
}
