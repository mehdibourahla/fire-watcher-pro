import { useId } from "react";

export function BrandMark({ className = "" }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffbe28" />
          <stop offset="1" stopColor="#d61a2a" />
        </linearGradient>
      </defs>
      <path
        d="M33 7C37 17 45 23 45 33C45 43 39 51 32 51C25 51 19 45 19 35C19 29 22 25 25 22C25 29 28 31 30 30C28 22 30 13 33 7Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
