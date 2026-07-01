// tsconfig uses moduleResolution: "node" (Node10), which ignores a package's
// "exports" map — so tsc can't find the types for @bprogress/next's "./app"
// subpath even though Next's bundler resolves it fine at runtime. Point the type
// checker at the real declaration file the package already ships.
declare module "@bprogress/next/app" {
  export * from "@bprogress/next/dist/app"
}
