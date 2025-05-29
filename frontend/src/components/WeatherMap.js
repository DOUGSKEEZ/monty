import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Colorado mountain weather map component with precipitation radar
function WeatherMap() {
  const [mapError, setMapError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Updated coordinates for better weather view
  const center = [39.66236764276292, -105.82800887016899];
  const defaultZoom = 9; // Zoomed out one tick for broader view

  // Handle map load events
  useEffect(() => {
    // Set loading to false after a brief delay to allow tiles to start loading
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Custom tile URLs pointing to our secure backend proxy
  const precipitationTileUrl = `http://192.168.0.15:3001/api/weather/map-tile/precipitation_new/{z}/{x}/{y}`;
  const cloudsTileUrl = `http://192.168.0.15:3001/api/weather/map-tile/clouds_new/{z}/{x}/{y}`;
  const windTileUrl = `http://192.168.0.15:3001/api/weather/map-tile/wind_new/{z}/{x}/{y}`;
  
  // Dark base map tile layer for better weather visibility
  const baseMapUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  const handleTileError = (error) => {
    console.error('Map tile loading error:', error);
    setMapError('Unable to load weather map tiles. Please check your connection.');
  };

  const handleTileLoad = (e) => {
    console.log('Tile loaded successfully:', e);
    setMapError(null);
    setIsLoading(false);
  };

  const handlePrecipTileLoad = (e) => {
    console.log('🌧️ Precipitation tile loaded:', e);
    setMapError(null);
    setIsLoading(false);
  };

  const handleCloudTileLoad = (e) => {
    console.log('☁️ Cloud tile loaded:', e);
    setMapError(null);
    setIsLoading(false);
  };

  const handleWindTileLoad = (e) => {
    console.log('💨 Wind tile loaded:', e);
    setMapError(null);
    setIsLoading(false);
  };

  if (mapError) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mt-6">
        <h3 className="text-xl font-semibold mb-4">Precipitation Map</h3>
        <div className="flex items-center justify-center h-96 bg-gray-100 rounded">
          <div className="text-center">
            <p className="text-red-600 mb-2">⚠️ Map Unavailable</p>
            <p className="text-sm text-gray-600">{mapError}</p>
            <button 
              onClick={() => {
                setMapError(null);
                setIsLoading(true);
              }}
              className="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-6">
      <h3 className="text-xl font-semibold mb-4">
        Local Weather Radar
        <span className="text-sm font-normal text-gray-600 ml-2">
          📍 Silverthorne, CO area
        </span>
      </h3>
      
      <div className="relative rounded border overflow-hidden" style={{ height: '350px' }}>
        {isLoading && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading weather radar...</p>
            </div>
          </div>
        )}
        
        <MapContainer
          center={center}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
          whenCreated={() => setIsLoading(false)}
          
          // Interactive map with full user controls
          dragging={true}                // Allow panning
          zoomControl={true}             // Show zoom buttons  
          scrollWheelZoom={true}         // Allow scroll zoom
          doubleClickZoom={true}         // Allow double-click zoom
          touchZoom={true}               // Allow pinch zoom
          boxZoom={true}                 // Allow box selection zoom
          keyboard={true}                // Allow keyboard controls
          attributionControl={true}      // Show attribution
        >
          {/* Dark base map layer for better weather contrast */}
          <TileLayer
            url={baseMapUrl}
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            onLoad={handleTileLoad}
            onError={handleTileError}
          />
          
          {/* Cloud coverage layer */}
          <TileLayer
            url={cloudsTileUrl}
            opacity={0.4} // Subtle cloud layer underneath
            onLoad={handleCloudTileLoad}
            onError={handleTileError}
          />
          
          {/* Wind layer */}
          <TileLayer
            url={windTileUrl}
            opacity={0.7} // Wind patterns
            onLoad={handleWindTileLoad}
            onError={handleTileError}
          />
          
          {/* Precipitation radar overlay (on top for visibility) */}
          <TileLayer
            url={precipitationTileUrl}
            opacity={1.0} // SUPER CONTRASTED - full opacity for maximum visibility
            onLoad={handlePrecipTileLoad}
            onError={handleTileError}
          />
        </MapContainer>
      </div>
      
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        <span>🔄 Updates every 5 minutes with current conditions</span>
        <span>Powered by OpenWeatherMap</span>
      </div>
    </div>
  );
}

export default WeatherMap;