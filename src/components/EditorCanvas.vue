<script setup lang="ts">
import { ref, computed, watch } from 'vue'

import { useCanvas } from '@/composables/use-canvas'
import { useCanvasInput } from '@/composables/use-canvas-input'
import { useCollabInjected } from '@/composables/use-collab'
import { useTextEdit } from '@/composables/use-text-edit'
import { useEditorStore } from '@/stores/editor'
import { frameInnerHtml } from '@open-pencil/core'
import CanvasContextMenu from './CanvasContextMenu.vue'
import CanvasControls from './CanvasControls.vue'

const store = useEditorStore()
const collab = useCollabInjected()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── Per-frame preview mode ────────────────────────────────────
const previewFrameIds = ref(new Set<string>())

function toggleFramePreview(id: string) {
  const next = new Set(previewFrameIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  previewFrameIds.value = next
}

// Top-level frames on current page
const pageFrames = computed(() => {
  void store.state.sceneVersion
  if (!store.graph) return []
  return store.graph.getChildren(store.state.currentPageId)
    .filter((n) => n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'SECTION')
})

// For each frame: screen rect + preview HTML
interface FrameOverlay {
  id: string
  name: string
  screenX: number
  screenY: number
  screenW: number
  screenH: number
  isPreviewing: boolean
  html: string
}

const frameOverlays = computed<FrameOverlay[]>(() => {
  const { panX, panY, zoom } = store.state
  void store.state.sceneVersion
  return pageFrames.value.map((f) => {
    const isPreviewing = previewFrameIds.value.has(f.id)
    return {
      id: f.id,
      name: f.name,
      screenX: Math.round(f.x * zoom + panX),
      screenY: Math.round(f.y * zoom + panY),
      screenW: Math.round(f.width * zoom),
      screenH: Math.round(f.height * zoom),
      isPreviewing,
      html: isPreviewing && store.graph ? frameInnerHtml(f.id, store.graph) : '',
    }
  })
})

const { hitTestSectionTitle, hitTestComponentLabel } = useCanvas(canvasRef, store)
const { cursorOverride } = useCanvasInput(
  canvasRef,
  store,
  hitTestSectionTitle,
  hitTestComponentLabel,
  (cx, cy) => collab?.updateCursor(cx, cy, store.state.currentPageId)
)

useTextEdit(canvasRef, store)

watch(
  () => [...store.state.selectedIds],
  (ids) => collab?.updateSelection(ids)
)

const cursor = computed(() => {
  if (cursorOverride.value) return cursorOverride.value
  const tool = store.state.activeTool
  if (tool === 'HAND') return 'grab'
  if (tool === 'SELECT') return 'default'
  if (tool === 'TEXT') return 'text'
  return 'crosshair'
})
</script>

<template>
  <CanvasContextMenu>
    <div class="canvas-area relative flex-1 min-w-0 min-h-0 overflow-hidden">
      <!-- Skia canvas — always rendering -->
      <canvas ref="canvasRef" :style="{ cursor }" class="block size-full touch-none" />

      <!-- Per-frame overlays -->
      <template v-for="f in frameOverlays" :key="f.id">
        <!-- Toggle pill above each frame -->
        <div
          class="pointer-events-auto absolute z-20 flex -translate-y-full pb-1"
          :style="{ left: `${f.screenX}px`, top: `${f.screenY}px` }"
        >
          <div class="flex items-center rounded-full border border-border bg-panel/90 p-0.5 shadow backdrop-blur-sm">
            <button
              :class="[
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                !f.isPreviewing ? 'bg-surface text-canvas shadow-sm' : 'text-muted hover:text-surface'
              ]"
              @click.stop="f.isPreviewing && toggleFramePreview(f.id)"
            >
              <icon-lucide-pencil class="size-2.5" />
              Design
            </button>
            <button
              :class="[
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                f.isPreviewing ? 'bg-surface text-canvas shadow-sm' : 'text-muted hover:text-surface'
              ]"
              @click.stop="!f.isPreviewing && toggleFramePreview(f.id)"
            >
              <icon-lucide-monitor class="size-2.5" />
              Preview
            </button>
          </div>
        </div>

        <!-- HTML preview overlay — exact frame bounds, scaled with canvas zoom -->
        <Transition name="preview-fade">
          <div
            v-if="f.isPreviewing"
            class="pointer-events-auto absolute z-10 origin-top-left overflow-hidden"
            :style="{
              left: `${f.screenX}px`,
              top: `${f.screenY}px`,
              width: `${f.screenW}px`,
              height: `${f.screenH}px`,
            }"
          >
            <!-- inner div scaled back to design px so CSS values work at 1:1 -->
            <div
              class="absolute origin-top-left"
              :style="{
                width: `${Math.round(f.screenW / store.state.zoom)}px`,
                height: `${Math.round(f.screenH / store.state.zoom)}px`,
                transform: `scale(${store.state.zoom})`,
              }"
              v-html="f.html"
            />
          </div>
        </Transition>
      </template>

      <!-- Bottom-left controls -->
      <div class="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-2">
        <CanvasControls />
      </div>
    </div>
  </CanvasContextMenu>
</template>

<style scoped>
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.15s ease;
}
.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
