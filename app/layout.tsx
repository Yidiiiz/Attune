// Owns: the app shell — html attributes, the theme, and the top bar around every page.
// It reads settings directly rather than through an API route: this is a route-level server file,
// the same category as an API adapter, and a layout that fetched its own theme over HTTP from
// itself would not be the boring option. The rule in PROJECT.md §3 governs components/.
//
// Failure behavior: readSettings never throws (it repairs instead), so the worst case is the light
// base theme on a page that otherwise works.

import type { Metadata } from "next";
import Tabs from "@/components/shell/Tabs";
import ToastHost from "@/components/shell/Toast";
import { readSettings } from "@/lib/store/settings";
import "./theme.css";

export const metadata: Metadata = {
  title: "Attune",
  description: "A personal to-do and scheduling app whose state is plain files.",
};

export const dynamic = "force-dynamic"; // settings live on disk and change under the server

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await readSettings();

  return (
    <html lang="en" data-theme={settings.theme}>
      <body>
        <Tabs />
        <main>{children}</main>
        <ToastHost />
      </body>
    </html>
  );
}
