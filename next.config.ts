import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling Node-only packages used in API routes
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],

  async headers() {
    return [
      {
        // Allow MSAL popup to retain window.opener after returning from
        // Microsoft's login page. Without this header (or with the stricter
        // "same-origin"), the browser clears window.opener on cross-origin
        // navigation, breaking acquireTokenPopup.
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      {
        // Allow Outlook on the web to render /outlook/addin in an iframe.
        // Without this, Next.js's default X-Frame-Options: SAMEORIGIN blocks the task pane.
        source: "/outlook/addin/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "frame-ancestors",
              "https://outlook.office.com",
              "https://outlook.office365.com",
              "https://outlook.live.com",
            ].join(" "),
          },
          // Legacy fallback for older webview environments (some Outlook desktop builds)
          {
            key: "X-Frame-Options",
            value: "ALLOWALL",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
