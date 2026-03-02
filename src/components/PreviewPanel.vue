<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { pageToHtml, selectionToHtml } from '@open-pencil/core'

const store = useEditorStore()

const mode = ref<'page' | 'selection'>('page')
const interactive = ref(true)
const scale = ref(1)

// Recompute HTML whenever scene changes or mode changes
const previewHtml = computed(() => {
  void store.state.sceneVersion // track scene mutations

  if (!store.graph) return ''

  if (mode.value === 'selection' && store.state.selectedIds.size > 0) {
    return selectionToHtml([...store.state.selectedIds], store.graph, {
      interactive: false,
      background: '#1a1a1a',
      scale: scale.value,
    })
  }

  const pageId = store.state.currentPageId
  if (!pageId) return ''

  return pageToHtml(pageId, store.graph, {
    interactive: interactive.value,
    background: '#1a1a1a',
    scale: scale.value,
  })
})

const hasSelection = computed(() => store.state.selectedIds.size > 0)

// Switch to selection mode automatically when nodes are selected
watch(hasSelection, (has) => {
  if (has) mode.value = 'selection'
  else mode.value = 'page'
})

const SCALES = [0.25, 0.5, 0.75, 1, 1.5, 2]

function openInTab() {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(previewHtml.value)
  win.document.close()
}
</script>

<template>
  <div class="flex h-full flex-col bg-canvas">
    <!-- Toolbar -->
    <div class="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
      <icon-lucide-monitor class="size-3.5 shrink-0 text-muted" />
      <span class="text-[11px] font-medium text-surface">Preview</span>

      <div class="flex-1" />

      <!-- Mode toggle -->
      <div class="flex items-center rounded-md border border-border text-[10px]">
        <button
          :class="['px-2 py-0.5 rounded-l-md transition-colors', mode === 'page' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-surface']"
          @click="mode = 'page'"
        >
          Page
        </button>
        <button
          :class="['px-2 py-0.5 rounded-r-md transition-colors', mode === 'selection' ? 'bg-accent/15 text-accent' : 'text-muted hover:text-surface', !hasSelection && 'opacity-40 cursor-not-allowed']"
          :disabled="!hasSelection"
          @click="if (hasSelection) mode = 'selection'"
        >
          Selection
        </button>
      </div>

      <!-- Interactive toggle (page mode only) -->
      <button
        v-if="mode === 'page'"
        :class="['flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors', interactive ? 'bg-accent/15 text-accent' : 'text-muted hover:text-surface']"
        title="Toggle click-to-navigate between frames"
        @click="interactive = !interactive"
      >
        <icon-lucide-mouse-pointer-2 class="size-3" />
        Interactive
      </button>

      <!-- Scale -->
      <select
        v-model.number="scale"
        class="rounded border border-border bg-input px-1 py-0.5 text-[10px] text-muted outline-none"
      >
        <option v-for="s in SCALES" :key="s" :value="s">{{ Math.round(s * 100) }}%</option>
      </select>

      <!-- Open in tab -->
      <button
        class="flex size-5 items-center justify-center rounded text-muted hover:text-surface transition-colors"
        title="Open in new tab"
        @click="openInTab"
      >
        <icon-lucide-external-link class="size-3" />
      </button>
    </div>

    <!-- iframe -->
    <div class="relative min-h-0 flex-1 overflow-hidden bg-[#1a1a1a]">
      <iframe
        v-if="previewHtml"
        :srcdoc="previewHtml"
        class="h-full w-full border-none"
        sandbox="allow-scripts"
        title="Design preview"
      />
      <div
        v-else
        class="flex h-full items-center justify-center gap-2 text-[11px] text-muted"
      >
        <icon-lucide-layout-template class="size-4" />
        No frames on this page
      </div>
    </div>
  </div>
</template>
