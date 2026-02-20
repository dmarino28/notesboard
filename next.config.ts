import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
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
