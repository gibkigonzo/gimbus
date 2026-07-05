export function resolveActiveToolNames(defaultEnabledToolNames: string[], allowTools?: string[]): string[] {
  return allowTools ?? defaultEnabledToolNames
}
