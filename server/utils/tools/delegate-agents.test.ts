import { describe, it, expect } from 'vitest'
import { AGENT_REGISTRY, resolveAgentDefinition } from './delegate-agents'

describe('resolveAgentDefinition', () => {
  it('resolves an exact-case registered agent name', () => {
    expect(resolveAgentDefinition('researcher')).toBe(AGENT_REGISTRY.researcher)
  })

  it('resolves case-insensitively', () => {
    expect(resolveAgentDefinition('Researcher')).toBe(AGENT_REGISTRY.researcher)
    expect(resolveAgentDefinition('RESEARCHER')).toBe(AGENT_REGISTRY.researcher)
  })

  it('returns undefined for an unregistered name', () => {
    expect(resolveAgentDefinition('reseacher')).toBeUndefined()
    expect(resolveAgentDefinition('nonexistent')).toBeUndefined()
  })
})
