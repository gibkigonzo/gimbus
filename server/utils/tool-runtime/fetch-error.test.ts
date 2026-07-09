import { describe, it, expect } from 'vitest'
import { shapeFetchError } from './fetch-error'

describe('shapeFetchError', () => {
  it('shapes an error with statusCode and statusMessage', () => {
    const result = shapeFetchError({ statusCode: 400, statusMessage: 'Bad Request' })
    expect(result).toEqual({ error: 'Bad Request', statusCode: 400 })
  })

  it('includes retryAfterSeconds when a retry-after header is present', () => {
    const headers = new Headers({ 'retry-after': '30' })
    const result = shapeFetchError({ statusCode: 429, statusMessage: 'Too Many Requests', response: { headers } })
    expect(result).toEqual({ error: 'Too Many Requests', statusCode: 429, retryAfterSeconds: 30 })
  })

  it('falls back to a plain Error message when no statusMessage is present', () => {
    const result = shapeFetchError(new Error('network down'))
    expect(result).toEqual({ error: 'network down' })
  })

  it('includes body data when present', () => {
    const result = shapeFetchError({ statusCode: 500, statusMessage: 'Server Error', data: { detail: 'oops' } })
    expect(result).toEqual({ error: 'Server Error', statusCode: 500, body: { detail: 'oops' } })
  })

  it('omits retryAfterSeconds rather than leaking NaN for an HTTP-date-form Retry-After header', () => {
    const headers = new Headers({ 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })
    const result = shapeFetchError({ statusCode: 429, statusMessage: 'Too Many Requests', response: { headers } })
    expect(result).toEqual({ error: 'Too Many Requests', statusCode: 429 })
    expect(result.retryAfterSeconds).toBeUndefined()
  })
})
