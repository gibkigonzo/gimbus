// server/index.d.ts
declare module 'h3' {
  interface H3EventContext {
    $toolRuntime: ToolRuntimeState
  }
}

// Assigned synchronously (before any await) by server/plugins/tool-runtime.ts
// on the shared NitroApp instance — the process-wide injection point for
// anything that needs the same tool set outside a request's H3EventContext,
// e.g. a scheduled task (server/tasks/agent/scheduled-run.ts), via
// useNitroApp().toolRuntimePromise. A Promise, not a resolved snapshot,
// because Nitro's plugin loader never awaits a plugin's async body — reading
// a plain (possibly still-undefined) value would race process startup;
// awaiting the promise instead always resolves once the build finishes,
// however early it's read.
declare module 'nitropack/types' {
  interface NitroApp {
    toolRuntimePromise: Promise<ToolRuntimeState>
  }
}

export {}
