import { describe, it, expect } from 'vitest'
import { toolSuccess, toolError } from './tool-response'

describe('toolSuccess', () => {
  it('returns the data unchanged when no next action is given', () => {
    expect(toolSuccess({ result: 'ok' })).toEqual({ result: 'ok' })
  })

  it('adds a next_action field when provided', () => {
    expect(toolSuccess({ result: 'ok' }, { nextAction: 'call read_text_file next' })).toEqual({
      result: 'ok',
      next_action: 'call read_text_file next'
    })
  })
})

describe('toolError', () => {
  it('returns just the error message when no extras are given', () => {
    expect(toolError('File not found')).toEqual({ error: 'File not found' })
  })

  it('adds recovery and diagnostics fields when provided', () => {
    expect(toolError('File not found', { recovery: 'Check the path and retry', diagnostics: { path: 'x' } })).toEqual({
      error: 'File not found',
      recovery: 'Check the path and retry',
      diagnostics: { path: 'x' }
    })
  })
})
