// server/index.d.ts
declare module 'h3' {
  interface H3EventContext {
    $toolRuntime: ToolRuntimeState;
  }
}

export {}
