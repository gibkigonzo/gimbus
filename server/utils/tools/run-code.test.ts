import { describe, it, expect } from 'vitest'
import type { ToolExecutionOptions } from 'ai'
import { runCodeTool } from './run-code'

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

function run(args: { code: string, timeoutMs?: number }) {
  return runCodeTool.execute!(args, toolOptions)
}

describe('run_code', () => {
  it('returns the value of a return statement', async () => {
    const result = await run({ code: 'return 1 + 1' }) as { result: unknown }
    expect(result.result).toBe(2)
  }, 10_000)

  it('captures console.log output as logs', async () => {
    const result = await run({ code: 'console.log("hello"); console.log("world"); return null' }) as { logs: string[] }
    expect(result.logs).toEqual(['hello', 'world'])
  }, 10_000)

  it('shapes a thrown error instead of rejecting', async () => {
    const result = await run({ code: 'throw new Error("boom")' }) as { error: string }
    expect(result.error).toBe('boom')
  }, 10_000)

  it('shapes a syntax error', async () => {
    const result = await run({ code: 'this is not js' }) as { error: string }
    expect(result.error).toBeTruthy()
  }, 10_000)

  it('kills a long-running script after the timeout and reports it', async () => {
    const result = await run({ code: 'while (true) {}', timeoutMs: 300 }) as { error: string }
    expect(result.error).toMatch(/Timed out/)
  }, 10_000)

  it('blocks filesystem access outside the playground jail', async () => {
    const result = await run({ code: 'const fs = require("node:fs"); return fs.readdirSync("/")' }) as { error: string }
    expect(result.error).toBeTruthy()
  }, 10_000)

  it('does not drop a large result/logs payload by exiting before the IPC write flushes', async () => {
    // Regression test: process.exit() right after process.send() can tear
    // down the child before an async IPC write completes for large enough
    // payloads — reproduced empirically with a few thousand log lines.
    const result = await run({
      code: 'for (let i = 0; i < 8000; i++) console.log("line " + i); return "done"'
    }) as { result: unknown, logs: string[] }
    expect(result.result).toBe('done')
    expect(result.logs).toHaveLength(8000)
    expect(result.logs[7999]).toBe('line 7999')
  }, 10_000)
})
