/**
 * Landing-page icons: the exact inline SVGs from the design, one component each.
 */

import type { ReactNode } from 'react';

function Stroke({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconMenu = () => (
  <Stroke>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Stroke>
);

/** Points right; mirrored in RTL by the `flip-rtl` class. */
export const IconArrow = () => (
  <Stroke className="flip-rtl">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
);

export const IconCheck = () => (
  <Stroke>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Stroke>
);

export const IconCalendarCheck = () => (
  <Stroke>
    <rect x="4" y="4" width="16" height="17" rx="3" />
    <path d="M8 2.5v3M16 2.5v3M8.5 13l2.5 2.5 4.5-5" />
  </Stroke>
);

export const IconBuilding = () => (
  <Stroke>
    <path d="M3 21h18M5 21V9l7-5 7 5v12" />
    <path d="M9 21v-6h6v6" />
  </Stroke>
);

export const IconReceipt = () => (
  <Stroke>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Stroke>
);

export const IconWallet = () => (
  <Stroke>
    <rect x="3" y="6" width="18" height="14" rx="3" />
    <path d="M3 10h18M16 15h2" />
    <path d="M6 6l9-3 1.5 3" />
  </Stroke>
);

export const IconChart = () => (
  <Stroke>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Stroke>
);

export const IconShield = () => (
  <Stroke>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
    <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
  </Stroke>
);

export const IconWhistle = () => (
  <Stroke>
    <circle cx="9" cy="14" r="5" />
    <path d="M13 11l8-4v4l-6 2.5M9 14h.01" />
  </Stroke>
);

export const IconFamily = () => (
  <Stroke>
    <circle cx="8" cy="6.5" r="2.5" />
    <circle cx="16.5" cy="9" r="2" />
    <path d="M4 20v-4.5A4 4 0 0 1 8 11.5a4 4 0 0 1 4 4V20M13.5 20v-3.5a3 3 0 0 1 6 0V20" />
  </Stroke>
);

export const IconLock = () => (
  <Stroke>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Stroke>
);

export const IconInstagram = () => (
  <Stroke>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17.5 6.5v.01" />
  </Stroke>
);

export const IconFacebook = () => (
  <Stroke>
    <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z" />
  </Stroke>
);

export const IconLinkedIn = () => (
  <Stroke>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 10v7M8 7v.01M12 17v-4a2.5 2.5 0 0 1 5 0v4M12 10v7" />
  </Stroke>
);

export const IconWhatsApp = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.2A9.7 9.7 0 0 0 3.6 16.8L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.9 2c0 1.2.9 2.4 1 2.5.1.2 1.7 2.6 4.2 3.7 1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.2z" />
  </svg>
);
