import { fork } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'

const PLAYGROUND_DIR = path.resolve(process.cwd(), 'playground')
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 60_000

interface WorkerMessage {
  ok: boolean
  result?: unknown
  error?: string
  logs: string[]
}

/**
 * Written to a fresh temp file per call (instead of shipping a static sibling
 * .mjs) so the path doesn't depend on surviving Nitro's build/rollup step —
 * it works identically in dev and in a production build.
 */
const WORKER_HARNESS = `
process.on('message', async ({ code }) => {
  const logs = []
  const originalLog = console.log
  console.log = (...args) => { logs.push(args.map(String).join(' ')) }
  // process.send() writes over IPC asynchronously — exiting right after
  // calling it (without waiting for its callback) can terminate the process
  // before the message is actually flushed, silently dropping it for
  // anything but the smallest payloads. Only exit once send's own callback
  // confirms the write went out.
  const finish = (payload) => {
    console.log = originalLog
    process.send(payload, () => process.exit(0))
  }
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const fn = new AsyncFunction(code)
    const result = await fn()
    finish({ ok: true, result: result === undefined ? null : result, logs })
  } catch (err) {
    finish({ ok: false, error: err instanceof Error ? err.message : String(err), logs })
  }
})
`

const argsSchema = z.object({
  code: z.string().min(1).describe('JavaScript to run in an isolated Node child process. cwd is playground/, so relative fs paths (via require("node:fs")) target it directly — filesystem access outside playground/ is blocked at the OS level. The value of an explicit "return" statement becomes the result. Use console.log for progress output, returned separately as "logs".'),
  timeoutMs: z.number().int().positive().max(MAX_TIMEOUT_MS).optional().describe(`Wall-clock timeout in ms (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`)
})

export const runCodeTool = tool({
  description: 'Run a JavaScript snippet in an isolated Node child process (cwd = playground/, filesystem access outside it is blocked by Node\'s Permission Model). Use for computation, data transforms, or bulk file operations that would be unreliable to do by hand-generating text. Network access is NOT restricted by this sandbox — never run untrusted/externally-sourced code with it.',
  inputSchema: argsSchema,
  execute: async (args) => {
    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let workerDir: string | undefined

    try {
      // The worker file must itself be inside the Permission Model's allowed
      // fs-read path — Node needs to read its own entry module — so it's
      // created under playground/ rather than the OS tmpdir.
      const sandboxTmpRoot = path.join(PLAYGROUND_DIR, '.run-code-tmp')
      await mkdir(sandboxTmpRoot, { recursive: true })
      workerDir = await mkdtemp(path.join(sandboxTmpRoot, 'run-'))
      const workerPath = path.join(workerDir, 'worker.mjs')
      await writeFile(workerPath, WORKER_HARNESS, 'utf-8')

      return await new Promise<ReturnType<typeof toolSuccess> | ReturnType<typeof toolError>>((resolve) => {
        const child = fork(workerPath, [], {
          cwd: PLAYGROUND_DIR,
          execArgv: [
            '--experimental-permission',
            `--allow-fs-read=${PLAYGROUND_DIR}`,
            `--allow-fs-write=${PLAYGROUND_DIR}`,
            '--max-old-space-size=256'
          ],
          stdio: ['ignore', 'ignore', 'ignore', 'ipc']
        })

        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve(toolError(`Timed out after ${timeoutMs}ms`, { recovery: 'Reduce the workload or split it into smaller steps.' }))
        }, timeoutMs)

        child.once('message', (msg: WorkerMessage) => {
          clearTimeout(timer)
          child.kill()
          if (msg.ok) resolve(toolSuccess({ result: msg.result ?? null, logs: msg.logs }))
          else resolve(toolError(msg.error ?? 'Unknown error', { diagnostics: { logs: msg.logs } }))
        })

        child.once('error', (err) => {
          clearTimeout(timer)
          resolve(toolError(err.message))
        })

        child.once('exit', (exitCode, signal) => {
          clearTimeout(timer)
          if (exitCode !== 0 && exitCode !== null) {
            resolve(toolError(`Process exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}`))
          }
        })

        child.send({ code: args.code })
      })
    } catch (err: unknown) {
      return toolError(err instanceof Error ? err.message : 'Failed to run code')
    } finally {
      if (workerDir) await rm(workerDir, { recursive: true, force: true }).catch(() => {})
    }
  }
})
