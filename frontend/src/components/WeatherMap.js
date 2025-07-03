import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Enhanced weather tile styles - now dynamic!
const getWeatherTileStyles = (contrast, saturation) => `
  .weather-tile-enhanced img {
    filter: contrast(${contrast}%) saturate(${saturation}%) brightness(1.2) !important;
    mix-blend-mode: screen;
  }
  
  /* Mobile-friendly slider styles */
  .mobile-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 8px;
    background: #e5e7eb;
    border-radius: 5px;
    outline: none;
  }
  
  .mobile-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 24px;
    height: 24px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
  
  .mobile-slider::-moz-range-thumb {
    width: 24px;
    height: 24px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
`;

// Colorado mountain weather map component with precipitation radar
function WeatherMap() {
  const [mapError, setMapError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTileSet, setSelectedTileSet] = useState('dark');
  const mapRef = useRef(null);
  
  // Weather layer enhancement controls
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(25000);
  const [cloudOpacity, setCloudOpacity] = useState(0.8);
  const [windOpacity, setWindOpacity] = useState(0.3);
  const [precipOpacity, setPrecipOpacity] = useState(0.9);

  // Silverthorne coordinates 39.60821587173474, -106.04554769654602
  const silverthorne = [39.60821587173474, -106.04554769654602];
  const defaultZoom = 9; // Zoomed out one tick for broader view

  // Available tile sets
  const tileSets = {
    dark: {
      name: 'Dark',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    },
    light: {
      name: 'Light',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    },
    hybrid: {
      name: 'Hybrid',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    },
    terrain: {
      name: 'Terrain',
      url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://stamen.com/">Stamen Design</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    },
    topo: {
      name: 'Topographic',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
    },
    streets: {
      name: 'Streets',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  };

  const currentTileSet = tileSets[selectedTileSet];

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

  // Center map on Silverthorne
  const centerOnSilverthorne = () => {
    if (mapRef.current) {
      mapRef.current.flyTo(silverthorne, defaultZoom, {
        duration: 1.5 // Smooth animation
      });
    }
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
      {/* Inject dynamic weather tile enhancement styles */}
      <style>{getWeatherTileStyles(contrast, saturation)}</style>
      
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-xl font-semibold">
            Weather Radar
            <span className="text-sm font-normal text-gray-600 ml-4">
             {/*Summit County, CO*/}
            </span>
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(tileSets).map(([key, tileSet]) => (
            <button
              key={key}
              onClick={() => setSelectedTileSet(key)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                selectedTileSet === key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              {tileSet.name}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded border overflow-hidden" style={{ height: '550px' }}>
        {/* Center on Silverthorne button - overlay on map */}
        <button 
          onClick={centerOnSilverthorne}
          className="absolute top-2 right-2 px-3 py-2 text-sm bg-white hover:bg-gray-100 text-gray-700 rounded shadow-md border transition-colors"
          style={{ zIndex: 1000 }}
          title="Center on Silverthorne"
        >
          📍 Center
        </button>

        {/* Contrast slider - left side minimal overlay */}
        <div className="absolute left-1 bottom-20 flex flex-col items-center" style={{ zIndex: 1000 }}>
          <div className="text-xs text-white bg-black bg-opacity-50 px-1 rounded mb-1">
            Filter
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
            className="mobile-slider"
            style={{ 
              writingMode: 'bt-lr',
              WebkitAppearance: 'slider-vertical',
              width: '20px',
              height: '200px'
            }}
            orient="vertical"
          />
          <div className="text-xs text-white bg-black bg-opacity-50 px-1 rounded mt-1">
            {contrast}
          </div>
        </div>

        {/* Saturation slider - right side minimal overlay */}
        <div className="absolute right-1 bottom-20 flex flex-col items-center" style={{ zIndex: 1000 }}>
          <div className="text-xs text-white bg-black bg-opacity-50 px-1 rounded mb-1">
            Adj
          </div>
          <input
            type="range"
            min="100"
            max="50000"
            value={saturation}
            onChange={(e) => setSaturation(Number(e.target.value))}
            className="mobile-slider"
            style={{ 
              writingMode: 'bt-lr',
              WebkitAppearance: 'slider-vertical',
              width: '20px',
              height: '200px'
            }}
            orient="vertical"
          />
          <div className="text-xs text-white bg-black bg-opacity-50 px-1 rounded mt-1">
            {Math.round(saturation/1000)}k
          </div>
        </div>
        
        {isLoading && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading weather radar...</p>
            </div>
          </div>
        )}
               
        <MapContainer
          center={silverthorne}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
          whenCreated={() => setIsLoading(false)}
          ref={mapRef}
          
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
          {/* Dynamic base layer - user selectable! */}
          <TileLayer
            key={selectedTileSet} // Force re-render when tile set changes
            url={currentTileSet.url}
            attribution={currentTileSet.attribution}
            onLoad={handleTileLoad}
            onError={handleTileError}
          />
          
          {/* Cloud coverage layer */}
          <TileLayer
            url={cloudsTileUrl}
            opacity={cloudOpacity} // User controllable
            onLoad={handleCloudTileLoad}
            onError={handleTileError}
            className="weather-tile-enhanced"
            zIndex={400} // Ensure weather layers stay on top
          />
          
          {/* Wind layer */}
          <TileLayer
            url={windTileUrl}
            opacity={windOpacity} // User controllable
            onLoad={handleWindTileLoad}
            onError={handleTileError}
            className="weather-tile-enhanced"
            zIndex={500} // Ensure weather layers stay on top
          />
          
          {/* Precipitation radar overlay (on top for visibility) */}
          <TileLayer
            url={precipitationTileUrl}
            opacity={precipOpacity} // User controllable
            onLoad={handlePrecipTileLoad}
            onError={handleTileError}
            className="weather-tile-enhanced"
            zIndex={600} // Highest priority for precipitation
          />
          
          {/* Hybrid labels layer - only for hybrid map style */}
          {selectedTileSet === 'hybrid' && currentTileSet.labelsUrl && (
            <TileLayer
              key={`${selectedTileSet}-labels`}
              url={currentTileSet.labelsUrl}
              attribution={currentTileSet.attribution}
              onLoad={handleTileLoad}
              onError={handleTileError}
              zIndex={700} // Above everything for readability
            />
          )}
          
        </MapContainer>
      </div>
      
      {/* Layer Opacity Controls - right below map for live adjustment */}
      <div className="mt-2 pt-1 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
          <div className="py-1">
            <label className="block text-xs text-gray-600 mb-1">
              Clouds Opacity: {Math.round(cloudOpacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={cloudOpacity}
              onChange={(e) => setCloudOpacity(Number(e.target.value))}
              className="mobile-slider w-full"
            />
          </div>
          
          <div className="py-1">
            <label className="block text-xs text-gray-600 mb-1">
              Wind Opacity: {Math.round(windOpacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={windOpacity}
              onChange={(e) => setWindOpacity(Number(e.target.value))}
              className="mobile-slider w-full"
            />
          </div>
          
          <div className="py-1">
            <label className="block text-xs text-gray-600 mb-1">
              Precipitation Opacity: {Math.round(precipOpacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={precipOpacity}
              onChange={(e) => setPrecipOpacity(Number(e.target.value))}
              className="mobile-slider w-full"
            />
          </div>
        </div>
      </div>
      
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        <span>🔄 Updates every 5 minutes with current conditions</span>
        <span>Powered by OpenWeatherMap</span>
      </div>
    </div>
  );
}

export default WeatherMap;