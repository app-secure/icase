import React from "react";

export default function RbixLogo({ size = "md", showText = true, isDark = false, className = "" }) {
  const dimMap = {
    sm: { iconSize: 28, textSize: "text-xl", gap: "gap-1" },
    md: { iconSize: 36, textSize: "text-2xl", gap: "gap-1.5" },
    lg: { iconSize: 48, textSize: "text-3xl", gap: "gap-1.5" },
    xl: { iconSize: 58, textSize: "text-4xl", gap: "gap-2" }
  };

  const { iconSize, textSize, gap } = dimMap[size] || dimMap.md;

  return (
    <div className={`inline-flex items-center ${gap} select-none ${className}`}>
      {/* SVG Icon matching RBIX: Perfect symmetric circle with top dot and centered 'x' */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Top Purple Dot centered right above the gap */}
        <circle cx="50" cy="13" r="5" fill="#7C3AED" />

        {/* Circular Open Ring with gap at top:
            Center is (50, 54), radius R = 30.
            Top-right endpoint: (50 + 18, 54 - 24) = (68, 30).
            Top-left endpoint: (50 - 18, 54 - 24) = (32, 30).
            Since 18^2 + 24^2 = 324 + 576 = 900 = 30^2, endpoints lie exactly on the circle!
        */}
        <path
          d="M 68 30 A 30 30 0 1 1 32 30"
          stroke="#7C3AED"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />

        {/* Olive Green Inner 'x' perfectly centered at (50, 54) */}
        <line
          x1="38"
          y1="42"
          x2="62"
          y2="66"
          stroke="#2E5A1C"
          strokeWidth="7.5"
          strokeLinecap="round"
        />
        <line
          x1="62"
          y1="42"
          x2="38"
          y2="66"
          stroke="#2E5A1C"
          strokeWidth="7.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Brand Typography: RBIX */}
      {showText && (
        <span
          className={`font-black tracking-tight leading-none ${textSize} ${
            isDark ? "text-white" : "text-[#18181b]"
          }`}
          style={{ letterSpacing: "-0.03em" }}
        >
          RBIX
        </span>
      )}
    </div>
  );
}
