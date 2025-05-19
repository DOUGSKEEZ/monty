import React, { useState } from 'react';
import { useAppContext } from '../utils/AppContext';
import ShadeControl, { ShadeGroupControl, RoomControl } from '../components/ShadeControl';

function ShadesPage() {
  const { shades, actions } = useAppContext();
  const [activeRoom, setActiveRoom] = useState('Main Level');
  
  // Helper to get shades for the current active room
  const getRoomShades = () => {
    // Default shades for different rooms if the configuration is not available
    const defaultShades = {
      'Main Level': {
        solarShades: [
          { id: 28, name: 'Main Level Solar', type: 'Solar', room: 'Main Level', location: 'All' }
        ],
        privacyShades: [
          { id: 14, name: 'Main Level Privacy', type: 'Privacy', room: 'Main Level', location: 'All' }
        ],
        blackoutShades: []
      },
      'Bedroom': {
        solarShades: [],
        privacyShades: [
          { id: 44, name: 'Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'All' }
        ],
        blackoutShades: [
          { id: 42, name: 'Bedroom Blackout', type: 'Blackout', room: 'Bedroom', location: 'All' },
        ]
      },
      'Office': {
        solarShades: [
          { id: 36, name: 'Office Solar', type: 'Solar', room: 'Office', location: 'All' }
        ],
        privacyShades: [
          { id: 33, name: 'Office Privacy', type: 'Privacy', room: 'Office', location: 'All' }
        ],
        blackoutShades: []
      },
      'Loft': {
        solarShades: [],
        privacyShades: [],
        blackoutShades: [
          { id: 48, name: 'Loft Blackout', type: 'Blackout', room: 'Loft', location: 'All' }
        ]
      }
    };
    
    if (shades.loading || !shades.config || !shades.config.shades) {
      // Return default shades for the active room
      return defaultShades[activeRoom] || { solarShades: [], privacyShades: [], blackoutShades: [] };
    }
    
    // Filter shades for the selected room
    const roomShades = shades.config.shades.filter(
      shade => shade.room === activeRoom
    );
    
    // If no shades are found for the room, use defaults
    if (roomShades.length === 0 && defaultShades[activeRoom]) {
      return defaultShades[activeRoom];
    }
    
    // Group shades by type
    const solarShades = roomShades.filter(shade => shade.type === 'Solar');
    const privacyShades = roomShades.filter(shade => shade.type === 'Privacy');
    const blackoutShades = roomShades.filter(shade => shade.type === 'Blackout');
    
    return { solarShades, privacyShades, blackoutShades };
  };
  
  // Group shades by location for a given type
  const getShadesByLocationAndType = (shades, type) => {
    // Filter for the specified type
    const typedShades = shades.filter(shade => shade.type === type);
    
    // Group by location
    const locationGroups = {};
    
    typedShades.forEach(shade => {
      const location = shade.location || 'Unknown';
      if (location === 'All') return; // Skip "All" shades
      
      if (!locationGroups[location]) {
        locationGroups[location] = [];
      }
      locationGroups[location].push(shade);
    });
    
    return locationGroups;
  };
  
  // Get the room list from shade config
  const getRooms = () => {
    if (shades.loading || !shades.config || !shades.config.shades) {
      // Return all four room types even if config isn't loaded yet
      return ['Main Level', 'Bedroom', 'Office', 'Loft'];
    }
    
    // Extract unique room names
    const roomSet = new Set(shades.config.shades.map(shade => shade.room));
    
    // If any of the main rooms are missing from the config, ensure they are added
    const rooms = Array.from(roomSet);
    const requiredRooms = ['Main Level', 'Bedroom', 'Office', 'Loft'];
    
    for (const required of requiredRooms) {
      if (!rooms.includes(required)) {
        rooms.push(required);
      }
    }
    
    return rooms;
  };
  
  // Get unique locations for the active room
  const getLocations = (room) => {
    if (shades.loading || !shades.config || !shades.config.shades) {
      return [];
    }
    
    // Extract unique locations for the given room
    const roomShades = shades.config.shades.filter(shade => shade.room === room);
    const locations = roomShades
      .map(shade => shade.location)
      .filter(location => location && location !== 'All'); // Filter out 'All' and null/undefined
    
    // Get unique locations
    return [...new Set(locations)];
  };
  
  // Handle scene triggers
  const triggerScene = async (scene) => {
    try {
      await actions.triggerShadeScene(scene);
    } catch (error) {
      console.error(`Error triggering scene ${scene}:`, error);
    }
  };
  
  const rooms = getRooms();
  const { solarShades, privacyShades, blackoutShades } = getRoomShades();
  const locations = getLocations(activeRoom);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Shade Control</h1>
      
      {/* Error Display */}
      {shades.error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Could not load shade configuration. Please check your connection.
        </div>
      )}
      
      {/* Loading Indicator */}
      {shades.loading && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          Loading shade configuration...
        </div>
      )}
      
      {/* Global Scene Controls */}
      <div className="bg-white p-4 rounded shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Quick Scenes</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col space-y-2">
            <button 
              onClick={() => triggerScene('good-morning')}
              className="bg-yellow-500 hover:bg-yellow-600 text-white py-3 px-4 rounded"
            >
              Good Morning
            </button>
            <p className="text-sm text-gray-600 px-1">
              Raises main floor privacy shades to let morning light.
            </p>
          </div>
          <div className="flex flex-col space-y-2">
            <button 
              onClick={() => triggerScene('good-afternoon')}
              className="bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded"
            >
              Good Afternoon
            </button>
            <p className="text-sm text-gray-600 px-1">
              Lowers solar shades in main floor and office to occlude afternoon sun.
            </p>
          </div>
          <div className="flex flex-col space-y-2">
            <button 
              onClick={() => triggerScene('good-evening')}
              className="bg-orange-500 hover:bg-orange-600 text-white py-3 px-4 rounded"
            >
              Good Evening
            </button>
            <p className="text-sm text-gray-600 px-1">
              Raises solar shades to enjoy the sunset views.
            </p>
          </div>
          <div className="flex flex-col space-y-2">
            <button 
              onClick={() => triggerScene('good-night')}
              className="bg-indigo-500 hover:bg-indigo-600 text-white py-3 px-4 rounded"
            >
              Good Night
            </button>
            <p className="text-sm text-gray-600 px-1">
              Lowers all privacy shades throughout the house for nighttime.
            </p>
          </div>
        </div>
      </div>
      
      {/* Room Tabs */}
      <div className="flex mb-4 border-b overflow-x-auto">
        {rooms.map(room => (
          <button
            key={room}
            className={`py-2 px-4 mr-2 font-medium border-b-2 whitespace-nowrap ${
              activeRoom === room
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent hover:border-gray-300'
            }`}
            onClick={() => setActiveRoom(room)}
          >
            {room}
          </button>
        ))}
      </div>
      
      {/* Room Control */}
      <div className="bg-white p-3 rounded shadow mb-4">
        {/* "All" Room Type Controls - Top row, original sizing */}
        <div className="bg-gray-100 p-3 rounded-lg mb-4">
          <div className="flex justify-center flex-wrap gap-4">
            {/* Solar Type ALL Control */}
            {(activeRoom === 'Main Level' || activeRoom === 'Office') && solarShades.some(s => s.location === 'All') && (
              <div className="p-3 border rounded flex flex-col items-center">
                <span className="font-medium mb-2">ALL Solar Shades</span>
                <div className="flex flex-col items-center space-y-2">
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-solar-up`)}
                    title={`Raise all ${activeRoom} solar shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-solar-stop`)}
                    title={`Stop all ${activeRoom} solar shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-solar-down`)}
                    title={`Lower all ${activeRoom} solar shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* Privacy Type ALL Control */}
            {(activeRoom === 'Main Level' || activeRoom === 'Bedroom' || activeRoom === 'Office') && privacyShades.some(s => s.location === 'All') && (
              <div className="p-3 border rounded flex flex-col items-center">
                <span className="font-medium mb-2">ALL Privacy Shades</span>
                <div className="flex flex-col items-center space-y-2">
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-privacy-up`)}
                    title={`Raise all ${activeRoom} privacy shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-privacy-stop`)}
                    title={`Stop all ${activeRoom} privacy shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-privacy-down`)}
                    title={`Lower all ${activeRoom} privacy shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* Blackout Type ALL Control */}
            {(activeRoom === 'Bedroom') && blackoutShades.some(s => s.location === 'All') && (
              <div className="p-3 border rounded flex flex-col items-center">
                <span className="font-medium mb-2">ALL Blackout Shades</span>
                <div className="flex flex-col items-center space-y-2">
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-blackout-up`)}
                    title={`Raise all ${activeRoom} blackout shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-blackout-stop`)}
                    title={`Stop all ${activeRoom} blackout shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-blackout-down`)}
                    title={`Lower all ${activeRoom} blackout shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* If no specific type controls, show a single ALL control */}
            {activeRoom === 'Loft' && (
              <div className="p-3 border rounded flex flex-col items-center">
                <span className="font-medium mb-2">ALL Loft Shades</span>
                <div className="flex flex-col items-center space-y-2">
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-up`)}
                    title={`Raise all ${activeRoom} shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-stop`)}
                    title={`Stop all ${activeRoom} shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-down`)}
                    title={`Lower all ${activeRoom} shades`}
                    className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Individual Window Controls */}
        <div className="mt-6">
          {/* Main Level Location Groups */}
          {activeRoom === 'Main Level' && (
            <div className="space-y-0">
              {/* Kitchen Section - More compact */}
              <div className="bg-gray-50 p-3 rounded shadow mb-4">
                <h3 className="text-md font-semibold mb-2">Kitchen</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {/* Combined Windows */}
                  {(() => {
                    // Get all unique kitchen locations (excluding Dining Table)
                    const kitchenSolarShades = solarShades.filter(shade => 
                      shade.location?.includes('Kitchen') && 
                      shade.location !== 'All' && 
                      !shade.location.includes('Dining Table')
                    );
                    const kitchenPrivacyShades = privacyShades.filter(shade => 
                      shade.location?.includes('Kitchen') && 
                      shade.location !== 'All' && 
                      !shade.location.includes('Dining Table')
                    );
                    
                    // Get all unique locations
                    const allLocations = new Set([
                      ...kitchenSolarShades.map(s => s.location),
                      ...kitchenPrivacyShades.map(s => s.location)
                    ]);
                    
                    return Array.from(allLocations).map(location => {
                      // Find solar and privacy shades for this location
                      const solar = kitchenSolarShades.find(s => s.location === location);
                      const privacy = kitchenPrivacyShades.find(s => s.location === location);
                      
                      // Extract just the location name without "Kitchen" prefix
                      const shortName = location.replace('Kitchen', '').trim();
                      
                      return (
                        <div key={location} className="border rounded p-1">
                          <h4 className="font-medium text-center text-xs mb-0.5">{shortName}</h4>
                          
                          {/* Only render if we have either shade type */}
                          {(solar || privacy) && (
                            <div className="flex justify-center gap-2">
                              {/* Solar shade controls */}
                              {solar && (
                                <div>
                                  <p className="text-xs mb-0.5 text-center">Solar</p>
                                  <div className="flex flex-col items-center space-y-1">
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'up')}
                                      title={`Raise ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'stop')}
                                      title={`Stop ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'down')}
                                      title={`Lower ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                              
                              {/* Privacy shade controls */}
                              {privacy && (
                                <div>
                                  <p className="text-xs mb-0.5 text-center">Privacy</p>
                                  <div className="flex flex-col items-center space-y-1">
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'up')}
                                      title={`Raise ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'stop')}
                                      title={`Stop ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'down')}
                                      title={`Lower ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              
              {/* Great Room Section - More compact */}
              <div className="bg-gray-50 p-3 rounded shadow mb-4">
                <h3 className="text-md font-semibold mb-2">Great Room</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {/* Combined Windows */}
                  {(() => {
                    // Get all unique great room locations
                    const greatRoomSolarShades = solarShades.filter(shade => 
                      shade.location?.includes('Great Room') && shade.location !== 'All'
                    );
                    const greatRoomPrivacyShades = privacyShades.filter(shade => 
                      shade.location?.includes('Great Room') && shade.location !== 'All'
                    );
                    
                    // Get all unique locations
                    const allLocations = new Set([
                      ...greatRoomSolarShades.map(s => s.location),
                      ...greatRoomPrivacyShades.map(s => s.location)
                    ]);
                    
                    return Array.from(allLocations).map(location => {
                      // Find solar and privacy shades for this location
                      const solar = greatRoomSolarShades.find(s => s.location === location);
                      const privacy = greatRoomPrivacyShades.find(s => s.location === location);
                      
                      // Extract just the location name without "Great Room" prefix
                      const shortName = location.replace('Great Room', '').trim().replace(/^- /, '');
                      
                      return (
                        <div key={location} className="border rounded p-1">
                          <h4 className="font-medium text-center text-xs mb-0.5">{shortName}</h4>
                          
                          {/* Only render if we have either shade type */}
                          {(solar || privacy) && (
                            <div className="flex justify-center gap-2">
                              {/* Solar shade controls */}
                              {solar && (
                                <div>
                                  <p className="text-xs mb-0.5 text-center">Solar</p>
                                  <div className="flex flex-col items-center space-y-1">
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'up')}
                                      title={`Raise ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'stop')}
                                      title={`Stop ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'down')}
                                      title={`Lower ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                              
                              {/* Privacy shade controls */}
                              {privacy && (
                                <div>
                                  <p className="text-xs mb-0.5 text-center">Privacy</p>
                                  <div className="flex flex-col items-center space-y-1">
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'up')}
                                      title={`Raise ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'stop')}
                                      title={`Stop ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'down')}
                                      title={`Lower ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              
              {/* Dining & Laundry Section - More compact */}
              <div className="bg-gray-50 p-3 rounded shadow mb-4">
                <h3 className="text-md font-semibold mb-2">Dining & Laundry</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {/* Combined Windows */}
                  {(() => {
                    // Get all unique dining and laundry locations
                    const diningRoomSolarShades = solarShades.filter(shade => 
                      (shade.location?.includes('Dining') || shade.location?.includes('Laundry') || 
                       shade.location?.includes('Dining Table') || shade.location?.includes('Pantry')) && 
                      shade.location !== 'All'
                    );
                    const diningRoomPrivacyShades = privacyShades.filter(shade => 
                      (shade.location?.includes('Dining') || shade.location?.includes('Laundry') || 
                       shade.location?.includes('Dining Table') || shade.location?.includes('Pantry')) && 
                      shade.location !== 'All'
                    );
                    
                    // Get all unique locations
                    const allLocations = new Set([
                      ...diningRoomSolarShades.map(s => s.location),
                      ...diningRoomPrivacyShades.map(s => s.location)
                    ]);
                    
                    return Array.from(allLocations).map(location => {
                      // Find solar and privacy shades for this location
                      const solar = diningRoomSolarShades.find(s => s.location === location);
                      const privacy = diningRoomPrivacyShades.find(s => s.location === location);
                      
                      // Extract just the location name without prefix
                      let shortName = location;
                      if (location.includes('Kitchen Dining Table')) {
                        shortName = 'Dining Table';
                      } else if (location.includes('Dining')) {
                        shortName = location.replace('Dining', '').trim();
                      } else if (location.includes('Laundry')) {
                        shortName = location.replace('Laundry', '').trim();
                      }
                      
                      return (
                        <div key={location} className="border rounded p-1">
                          <h4 className="font-medium text-center text-xs mb-0.5">{shortName}</h4>
                          
                          {/* Only render if we have either shade type */}
                          {(solar || privacy) && (
                            <div className="flex justify-center gap-2">
                              {/* Solar shade controls */}
                              {solar && (
                                <div>
                                  <p className="text-xs mb-0.5 text-center">Solar</p>
                                  <div className="flex flex-col items-center space-y-1">
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'up')}
                                      title={`Raise ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'stop')}
                                      title={`Stop ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(solar.id, 'down')}
                                      title={`Lower ${location} solar shade`}
                                      className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                              
                              {/* Privacy shade controls */}
                              {privacy && (
                                <div>
                                  <p className="text-xs mb-0.5 text-center">Privacy</p>
                                  <div className="flex flex-col items-center space-y-1">
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'up')}
                                      title={`Raise ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'stop')}
                                      title={`Stop ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => actions.controlShade(privacy.id, 'down')}
                                      title={`Lower ${location} privacy shade`}
                                      className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
          
          {/* Bedroom Windows - Organized by location */}
          {activeRoom === 'Bedroom' && (
            <div className="bg-gray-50 p-3 rounded shadow">
              <h3 className="text-md font-semibold mb-2">Bedroom Windows</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-2">
                {/* Hard-coded Bedroom Windows */}
                <div className="border rounded p-1">
                  <h4 className="font-medium text-center text-xs mb-0.5">South</h4>
                  <div className="flex justify-center gap-2">
                    {/* Privacy shade controls */}
                    <div>
                      <p className="text-xs mb-0.5 text-center">Privacy</p>
                      <div className="flex flex-col items-center space-y-1">
                        <button 
                          onClick={() => actions.controlShade(44, 'up')}
                          title="Raise South Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(44, 'stop')}
                          title="Stop South Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(44, 'down')}
                          title="Lower South Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Blackout shade controls */}
                    <div>
                      <p className="text-xs mb-0.5 text-center">Blackout</p>
                      <div className="flex flex-col items-center space-y-1">
                        <button 
                          onClick={() => actions.controlShade(42, 'up')}
                          title="Raise South Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(42, 'stop')}
                          title="Stop South Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(42, 'down')}
                          title="Lower South Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="border rounded p-1">
                  <h4 className="font-medium text-center text-xs mb-0.5">SWest</h4>
                  <div className="flex justify-center gap-2">
                    {/* Privacy shade controls */}
                    <div>
                      <p className="text-xs mb-0.5 text-center">Privacy</p>
                      <div className="flex flex-col items-center space-y-1">
                        <button 
                          onClick={() => actions.controlShade(44, 'up')}
                          title="Raise SWest Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(44, 'stop')}
                          title="Stop SWest Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(44, 'down')}
                          title="Lower SWest Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Blackout shade controls */}
                    <div>
                      <p className="text-xs mb-0.5 text-center">Blackout</p>
                      <div className="flex flex-col items-center space-y-1">
                        <button 
                          onClick={() => actions.controlShade(42, 'up')}
                          title="Raise SWest Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(42, 'stop')}
                          title="Stop SWest Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(42, 'down')}
                          title="Lower SWest Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="border rounded p-1">
                  <h4 className="font-medium text-center text-xs mb-0.5">NWest</h4>
                  <div className="flex justify-center gap-2">
                    {/* Privacy shade controls */}
                    <div>
                      <p className="text-xs mb-0.5 text-center">Privacy</p>
                      <div className="flex flex-col items-center space-y-1">
                        <button 
                          onClick={() => actions.controlShade(44, 'up')}
                          title="Raise NWest Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(44, 'stop')}
                          title="Stop NWest Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(44, 'down')}
                          title="Lower NWest Window Privacy Shade"
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Blackout shade controls */}
                    <div>
                      <p className="text-xs mb-0.5 text-center">Blackout</p>
                      <div className="flex flex-col items-center space-y-1">
                        <button 
                          onClick={() => actions.controlShade(42, 'up')}
                          title="Raise NWest Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(42, 'stop')}
                          title="Stop NWest Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => actions.controlShade(42, 'down')}
                          title="Lower NWest Window Blackout Shade"
                          className="w-7 h-7 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Office Windows - Display by window locations with labeled types */}
          {activeRoom === 'Office' && (
            <div className="bg-gray-50 p-3 rounded shadow">
              <h3 className="text-md font-semibold mb-2">Office Solar</h3>
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-2 mb-4">
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Slider Door (Solar)</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(36, 'up')}
                      title="Raise Office Slider Door solar shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(36, 'stop')}
                      title="Stop Office Slider Door solar shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(36, 'down')}
                      title="Lower Office Slider Door solar shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Windows (Solar)</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(36, 'up')}
                      title="Raise Office Windows solar shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(36, 'stop')}
                      title="Stop Office Windows solar shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(36, 'down')}
                      title="Lower Office Windows solar shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              
              <h3 className="text-md font-semibold mb-2">Office Dimming</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-2">
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Slider Door</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(33, 'up')}
                      title="Raise Office Slider Door dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'stop')}
                      title="Stop Office Slider Door dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'down')}
                      title="Lower Office Slider Door dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Window Right</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(33, 'up')}
                      title="Raise Office Window Right dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'stop')}
                      title="Stop Office Window Right dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'down')}
                      title="Lower Office Window Right dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Window Center</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(33, 'up')}
                      title="Raise Office Window Center dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'stop')}
                      title="Stop Office Window Center dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'down')}
                      title="Lower Office Window Center dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Window Left</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(33, 'up')}
                      title="Raise Office Window Left dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'stop')}
                      title="Stop Office Window Left dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(33, 'down')}
                      title="Lower Office Window Left dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Loft Windows - Individual window controls */}
          {activeRoom === 'Loft' && (
            <div className="bg-gray-50 p-3 rounded shadow">
              <h3 className="text-md font-semibold mb-2">Loft Windows</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Loft Deskside (Dimming)</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(48, 'up')}
                      title="Raise Loft Deskside dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(48, 'stop')}
                      title="Stop Loft Deskside dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(48, 'down')}
                      title="Lower Loft Deskside dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Loft Deskside (Blackout)</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(48, 'up')}
                      title="Raise Loft Deskside blackout shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(48, 'stop')}
                      title="Stop Loft Deskside blackout shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(48, 'down')}
                      title="Lower Loft Deskside blackout shade"
                      className="w-9 h-9 bg-gray-300 hover:bg-gray-400 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="border rounded p-2">
                  <h4 className="font-medium text-center text-sm mb-1">Loft Back Window (Dimming)</h4>
                  <div className="flex justify-center space-x-2">
                    <button 
                      onClick={() => actions.controlShade(48, 'up')}
                      title="Raise Loft Back Window dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(48, 'stop')}
                      title="Stop Loft Back Window dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => actions.controlShade(48, 'down')}
                      title="Lower Loft Back Window dimming shade"
                      className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Empty State */}
          {locations.length === 0 && (
            <div className="col-span-3 text-center py-6 text-gray-500">
              No individual shades configured for this room.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShadesPage;