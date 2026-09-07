/**
 * Design system primitives.
 *
 * Vendored shadcn/ui. This tier may not import from anything above it — a
 * primitive that knows about a feature is no longer a primitive, and it takes
 * that feature's data layer into every story and every test that touches it.
 *
 * There is deliberately no barrel export here: these are re-pulled from the
 * shadcn registry file-by-file, and a barrel would have to be hand-maintained
 * against every update. Import them by path — `@/components/ui/button`.
 */
export {};
