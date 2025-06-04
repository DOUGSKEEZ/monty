import React, { useState } from 'react';
import { useAppContext } from '../utils/AppContext';
import ShadeControl, { ShadeGroupControl, RoomControl } from '../components/ShadeControl';
import { controlShadeCommander, checkShadeCommanderHealth, triggerShadeCommanderScene } from '../utils/api';

function ShadesPage() {
  const { shades, actions } = useAppContext();
  const [activeRoom, setActiveRoom] = useState('Main Level');
  const [arduinoError, setArduinoError] = useState(null);
  
  // Function to handle ShadeCommander calls
  const handleShadeCommand = async (shadeId, action) => {
  try {
    setArduinoError(null); // Clear any existing errors
    
    const response = await controlShadeCommander(shadeId, action);
    console.log(`Shade ${shadeId} ${action} command sent!`, response);
    
  } catch (error) {
    console.error(`Shade command failed:`, error);
    
    // Check if it's an Arduino issue
    try {
      const health = await checkShadeCommanderHealth();
      if (!health.arduino_connected) {
        setArduinoError("Arduino disconnected - check USB connection and/or reconnect in Settings.");
      } else {
        setArduinoError("Command failed - please try again");
      }
    } catch (healthError) {
      setArduinoError("ShadeCommander unavailable - please check connection");
      }
    }
  };

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
      return ['Main Level', 'Office', 'Bedroom', 'Loft'];
    }
    
    // Extract unique room names
    const roomSet = new Set(shades.config.shades.map(shade => shade.room));
    
    // If any of the main rooms are missing from the config, ensure they are added
    const rooms = Array.from(roomSet);
    const requiredRooms = ['Main Level', 'Office', 'Bedroom', 'Loft'];
    
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
  
  // Handle scene triggers via ShadeCommander
  const triggerScene = async (sceneName) => {
    try {
      setArduinoError(null); // Clear any existing errors
      console.log(`Triggering scene: ${sceneName}`);
      
      const response = await triggerShadeCommanderScene(sceneName);
      console.log(`Scene ${sceneName} executed successfully!`, response);
      
    } catch (error) {
      console.error(`Scene ${sceneName} failed:`, error);
      
      // Check if it's an Arduino issue
      try {
        const health = await checkShadeCommanderHealth();
        if (!health.arduino_connected) {
          setArduinoError("Arduino disconnected - check USB connection and/or reconnect in Settings.");
        } else {
          setArduinoError(`Scene "${sceneName}" failed - please try again`);
        }
      } catch (healthError) {
        setArduinoError("ShadeCommander unavailable - please check connection");
      }
    }
  };
  
  const rooms = getRooms();
  const { solarShades, privacyShades, blackoutShades } = getRoomShades();
  const locations = getLocations(activeRoom);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Shade Control</h1>
      
      {/* Arduino Error Display */}
        {arduinoError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            ⚠️ {arduinoError}
          </div>
        )}

        {/* Shade Config Error Display */}
        {shades.error && (
          <div className="bg-orange-100 border border-orange-400 text-orange-700 px-4 py-3 rounded mb-4">
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
              onClick={() => triggerScene('good_morning')}
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
              onClick={() => triggerScene('good_afternoon')}
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
              onClick={() => triggerScene('good_evening')}
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
              onClick={() => triggerScene('good_night')}
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
            {/* Privacy Type ALL Control - LEFT SIDE (White Box) */}
            {(activeRoom === 'Main Level' || activeRoom === 'Bedroom' || activeRoom === 'Office') && privacyShades.some(s => s.location === 'All') && (
              <div className="p-3 border rounded flex flex-col items-center bg-white shadow-sm w-36">
                <span className="font-medium mb-2 text-gray-800">ALL Privacy</span>
                <div className="flex flex-col items-center space-y-4">
                  <button 
                    onClick={() => {
                      if (activeRoom === 'Office') return handleShadeCommand(33, 'u');
                      if (activeRoom === 'Bedroom') return handleShadeCommand(44, 'u');
                      if (activeRoom === 'Main Level') return handleShadeCommand(14, 'u');
                    }}
                    title={`Raise all ${activeRoom} privacy shades`}
                    className="w-16 h-16 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => {
                      if (activeRoom === 'Office') return handleShadeCommand(33, 's');
                      if (activeRoom === 'Bedroom') return handleShadeCommand(44, 's');
                      if (activeRoom === 'Main Level') return handleShadeCommand(14, 's');
                    }}
                    title={`Stop all ${activeRoom} privacy shades`}
                    className="w-16 h-16 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => {
                      if (activeRoom === 'Office') return handleShadeCommand(33, 'd');
                      if (activeRoom === 'Bedroom') return handleShadeCommand(44, 'd');
                      if (activeRoom === 'Main Level') return handleShadeCommand(14, 'd');
                    }}
                    title={`Lower all ${activeRoom} privacy shades`}
                    className="w-16 h-16 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* Solar Type ALL Control - RIGHT SIDE (Dark Box) */}
            {(activeRoom === 'Main Level' || activeRoom === 'Office') && solarShades.some(s => s.location === 'All') && (
              <div className="p-3 border rounded flex flex-col items-center bg-gray-800 text-white shadow-sm w-36">
                <span className="font-medium mb-2">ALL Solar</span>
                <div className="flex flex-col items-center space-y-4">
                  <button 
                    onClick={() => {
                      if (activeRoom === 'Office') return handleShadeCommand(36, 'u');
                      if (activeRoom === 'Main Level') return handleShadeCommand(28, 'u');
                      return actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-solar-up`);
                    }}
                    title={`Raise all ${activeRoom} solar shades`}
                    className="w-16 h-16 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                    style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => {
                      if (activeRoom === 'Office') return handleShadeCommand(36, 's');
                      if (activeRoom === 'Main Level') return handleShadeCommand(28, 's');
                      return actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-solar-stop`);
                    }}
                    title={`Stop all ${activeRoom} solar shades`}
                    className="w-16 h-16 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                    style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => {
                      if (activeRoom === 'Office') return handleShadeCommand(36, 'd');
                      if (activeRoom === 'Main Level') return handleShadeCommand(28, 'd');
                      return actions.triggerShadeScene(`${activeRoom.toLowerCase().replace(/\s+/g, '-')}-solar-down`);
                    }}
                    title={`Lower all ${activeRoom} solar shades`}
                    className="w-16 h-16 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                    style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* Blackout Type ALL Control - RIGHT SIDE (Dark Box) */}
            {(activeRoom === 'Bedroom') && blackoutShades.some(s => s.location === 'All') && (
              <div className="p-3 border rounded flex flex-col items-center bg-gray-800 text-white shadow-sm w-36">
                <span className="font-medium mb-2">ALL Blackout</span>
                <div className="flex flex-col items-center space-y-4">
                  <button 
                    onClick={() => handleShadeCommand(40, 'u')}
                    title={`Raise all ${activeRoom} blackout shades`}
                    className="w-16 h-16 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                    style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleShadeCommand(40, 's')}
                    title={`Stop all ${activeRoom} blackout shades`}
                    className="w-16 h-16 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                    style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleShadeCommand(40, 'd')}
                    title={`Lower all ${activeRoom} blackout shades`}
                    className="w-16 h-16 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                    style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* If no specific type controls, show a single ALL control */}
            {activeRoom === 'Loft' && (
              <div className="p-3 border rounded flex flex-col items-center bg-white shadow-sm w-36">
                <span className="font-medium mb-2 text-gray-800">ALL Loft</span>
                <div className="flex flex-col items-center space-y-4">
                  <button 
                    onClick={() => handleShadeCommand(48, 'u')}
                    title={`Raise all ${activeRoom} shades`}
                    className="w-16 h-16 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleShadeCommand(48, 's')}
                    title={`Stop all ${activeRoom} shades`}
                    className="w-16 h-16 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleShadeCommand(48, 'd')}
                    title={`Lower all ${activeRoom} shades`}
                    className="w-16 h-16 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              {/* Kitchen Section */}
              <div className="bg-gray-50 p-3 rounded shadow mb-4">
                <h3 className="text-md font-semibold mb-2">Kitchen</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-1">
                  
                  {/* Portrait 01 */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Portrait 01</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(1, 'u')} title="Raise Kitchen Portrait 01 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(1, 's')} title="Stop Kitchen Portrait 01 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(1, 'd')} title="Lower Kitchen Portrait 01 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(15, 'u')} title="Raise Kitchen Portrait 01 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(15, 's')} title="Stop Kitchen Portrait 01 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(15, 'd')} title="Lower Kitchen Portrait 01 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portrait 02 */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Portrait 02</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(2, 'u')} title="Raise Kitchen Portrait 02 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(2, 's')} title="Stop Kitchen Portrait 02 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(2, 'd')} title="Lower Kitchen Portrait 02 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(16, 'u')} title="Raise Kitchen Portrait 02 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(16, 's')} title="Stop Kitchen Portrait 02 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(16, 'd')} title="Lower Kitchen Portrait 02 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Portrait 03 */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Portrait 03</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(3, 'u')} title="Raise Kitchen Portrait 03 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(3, 's')} title="Stop Kitchen Portrait 03 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(3, 'd')} title="Lower Kitchen Portrait 03 privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(17, 'u')} title="Raise Kitchen Portrait 03 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(17, 's')} title="Stop Kitchen Portrait 03 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(17, 'd')} title="Lower Kitchen Portrait 03 solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Patio Door */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Patio Door</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(4, 'u')} title="Raise Kitchen Patio Door privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(4, 's')} title="Stop Kitchen Patio Door privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(4, 'd')} title="Lower Kitchen Patio Door privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(18, 'u')} title="Raise Kitchen Patio Door solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(18, 's')} title="Stop Kitchen Patio Door solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(18, 'd')} title="Lower Kitchen Patio Door solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Media Window */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Media Window</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(5, 'u')} title="Raise Kitchen Media Window privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(5, 's')} title="Stop Kitchen Media Window privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(5, 'd')} title="Lower Kitchen Media Window privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(19, 'u')} title="Raise Kitchen Media Window solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(19, 's')} title="Stop Kitchen Media Window solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(19, 'd')} title="Lower Kitchen Media Window solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Great Room Section */}
              <div className="bg-gray-50 p-3 rounded shadow mb-4">
                <h3 className="text-md font-semibold mb-2">Great Room</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-1">
                  
                  {/* Main Left */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Main Left</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(6, 'u')} title="Raise Great Room Main Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(6, 's')} title="Stop Great Room Main Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(6, 'd')} title="Lower Great Room Main Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(20, 'u')} title="Raise Great Room Main Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(20, 's')} title="Stop Great Room Main Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(20, 'd')} title="Lower Great Room Main Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Main Right */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Main Right</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(7, 'u')} title="Raise Great Room Main Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(7, 's')} title="Stop Great Room Main Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(7, 'd')} title="Lower Great Room Main Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(21, 'u')} title="Raise Great Room Main Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(21, 's')} title="Stop Great Room Main Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(21, 'd')} title="Lower Great Room Main Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Upper Left */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Upper Left</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(8, 'u')} title="Raise Great Room Upper Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(8, 's')} title="Stop Great Room Upper Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(8, 'd')} title="Lower Great Room Upper Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(22, 'u')} title="Raise Great Room Upper Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(22, 's')} title="Stop Great Room Upper Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(22, 'd')} title="Lower Great Room Upper Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Upper Right */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Upper Right</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(9, 'u')} title="Raise Great Room Upper Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(9, 's')} title="Stop Great Room Upper Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(9, 'd')} title="Lower Great Room Upper Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(23, 'u')} title="Raise Great Room Upper Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(23, 's')} title="Stop Great Room Upper Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(23, 'd')} title="Lower Great Room Upper Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Dining & Laundry Section */}
              <div className="bg-gray-50 p-3 rounded shadow mb-4">
                <h3 className="text-md font-semibold mb-2">Dining & Laundry</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-1">
                  
                  {/* Dining Table */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Dining Table</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(12, 'u')} title="Raise Dining Table privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(12, 's')} title="Stop Dining Table privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(12, 'd')} title="Lower Dining Table privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(26, 'u')} title="Raise Dining Table solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(26, 's')} title="Stop Dining Table solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(26, 'd')} title="Lower Dining Table solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pantry */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Pantry</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(13, 'u')} title="Raise Pantry privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(13, 's')} title="Stop Pantry privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(13, 'd')} title="Lower Pantry privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(27, 'u')} title="Raise Pantry solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(27, 's')} title="Stop Pantry solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(27, 'd')} title="Lower Pantry solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Above Projector Left */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Proj Left</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(10, 'u')} title="Raise Above Projector Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(10, 's')} title="Stop Above Projector Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(10, 'd')} title="Lower Above Projector Left privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(24, 'u')} title="Raise Above Projector Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(24, 's')} title="Stop Above Projector Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(24, 'd')} title="Lower Above Projector Left solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Above Projector Right */}
                  <div className="border rounded p-1">
                    <h4 className="font-medium text-center text-xs mb-0.5">Proj Right</h4>
                    <div className="flex justify-center gap-1">
                      <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(11, 'u')} title="Raise Above Projector Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(11, 's')} title="Stop Above Projector Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(11, 'd')} title="Lower Above Projector Right privacy shade" className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                        <p className="text-xs mb-0.5 text-center text-white">Solar</p>
                        <div className="flex flex-col items-center space-y-3">
                          <button onClick={() => handleShadeCommand(25, 'u')} title="Raise Above Projector Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(25, 's')} title="Stop Above Projector Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" /></svg>
                          </button>
                          <button onClick={() => handleShadeCommand(25, 'd')} title="Lower Above Projector Right solar shade" className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Bedroom Windows - Organized by location */}
          {activeRoom === 'Bedroom' && (
            <div className="bg-gray-50 p-3 rounded shadow">
              <h3 className="text-md font-semibold mb-2">Bedroom Windows</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-1">
                {/* Hard-coded Bedroom Windows */}
                <div className="border rounded p-1">
                  <h4 className="font-medium text-center text-xs mb-0.5">South</h4>
                  <div className="flex justify-center gap-1">
                    {/* Privacy shade controls */}
                    <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                      <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                      <div className="flex flex-col items-center space-y-3">
                        <button 
                          onClick={() => handleShadeCommand(41, 'u')}
                          title="Raise South Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(41, 's')}
                          title="Stop South Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(41, 'd')}
                          title="Lower South Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Blackout shade controls */}
                    <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                      <p className="text-xs mb-0.5 text-center text-white">Blackout</p>
                      <div className="flex flex-col items-center space-y-3">
                        <button 
                          onClick={() => handleShadeCommand(37, 'u')}
                          title="Raise South Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(37, 's')}
                          title="Stop South Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(37, 'd')}
                          title="Lower South Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="border rounded p-1">
                  <h4 className="font-medium text-center text-xs mb-0.5">Southwest</h4>
                  <div className="flex justify-center gap-1">
                    {/* Privacy shade controls */}
                    <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                      <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                      <div className="flex flex-col items-center space-y-3">
                        <button 
                          onClick={() => handleShadeCommand(42, 'u')}
                          title="Raise Southwest Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(42, 's')}
                          title="Stop Southwest Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(42, 'd')}
                          title="Lower Southwest Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Blackout shade controls */}
                    <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                      <p className="text-xs mb-0.5 text-center text-white">Blackout</p>
                      <div className="flex flex-col items-center space-y-3">
                        <button 
                          onClick={() => handleShadeCommand(38, 'u')}
                          title="Raise Southwest Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(38, 's')}
                          title="Stop Southwest Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(38, 'd')}
                          title="Lower Southwest Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="border rounded p-1">
                  <h4 className="font-medium text-center text-xs mb-0.5">West</h4>
                  <div className="flex justify-center gap-1">
                    {/* Privacy shade controls */}
                    <div className="bg-white border rounded p-1 pb-2 shadow-sm w-20">
                      <p className="text-xs mb-0.5 text-center text-gray-800">Privacy</p>
                      <div className="flex flex-col items-center space-y-3">
                        <button 
                          onClick={() => handleShadeCommand(43, 'u')}
                          title="Raise West Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(43, 's')}
                          title="Stop West Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(43, 'd')}
                          title="Lower West Window Privacy Shade"
                          className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Blackout shade controls */}
                    <div className="bg-gray-800 border rounded p-1 pb-2 shadow-sm w-20">
                      <p className="text-xs mb-0.5 text-center text-white">Blackout</p>
                      <div className="flex flex-col items-center space-y-3">
                        <button 
                          onClick={() => handleShadeCommand(39, 'u')}
                          title="Raise West Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(39, 's')}
                          title="Stop West Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleShadeCommand(39, 'd')}
                          title="Lower West Window Blackout Shade"
                          className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                         >
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
              <div className="flex justify-center space-x-2 mb-4">

                
                {/* Windows Solar */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-1 pb-2 w-36">
                  <h4 className="font-medium text-center text-xs mb-1 text-white">Windows</h4>
                  <div className="flex flex-col items-center space-y-3">
                    <button 
                      onClick={() => handleShadeCommand(35, 'u')}
                      title="Raise Office Windows solar shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                      style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(35, 's')}
                      title="Stop Office Windows solar shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                      style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(35, 'd')}
                      title="Lower Office Windows solar shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                      style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Slider Door Solar */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-1 pb-2 w-36">
                  <h4 className="font-medium text-center text-xs mb-1 text-white">Slider Door</h4>
                  <div className="flex flex-col items-center space-y-3">
                    <button 
                      onClick={() => handleShadeCommand(34, 'u')}
                      title="Raise Office Slider Door solar shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                      style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(34, 's')}
                      title="Stop Office Slider Door solar shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                      style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(34, 'd')}
                      title="Lower Office Slider Door solar shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center"
                      style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

              </div>
              
              <h3 className="text-md font-semibold mb-2">Office Privacy</h3>
              <div className="flex justify-center flex-wrap gap-2">
                
                
                {/* Window Left Privacy */}
                <div className="bg-white border border-gray-200 rounded-lg p-1 pb-2 w-24">
                  <h4 className="font-medium text-center text-xs mb-1 text-gray-800">Office Left</h4>
                  <div className="flex flex-col items-center space-y-3">
                    <button 
                      onClick={() => handleShadeCommand(32, 'u')}
                      title="Raise Office Window Left privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(32, 's')}
                      title="Stop Office Window Left privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(32, 'd')}
                      title="Lower Office Window Left privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Window Center Privacy */}
                <div className="bg-white border border-gray-200 rounded-lg p-1 pb-2 w-24">
                  <h4 className="font-medium text-center text-xs mb-1 text-gray-800">Office Center</h4>
                  <div className="flex flex-col items-center space-y-3">
                    <button 
                      onClick={() => handleShadeCommand(31, 'u')}
                      title="Raise Office Window Center privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(31, 's')}
                      title="Stop Office Window Center privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(31, 'd')}
                      title="Lower Office Window Center privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Window Right Privacy */}
                <div className="bg-white border border-gray-200 rounded-lg p-1 pb-2 w-24">
                  <h4 className="font-medium text-center text-xs mb-1 text-gray-800">Office Right</h4>
                  <div className="flex flex-col items-center space-y-3">
                    <button 
                      onClick={() => handleShadeCommand(30, 'u')}
                      title="Raise Office Window Right privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(30, 's')}
                      title="Stop Office Window Right privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(30, 'd')}
                      title="Lower Office Window Right privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Slider Door Privacy */}
                <div className="bg-white border border-gray-200 rounded-lg p-1 pb-2 w-36">
                  <h4 className="font-medium text-center text-xs mb-1 text-gray-800">Slider Door</h4>
                  <div className="flex flex-col items-center space-y-3">
                    <button 
                      onClick={() => handleShadeCommand(29, 'u')}
                      title="Raise Office Slider Door privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(29, 's')}
                      title="Stop Office Slider Door privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(29, 'd')}
                      title="Lower Office Slider Door privacy shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                      onClick={() => handleShadeCommand(45, 'u')}
                      title="Raise Loft Deskside dimming shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(45, 's')}
                      title="Stop Loft Deskside dimming shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(45, 'd')}
                      title="Lower Loft Deskside dimming shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
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
                      onClick={() => handleShadeCommand(46, 'u')}
                      title="Raise Loft Deskside blackout shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                     >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(46, 's')}
                      title="Stop Loft Deskside blackout shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                     >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(46, 'd')}
                      title="Lower Loft Deskside blackout shade"
                      className="w-10 h-10 bg-gray-500 hover:bg-gray-400 text-white rounded-full flex items-center justify-center" style={{ boxShadow: '0 4px 6px -1px rgba(255, 255, 255, 0.2), 0 2px 4px -1px rgba(255, 255, 255, 0.1)' }}                     >
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
                      onClick={() => handleShadeCommand(47, 'u')}
                      title="Raise Loft Back Window dimming shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(47, 's')}
                      title="Stop Loft Back Window dimming shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleShadeCommand(47, 'd')}
                      title="Lower Loft Back Window dimming shade"
                      className="w-10 h-10 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow"
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