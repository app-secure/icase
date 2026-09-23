import React from "react";

// Icono de perfil de cabeza con engranajes (procesamiento / modelado de software por IA)
export default function BrainGearsIcon({ size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Contorno de cabeza humana de perfil */}
      <path d="M4 14.5c.3 0 .7.3.8.7l.5 1.5c.3.9 1.1 1.5 2 1.6V21h7.5v-2.2c2.5-1.1 4.2-3.5 4.5-6.3" />
      <path d="M4.5 14H3a.8.8 0 0 1-.8-.8c0-.4.3-.7.7-.8 1-.4 1.6-1.1 1.8-2.2C5 6.5 7.5 3 12 3c2.6 0 4.8 1.2 6.1 3" />

      {/* Engranaje principal dentro de la cabeza */}
      <circle cx="12" cy="9.5" r="2.2" />
      <path d="M12 6.2v1M12 11.8v1M8.7 9.5h1M14.3 9.5h1M9.7 7.2l.7.7M13.6 11.1l.7.7M9.7 11.8l.7-.7M13.6 7.9l.7-.7" />

      {/* Engranaje superior derecho acoplado */}
      <circle cx="17.8" cy="5.5" r="1.3" />
      <path d="M17.8 3.5v.7M17.8 6.8v.7M15.8 5.5h.7M19.1 5.5h.7" />
    </svg>
  );
}
