import React, { useState } from 'react';

function AnimatedWeatherIcon({ iconCode, className = "h-20 w-20", alt = "Weather icon" }) {
  const [hasError, setHasError] = useState(false);
  
  if (!iconCode) return null;

  // Use MP4 for animation, PNG for fallback
  const mp4Src = `/images/Weather-Icons/${iconCode}.mp4`;
  const pngSrc = `/images/Weather-Icons/${iconCode}.png`;

  const handleVideoError = () => {
    setHasError(true);
  };

  if (hasError) {
    // Fallback to PNG if video fails
    return (
      <img 
        src={pngSrc} 
        alt={alt} 
        className={className}
      />
    );
  }

  return (
    <video
      className={className}
      autoPlay
      loop
      muted
      playsInline
      onError={handleVideoError}
      poster={pngSrc} // Show PNG while loading
    >
      <source src={mp4Src} type="video/mp4" />
      {/* Fallback to PNG if video not supported */}
      <img src={pngSrc} alt={alt} className={className} />
    </video>
  );
}

export default AnimatedWeatherIcon;