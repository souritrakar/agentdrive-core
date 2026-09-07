/**
 * Types for the deep imports in `lib/xml-builder-node.ts`.
 *
 * `@aws-sdk/xml-builder` declares types only for its package root, so importing
 * `dist-es/*.js` directly — which is how the shim dodges the browser-condition
 * mapping — lands as `any` under `noImplicitAny`. Each subpath re-exports the
 * matching declaration from the root, so the shim stays fully typed.
 */

declare module "@aws-sdk/xml-builder/dist-es/XmlNode.js" {
  export { XmlNode } from "@aws-sdk/xml-builder";
}

declare module "@aws-sdk/xml-builder/dist-es/XmlText.js" {
  export { XmlText } from "@aws-sdk/xml-builder";
}

declare module "@aws-sdk/xml-builder/dist-es/xml-parser.js" {
  export { parseXML } from "@aws-sdk/xml-builder";
}
