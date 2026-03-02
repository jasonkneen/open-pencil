<script setup lang="ts">
import { ref, computed, watch } from 'vue'

import { useCanvas } from '@/composables/use-canvas'
import { useCanvasInput } from '@/composables/use-canvas-input'
import { useCollabInjected } from '@/composables/use-collab'
import { useTextEdit } from '@/composables/use-text-edit'
import { useEditorStore } from '@/stores/editor'
import { pageToHtml, selectionToHtml } from '@open-pencil/core'
import CanvasContextMenu from './CanvasContextMenu.vue'
import CanvasControls from './CanvasControls.vue'

const store = useEditorStore()
const collab = useCollabInjected()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── Preview mode ──────────────────────────────────────────────
const previewMode = ref(false)

const previewHtml = computed(() => {
  if (!previewMode.value) return ''
  void store.state.sceneVersion
  if (!store.graph) return ''
  const hasSelection = store.state.selectedIds.size > 0
  if (hasSelection) {
    return selectionToHtml([...store.state.selectedIds], store.graph, {
      interactive: false,
      background: 'transparent',
    })
  }
  return pageToHtml(store.state.currentPageId, store.graph, {
    interactive: true,
    background: 'transparent',
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
      <!-- Skia canvas (always mounted) -->
      <canvas ref="canvasRef" :style="{ cursor }" class="block size-full touch-none" />

      <!-- Preview overlay (sits on top when active) -->
      <Transition name="preview-fade">
        <iframe
          v-if="previewMode"
          key="preview"
          :srcdoc="previewHtml"
          class="absolute inset-0 size-full border-none"
          sandbox="allow-scripts"
          title="Preview"
        />
      </Transition>

      <!-- View toggle pill (top-center) -->
      <div class="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
        <div class="pointer-events-auto flex items-center rounded-full border border-border bg-panel/90 p-0.5 shadow-lg backdrop-blur-sm">
          <button
            :class="[
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
              !previewMode ? 'bg-surface text-canvas shadow-sm' : 'text-muted hover:text-surface'
            ]"
            @click="previewMode = false"
          >
            <icon-lucide-pencil class="size-3" />
            Design
          </button>
          <button
            :class="[
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
              previewMode ? 'bg-surface text-canvas shadow-sm' : 'text-muted hover:text-surface'
            ]"
            @click="previewMode = true"
          >
            <icon-lucide-monitor class="size-3" />
            Preview
          </button>
        </div>
      </div>

      <!-- Bottom-left controls (hide in preview) -->
      <div
        v-if="!previewMode"
        class="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-2"
      >
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
