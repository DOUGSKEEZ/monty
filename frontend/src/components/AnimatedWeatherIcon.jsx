import React from 'react';

function AnimatedWeatherIcon({ iconCode, className = "h-20 w-20", alt = "Weather icon" }) {
  if (!iconCode) return null;

  // Render the animated meteocon SVG for the current conditions, matching the
  // forecast icons used across the rest of the weather page. Meteocons animate
  // natively (SMIL) inside an <img>, so we keep motion without an MP4, and their
  // self-colored gradients read correctly in both light and dark mode.
  const svgSrc = `/images/meteocons/${iconCode}.svg`;

  return (
    <img
      src={svgSrc}
      alt={alt}
      className={className}
    />
  );
}

export default AnimatedWeatherIcon;