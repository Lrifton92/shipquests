"use client";
// App Router template: remounts on every route change (unlike layout), so this
// wrapper replays the .page-enter animation for a marked transition on each nav.
// Overlays/modals in this app render inline within their <main>, but the page
// transition is fade+translateY only and settles to `transform: none`, so no
// `position: fixed` containing-block trap is created at rest.
import { usePathname } from "next/navigation";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
