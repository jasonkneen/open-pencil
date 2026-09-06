import { expect, test } from 'bun:test'

import { effectScope, ref } from 'vue'

import { mcpConnectionSettings, type MCPConnection } from '@/app/integrations/mcp'
import { useMCPConnectionSettings } from '@/app/integrations/mcp/settings/use'

const connection: MCPConnection = {
  id: 'mcp-test',
  name: 'Test',
  enabled: true,
  transport: { type: 'streamable-http', url: 'https://example.com/mcp' },
  authentication: { type: 'none' }
}

test('MCP credential clear disables its captured target without changing a new draft', async () => {
  const scope = effectScope()
  let finish: () => void = () => undefined
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const saved: boolean[] = []
  const token = ref('')
  try {
    const state = scope.run(() =>
      useMCPConnectionSettings(token, ref({ bearerTokenRequired: 'Required' }), {
        status: async () => 'configured',
        setCredential: async () => pending,
        save: (draft) => {
          saved.push(draft.enabled)
          return connection
        },
        remove: async () => undefined
      })
    )
    if (!state) throw new Error('Missing scope')
    state.draft.value.id = connection.id
    const clearing = state.clearCredential()
    state.startAdd()
    state.draft.value.enabled = true
    token.value = 'new-key'
    finish()
    await clearing
    expect(saved).toEqual([false])
    expect(state.draft.value.enabled).toBe(true)
    expect(token.value).toBe('new-key')
  } finally {
    scope.stop()
  }
})

test('MCP edit ignores credential status after another draft opens', async () => {
  const previous = mcpConnectionSettings.value.connections
  mcpConnectionSettings.value.connections = [connection]
  const scope = effectScope()
  let finish: () => void = () => undefined
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  try {
    const state = scope.run(() =>
      useMCPConnectionSettings(ref(''), ref({ bearerTokenRequired: 'Required' }), {
        status: async () => {
          await pending
          return 'configured'
        },
        setCredential: async () => undefined,
        save: () => connection,
        remove: async () => undefined
      })
    )
    if (!state) throw new Error('Missing scope')
    const editing = state.startEdit(connection.id)
    state.startAdd()
    finish()
    expect(await editing).toBe(false)
    expect(state.tokenStatus.value).toBe('missing')
  } finally {
    scope.stop()
    mcpConnectionSettings.value.connections = previous
  }
})

test('MCP save and clear failures preserve token input', async () => {
  const scope = effectScope()
  const token = ref('replacement')
  try {
    const state = scope.run(() =>
      useMCPConnectionSettings(token, ref({ bearerTokenRequired: 'Required' }), {
        status: async () => 'configured',
        setCredential: async () => {
          throw new Error('Offline')
        },
        save: () => connection,
        remove: async () => undefined
      })
    )
    if (!state) throw new Error('Missing scope')
    state.draft.value.id = connection.id
    expect(await state.save()).toBe(false)
    expect(state.error.value).toBe('Offline')
    await state.clearCredential()
    expect(state.error.value).toBe('Offline')
    expect(token.value).toBe('replacement')
  } finally {
    scope.stop()
  }
})
