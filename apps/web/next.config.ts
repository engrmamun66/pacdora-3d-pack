import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Security headers on every response. The CSP deliberately limits only framing,
 * base URI, form targets and plugins: a script-src policy needs per-request
 * nonces with this framework and is not set yet (listed in docs/PLAN.md).
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Old template address -> new one (query string such as ?p= is kept by Next).
  async redirects() {
    return [
      { source: "/templates/:slug", destination: "/template/dieline/:slug", permanent: false },
      // The dashboard and the settings page became one: /my-dashboard (settings = its Profile tab).
      { source: "/dashboard", destination: "/my-dashboard", permanent: false },
      { source: "/settings", destination: "/my-dashboard?tab=profile", permanent: false },
      // The project list lives in the dashboard (Templates tab); /projects/:id (one project) is still its own page.
      // The public list of dieline templates is gone; the templates page is its replacement.
      { source: "/dielines", destination: "/templates", permanent: false },
      { source: "/projects", destination: "/my-dashboard?tab=templates", permanent: false },
    ];
  },
  async headers() {
    // The Client's shared template pages may be shown inside this site (the Preview box of the online design page); no other site may frame anything.
    const sameOriginFrame = securityHeaders.map((h) => (h.key === "X-Frame-Options" ? { ...h, value: "SAMEORIGIN" } : h.key === "Content-Security-Policy" ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") } : h));
    const portal = "(?!doraadmin|api|_next)[A-Za-z0-9_-]{6,}";
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: `/:userHash(${portal})/templates/:templateHash`, headers: sameOriginFrame },
      { source: `/:userHash(${portal})/:linkHash/templates/:templateHash`, headers: sameOriginFrame },
      // The online design page is shown inside the admin's Template Layouts page (designs for the layout icons).
      { source: "/editor/:id", headers: sameOriginFrame },
    ];
  },
  cacheComponents: true,
  // Development only: hosts other than localhost that may load /_next assets and HMR (ngrok tunnels).
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
  // The template import sends an SVG (up to 3 MB of text) to a server action.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
