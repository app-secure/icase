import React, { useEffect, useState } from "react";

/**
 * LoadingOverlay – Pantalla de carga con spinner de puntos circulares.
 * Diseño: fondo semi-transparente + círculo de puntos animado + mensaje debajo.
 *
 * Props:
 *  - visible  (bool)   Si true, muestra la capa.
 *  - message  (string) Texto descriptivo debajo del spinner.
 */
export default function LoadingOverlay({ visible = false, message = "Cargando..." }) {
  const [shouldRender, setShouldRender] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      // Doble rAF para asegurar que el DOM se pinte antes de animar
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    } else {
      setAnimateIn(false);
      const timer = setTimeout(() => setShouldRender(false), 350);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!shouldRender) return null;

  // 12 puntos distribuidos en círculo
  const dotCount = 12;
  const radius = 28;
  const dots = Array.from({ length: dotCount }, (_, i) => {
    const angle = (i * 360) / dotCount;
    const rad = (angle * Math.PI) / 180;
    const x = 40 + radius * Math.cos(rad);
    const y = 40 + radius * Math.sin(rad);
    // Opacidad y tamaño decrecen para crear efecto de "cola"
    const opacity = 0.15 + (i / dotCount) * 0.85;
    const dotSize = 3 + (i / dotCount) * 3;
    return { x, y, opacity, dotSize, delay: i };
  });

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${
        animateIn ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ backgroundColor: "rgba(255, 255, 255, 0.82)", backdropFilter: "blur(8px)" }}
    >
      <div className={`flex flex-col items-center gap-5 transition-all duration-400 ${
        animateIn ? "opacity-100 scale-100" : "opacity-0 scale-90"
      }`}>
        {/* Spinner de puntos circulares */}
        <div className="relative w-20 h-20">
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            className="animate-spin"
            style={{ animationDuration: "1.2s" }}
          >
            {dots.map((dot, i) => (
              <circle
                key={i}
                cx={dot.x}
                cy={dot.y}
                r={dot.dotSize}
                fill="#1a1a2e"
                opacity={dot.opacity}
              />
            ))}
          </svg>
        </div>

        {/* Mensaje */}
        <p className="text-sm font-medium text-slate-700 tracking-wide font-inter text-center">
          {message}
        </p>
      </div>
    </div>
  );
}
