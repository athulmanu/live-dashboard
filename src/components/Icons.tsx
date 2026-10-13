import type { SVGProps } from 'react';

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const PauseIcon = () => (
  <Icon>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M7 5v14l11-7z" />
  </Icon>
);

export const RetryIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 4v5h-5" />
  </Icon>
);

export const FilterIcon = () => (
  <Icon width="22" height="22">
    <path d="M3 5h18l-7 8v6l-4-2v-4z" />
  </Icon>
);

export const OfflineIcon = () => (
  <Icon width="22" height="22">
    <path d="M2 9a16 16 0 0 1 4-2.6M10.7 5.1A16 16 0 0 1 22 9" />
    <path d="M5 12.5a10 10 0 0 1 5.2-2.7M14.8 10a10 10 0 0 1 4.2 2.5" />
    <path d="M8.5 16a5 5 0 0 1 7 0" />
    <path d="M12 20h.01" />
    <path d="M3 3l18 18" />
  </Icon>
);

export const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const PulseIcon = () => (
  <Icon width="20" height="20">
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Icon>
);
