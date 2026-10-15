// Owns: consistent monochrome interface icons, independent of platform emoji fonts.
// Failure behavior: decorative SVGs defer accessible labels to their controls.
import type { SVGProps } from "react";
const paths = {
  chats: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z",
  knowledge: "M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15",
  files: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Zm0 0v5h5M9 12h6m-6 4h6",
  graph: "M8 6h8M7 8l-3 8m13-8 3 8M7 19h10M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM6 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm16 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  attach: "m8 12 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9m-1 8-5 5a1 1 0 0 0 2 2l8-8",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8",
  chevron: "m9 5 7 7-7 7",
  plus: "M12 5v14M5 12h14",
  cloud: "M6 18a4 4 0 0 1-1-7.87 7 7 0 0 1 13.5-1.1A4.5 4.5 0 0 1 18.5 18Z",
  sun: "M12 3V1m0 22v-2M3 12H1m22 0h-2M5 5 3.5 3.5m17 17L19 19M5 19l-1.5 1.5m17-17L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  rain: "M6 14a4 4 0 0 1-1-7 6 6 0 0 1 11-1 4 4 0 0 1 2 8M8 17l-1 4m6-4-1 4m6-4-1 4",
  snow: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3",
  storm: "M6 14a4 4 0 0 1-1-7 6 6 0 0 1 11-1 4 4 0 0 1 2 8m-6-3-4 7h5l-2 5",
  fog: "M3 9h18M5 13h14M3 17h18",
  partly: "M4 9a4 4 0 1 1 7-4M3 3 2 2m4-1V0M1 7H0m7 12a4 4 0 0 1-1-7 6 6 0 0 1 11-1 4 4 0 0 1 1 8Z",
} as const;
export type IconName = keyof typeof paths;
export default function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name]} /></svg>;
}
