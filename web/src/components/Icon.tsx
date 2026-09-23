/** Iconografia consistente en trazo. Sin emojis en la navegacion. */
const paths: Record<string, string> = {
  save: 'M4 4h10l4 4v12H4V4zm4 0v6h6V4M7 14h10v6H7z',
  play: 'M7 4l13 8-13 8V4z',
  docs: 'M5 3h9l5 5v13H5V3zm9 0v5h5M8 12h8M8 16h8',
  brain: 'M9 3a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 001 5 3 3 0 004 3h1V3H9zm6 0a3 3 0 013 3 3 3 0 012 5 3 3 0 01-1 5 3 3 0 01-4 3h-1V3h1z',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM3 12h2m14 0h2M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-12.8l-1.4 1.4m-10 10l-1.4 1.4',
  git: 'M6 3v12m0 0a3 3 0 103 3 3 3 0 00-3-3zm0-12a3 3 0 100 6 3 3 0 000-6zm12 6a3 3 0 100 6 3 3 0 000-6zm0 6c0 3-3 3-6 3',
  folder: 'M3 6h6l2 2h10v11H3V6z',
  folderOpen: 'M3 6h6l2 2h10v3H3V6zm0 5h18l-2 8H3v-8z',
  file: 'M6 3h8l4 4v14H6V3zm8 0v4h4',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  trash: 'M4 7h16M9 7V4h6v3m-8 0l1 14h8l1-14',
  edit: 'M4 20h4L20 8l-4-4L4 16v4z',
  refresh: 'M20 12a8 8 0 11-2.3-5.7M20 4v5h-5',
  check: 'M4 12l5 5L20 6',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zm5 12l5 5',
  fn: 'M5 20c3 0 3-16 6-16m-6 8h8m3 8l6-6m0 6l-6-6',
  warn: 'M12 3l10 18H2L12 3zm0 6v6m0 3v.5',
  terminal: 'M4 4h16v16H4V4zm3 5l3 3-3 3m5 0h5',
  history: 'M12 7v5l3 2M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4',
  link: 'M9 15l6-6M10 6l2-2a4 4 0 016 6l-2 2M14 18l-2 2a4 4 0 01-6-6l2-2',
  sun: 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2m0 18v2M4 12H2m20 0h-2M5 5L4 4m15 15l1 1M5 19l-1 1M19 5l1-1',
  moon: 'M20 14A8 8 0 019 3a8.5 8.5 0 1011 11z',
};

export function Icon({ name, size = 15 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d={paths[name] ?? paths.file} />
    </svg>
  );
}
