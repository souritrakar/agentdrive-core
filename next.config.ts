import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
      Phosphor ships ~9k icons behind a barrel re-export. Next optimises
      `lucide-react` out of the box but has no default entry for Phosphor, so
      without this every module that imports one icon pulls the whole set —
      which shows up as multi-second dev compiles rather than as a bundle
      regression (production tree-shaking would catch it; dev doesn't).

      The `/ssr` subpath is the one we import from everywhere: those variants
      carry no `"use client"` and read no context, so the same import works in
      Server and Client Components alike.
    */
    optimizePackageImports: ["@phosphor-icons/react/ssr"],
  },

  /*
    Share pages carry their credential in the URL.

    `Referrer-Policy: no-referrer` is therefore not hygiene, it is the control:
    without it, any cross-origin request the page ever makes — an image, a font,
    an analytics beacon added later — would send the token in a header to a
    third party. A real response header rather than only the `<meta>` tag the
    layout also sets, because the header applies before the document is parsed
    and to every response under the path, including ones that render nothing.

    `X-Robots-Tag: noindex` mirrors it: a share link is unlisted, not published.

    `Cache-Control: private, no-store` completes the set, and is deliberately
    modest in what it claims. A production build already sent `no-store` here —
    Next's own default for a dynamic route is `private, no-cache, no-store,
    max-age=0, must-revalidate` — so this fixes nothing. It makes an inherited
    guarantee an explicit one, on a path whose URL *is* the credential, so a
    future Next default cannot quietly weaken it.

    Note for anyone verifying: `next dev` emits its own `no-cache,
    must-revalidate` and this entry does not override it there. Check against
    `next start`, where the response reads exactly `private, no-store`.

    The Worker sets the same three on `/v1/shares/*` so the two surfaces cannot
    disagree about the policy.

    docs/architecture/sharing/02-public-access-security.md §6
  */
  async headers() {
    return [
      {
        source: "/share/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
