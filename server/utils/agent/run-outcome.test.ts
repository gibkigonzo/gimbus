import { describe, it, expect } from 'vitest'
import { producedAssistantText } from './run-outcome'

describe('producedAssistantText', () => {
  it('returns true when an assistant message has non-empty content', () => {
    expect(producedAssistantText([{ role: 'assistant', content: 'Here is the summary.' }])).toBe(true)
  })

  it('returns false when there are no messages', () => {
    expect(producedAssistantText([])).toBe(false)
  })

  it('returns false when the assistant message content is empty/whitespace', () => {
    expect(producedAssistantText([{ role: 'assistant', content: '   ' }])).toBe(false)
  })

  it('returns false when the assistant message is a single-word non-answer', () => {
    expect(producedAssistantText([{ role: 'assistant', content: 'Done.' }])).toBe(false)
  })

  it('returns false for a long single-token string (junk, not a real answer)', () => {
    expect(producedAssistantText([{ role: 'assistant', content: 'asdkjasldkjalskjdlaasdkjasldkjalskjdla' }])).toBe(false)
  })

  it('returns true for a short but real two-word answer', () => {
    expect(producedAssistantText([{ role: 'assistant', content: 'No updates.' }])).toBe(true)
  })

  it('returns true for a genuine single-word answer (not a bare filler non-answer)', () => {
    expect(producedAssistantText([{ role: 'assistant', content: 'Warszawa.' }])).toBe(true)
  })

  it('returns true for a single-word numeric answer', () => {
    expect(producedAssistantText([{ role: 'assistant', content: '42' }])).toBe(true)
  })

  it('returns false for other known bare non-answers regardless of case/punctuation', () => {
    expect(producedAssistantText([{ role: 'assistant', content: 'OK' }])).toBe(false)
    expect(producedAssistantText([{ role: 'assistant', content: 'n/a' }])).toBe(false)
  })

  it('returns true when the assistant message is a normal multi-word reply', () => {
    expect(producedAssistantText([{ role: 'assistant', content: 'Checked the workflow and everything looks fine.' }])).toBe(true)
  })

  it('returns false when the assistant message content is null (tool-call-only step)', () => {
    expect(producedAssistantText([{ role: 'assistant', content: null, tool_calls: [] }])).toBe(false)
  })

  it('ignores tool messages when checking for assistant text', () => {
    expect(producedAssistantText([{ role: 'tool', content: 'result data', tool_call_id: 'x' }])).toBe(false)
  })

  it('returns false when an early step has incidental text but the final step does not', () => {
    expect(producedAssistantText([
      { role: 'assistant', content: 'Let me check that file.', tool_calls: [] },
      { role: 'tool', content: 'file contents', tool_call_id: 'x' },
      { role: 'assistant', content: null, tool_calls: [] }
    ])).toBe(false)
  })

  it('returns true when the final step has real text even if an earlier step did not', () => {
    expect(producedAssistantText([
      { role: 'assistant', content: null, tool_calls: [] },
      { role: 'tool', content: 'file contents', tool_call_id: 'x' },
      { role: 'assistant', content: 'Here is the summary.' }
    ])).toBe(true)
  })
})
