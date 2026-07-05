import { tool } from 'ai'
import { z } from 'zod'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { ToolExecContext } from '#shared/types/tool-runtime'
import { grepFile } from '../grep'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'
import { ALWAYS_ALLOWED_PREFIXES, getAllowedPlaygroundPrefixes, isPathAllowed } from '../tool-runtime/playground-scope'

const argsSchema = z.object({
  path: z.string().min(1).describe('File path within the playground directory, e.g. "playground/workflows/overview.md". Must start with "playground/".'),
  pattern: z.string().min(1).describe('Text or regex to search for within the file, matched line by line.'),
  caseInsensitive: z.boolean().optional().describe('Match case-insensitively. Defaults to false.'),
  maxResults: z.number().int().positive().optional().describe('Maximum number of matching lines to return. Defaults to 100.')
})

export const grepFilesTool = tool({
  description: 'Search for text or a regex pattern within a single file\'s contents in the playground directory, returning matching lines with line numbers. Complements read_text_file (whole file) and search_files (filename search) with content search.',
  inputSchema: argsSchema,
  execute: async (args, options) => {
    try {
      // path.normalize collapses any ".." segments first, so a traversal attempt
      // (e.g. "playground/../server/index.ts") no longer starts with "playground/"
      // and is rejected here rather than resolving outside the sandbox below.
      const normalized = path.normalize(args.path)
      if (!normalized.startsWith('playground/')) {
        return toolError('path must resolve to a location within playground/')
      }

      const chatId = (options.experimental_context as ToolExecContext | undefined)?.chatId
      const allowedPrefixes = chatId ? await getAllowedPlaygroundPrefixes(chatId) : ALWAYS_ALLOWED_PREFIXES
      if (!isPathAllowed(normalized, allowedPrefixes)) {
        return toolError(`Access to "${args.path}" is not allowed in this chat.`, {
          recovery: 'Only files under playground/workflows/ or attached to this chat are readable.'
        })
      }

      const playgroundRoot = path.resolve('playground')
      const targetAbs = path.join(playgroundRoot, normalized.slice('playground/'.length))

      const stat = await fs.stat(targetAbs).catch(() => null)
      if (!stat?.isFile()) {
        return toolError(`File not found: ${args.path}`)
      }

      const matches = await grepFile(targetAbs, args.pattern, {
        caseInsensitive: args.caseInsensitive,
        maxResults: args.maxResults
      })

      return toolSuccess({ matches, truncated: matches.length === (args.maxResults ?? 100) })
    } catch (err: unknown) {
      return toolError((err as Error).message)
    }
  }
})
