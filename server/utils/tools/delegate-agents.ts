export interface AgentDefinition {
  /** Short human-readable description — shown in the delegate tool schema to help the LLM choose. */
  description: string
  /** Static system prompt. Defined by the developer — never supplied by the LLM. */
  systemPrompt: string
  /** Allowed tool names for this agent. Omit to allow all registered tools except 'delegate'. */
  allowTools?: string[]
}

/**
 * Registry of predefined sub-agents available to the `delegate` tool.
 * Add entries here to expose new agent types. The LLM selects by name only —
 * it cannot modify system prompts or tool access.
 */
export const AGENT_REGISTRY: Record<string, AgentDefinition> = {
  researcher: {
    description: 'Reads and searches files, summarizes findings. Use for information gathering tasks.',
    systemPrompt: `You are a focused research agent. Your job is to find and summarize information.

Guidelines:
- Start by scanning directory structure to understand what is available
- Read relevant files and extract key information
- Search broadly before narrowing down
- Return a concise, structured summary of your findings
- Do not write or modify any files
- If you cannot find the requested information, say so clearly`,
    allowTools: ['read_text_file', 'list_directory', 'search_files', 'analyze_image']
  }
}
