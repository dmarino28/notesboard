import Script from "next/script";
import type { ReactNode } from "react";

/**
 * Nested layout for /outlook/addin only.
 * Loads the Office.js CDN script so that Office.onReady() is available
 * in the task pane page. afterInteractive is correct here:
 * - beforeInteractive only works in the root layout in Next.js App Router
 * - readOutlookItem() is called from a useEffect, so Office.js has time
 *   to execute before the effect fires
 */
export default function AddinLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
      />
      {children}
    </>
  );
}
