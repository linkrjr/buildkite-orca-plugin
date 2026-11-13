// `orca plugin test` runs on node:test; only its fake timers are used, by builds-view.test.tsx.
declare module 'node:test' {
  export const mock: {
    timers: {
      enable(options: { apis: ('setInterval' | 'setTimeout' | 'Date')[] }): void
      tick(ms: number): void
      reset(): void
    }
  }
}
