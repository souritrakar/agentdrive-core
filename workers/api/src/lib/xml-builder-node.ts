/**
 * Workers-compatible replacement for the `@aws-sdk/xml-builder` entry point.
 *
 * The package's `package.json` maps `./dist-es/xml-parser` to
 * `./dist-es/xml-parser.browser` under the `browser` condition, and wrangler's
 * bundler resolves workerd as browser-like. That browser parser calls
 * `DOMParser`, which workerd does not implement, so every S3 operation that
 * reads an XML response — ListBuckets, ListObjectsV2 — failed at runtime with
 * "DOMParser is not defined" while writes and presigning worked fine.
 *
 * Importing the parser by its full filename sidesteps the mapping: the browser
 * map key is the extensionless "./dist-es/xml-parser", so "…/xml-parser.js"
 * does not match it and resolves to the dependency-free Node implementation.
 *
 * Wired up by the `alias` entry in wrangler.jsonc. Revisit if wrangler ever
 * exposes esbuild's `conditions`/`mainFields`, which would express this
 * directly.
 */

export { XmlNode } from "@aws-sdk/xml-builder/dist-es/XmlNode.js";
export { XmlText } from "@aws-sdk/xml-builder/dist-es/XmlText.js";
export { parseXML } from "@aws-sdk/xml-builder/dist-es/xml-parser.js";
