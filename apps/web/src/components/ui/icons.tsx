export function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="m3.5 5.5 6.5 5 6.5-5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect
        x="4"
        y="9"
        width="12"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3.5 17c1-3.5 4-5 6.5-5s5.5 1.5 6.5 5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="m17 17-3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path
        d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.97-4.33 2.97-7.31Z"
        fill="#4285F4"
      />
      <path
        d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20Z"
        fill="#34A853"
      />
      <path
        d="M4.41 11.9a6 6 0 0 1 0-3.8V5.51H1.06a10 10 0 0 0 0 8.98l3.35-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M10 3.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0 10 10 0 0 0 1.06 5.51L4.41 8.1C5.2 5.74 7.4 3.98 10 3.98Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 170 170"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.69-7.85-12.01-14.42-6.11-9.37-10.9-19.98-14.37-31.84-3.48-11.85-5.22-23.01-5.22-33.47 0-14.28 3.56-25.79 10.68-34.54 7.12-8.74 16.03-13.25 26.74-13.52 4.13 0 9.07 1.16 14.82 3.48 5.75 2.32 9.53 3.53 11.35 3.63 2.03-.1 5.92-1.37 11.66-3.81 5.75-2.44 10.43-3.53 14.05-3.27 10.63.76 19.38 4.67 26.24 11.75-9.35 5.66-13.9 13.6-13.65 23.82.35 8.78 3.73 15.93 10.14 21.46 6.41 5.53 13.88 8.78 22.41 9.75-2.22 6.78-4.73 13.06-7.53 18.84zM119.22 33.02c0-7.39 2.67-14.24 8.01-20.55 5.34-6.31 11.89-10.49 19.65-12.54-.15 1.52-.3 3.03-.45 4.54-.45 7.12-3.23 13.66-8.33 19.62-5.11 5.96-11.41 9.55-18.88 10.77-.15-.61-.22-1.22-.22-1.84z" />
    </svg>
  );
}

export function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 9.5 10 4l7 5.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 8.5V16h10V8.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CompassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="m12.5 7.5-1.8 4.3-4.2 1.7 1.8-4.3 4.2-1.7Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RadioIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M6 6c-2.2 2.2-2.2 5.8 0 8M14 6c2.2 2.2 2.2 5.8 0 8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UsersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.5 16c.7-2.8 2.4-4.3 4.5-4.3s3.8 1.5 4.5 4.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M12.5 12.3c1.7.2 2.9 1.5 3.4 3.7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4.5A1.5 1.5 0 0 1 3 11.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect
        x="3"
        y="4"
        width="4"
        height="12"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="8.5"
        y="4"
        width="4"
        height="12"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="m14.5 5 2.5 10.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10 3v1.5M10 15.5V17M17 10h-1.5M4.5 10H3M14.8 5.2l-1 1M6.2 13.8l-1 1M14.8 14.8l-1-1M6.2 6.2l-1-1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HeadphonesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 11v-1a6 6 0 0 1 12 0v1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect
        x="2.5"
        y="11"
        width="3.2"
        height="5"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="14.3"
        y="11"
        width="3.2"
        height="5"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

export function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 8a4 4 0 0 1 8 0c0 3 1 4 1 4H5s1-1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 14.5a1.5 1.5 0 0 0 3 0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
