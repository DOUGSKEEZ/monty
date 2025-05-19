import React from 'react';
import { useAppContext } from '../utils/AppContext';

/**
 * Reusable component for controlling individual shades
 * 
 * @param {Object} props
 * @param {number} props.id - Shade ID
 * @param {string} props.name - Shade name
 * @param {string} props.type - Shade type (solar, privacy, blackout, etc.)
 * @param {string} props.room - Room name
 */
function ShadeControl({ id, name, type, room }) {
  const { actions } = useAppContext();
  const [isControlling, setIsControlling] = React.useState(false);

  // Handle shade control actions
  const handleControl = async (action) => {
    if (isControlling) return;
    
    setIsControlling(true);
    
    try {
      await actions.controlShade(id, action);
    } catch (error) {
      console.error(`Error controlling shade ${id}:`, error);
    } finally {
      setIsControlling(false);
    }
  };

  return (
    <div className="shade-control">
      <div className="text-center">
        <p className="text-sm mb-2 capitalize">{name || type}</p>
        <div 
          className={`flex flex-col items-center space-y-2 ${isControlling ? 'opacity-50' : ''}`}
          aria-disabled={isControlling}
        >
          <button 
            onClick={() => handleControl('up')} 
            disabled={isControlling}
            title={`Raise ${name || type} shade`}
            className="w-12 h-12 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button 
            onClick={() => handleControl('stop')} 
            disabled={isControlling}
            title={`Stop ${name || type} shade`}
            className="w-12 h-12 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
            </svg>
          </button>
          <button 
            onClick={() => handleControl('down')} 
            disabled={isControlling}
            title={`Lower ${name || type} shade`}
            className="w-12 h-12 bg-gray-200 hover:bg-gray-300 rounded-full flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Component for controlling groups of shades
 * 
 * @param {Object} props
 * @param {string} props.room - Room name
 * @param {string} props.type - Shade type
 */
export function ShadeGroupControl({ room, type }) {
  const { actions } = useAppContext();
  const [isControlling, setIsControlling] = React.useState(false);

  // Handle shade group control actions
  const handleControl = async (action) => {
    if (isControlling) return;
    
    setIsControlling(true);
    
    try {
      // Format the scene name as expected by the backend
      const scene = `${room.toLowerCase().replace(/\s+/g, '-')}-${type.toLowerCase().replace(/\s+/g, '-')}-${action}`;
      await actions.triggerShadeScene(scene);
    } catch (error) {
      console.error(`Error controlling shade group (${room} ${type}):`, error);
    } finally {
      setIsControlling(false);
    }
  };

  return (
    <div className="shade-group-control">
      <div className="text-center">
        <p className="text-sm font-semibold mb-2">{type} Shades</p>
        <div 
          className={`flex flex-col items-center space-y-2 ${isControlling ? 'opacity-50' : ''}`}
          aria-disabled={isControlling}
        >
          <button 
            onClick={() => handleControl('up')} 
            disabled={isControlling}
            title={`Raise all ${type} shades in ${room}`}
            className="w-12 h-12 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button 
            onClick={() => handleControl('stop')} 
            disabled={isControlling}
            title={`Stop all ${type} shades in ${room}`}
            className="w-12 h-12 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10h14v4H5z" />
            </svg>
          </button>
          <button 
            onClick={() => handleControl('down')} 
            disabled={isControlling}
            title={`Lower all ${type} shades in ${room}`}
            className="w-12 h-12 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Component for controlling all shades in a room
 * 
 * @param {Object} props
 * @param {string} props.room - Room name
 */
export function RoomControl({ room }) {
  const { actions } = useAppContext();
  const [isControlling, setIsControlling] = React.useState(false);

  // Handle room control actions
  const handleControl = async (action) => {
    if (isControlling) return;
    
    setIsControlling(true);
    
    try {
      // Format the scene name as expected by the backend
      const scene = `${room.toLowerCase().replace(/\s+/g, '-')}-${action}`;
      await actions.triggerShadeScene(scene);
    } catch (error) {
      console.error(`Error controlling room (${room}):`, error);
    } finally {
      setIsControlling(false);
    }
  };
  
  // Remove room name from display when in the room tab
  // eslint-disable-next-line no-unused-vars
  const displayTitle = room === 'Main Level' || room === 'Bedroom' || room === 'Office' || room === 'Loft' 
    ? 'ALL Shades' 
    : `${room} (All Shades)`;

  return (
    <div 
      className={`flex space-x-2 ${isControlling ? 'opacity-50' : ''}`}
      aria-disabled={isControlling}
    >
      <button 
        onClick={() => handleControl('up')} 
        disabled={isControlling}
        title={`Raise all shades in ${room}`}
        className="px-4 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded"
      >
        All Up
      </button>
      <button 
        onClick={() => handleControl('stop')} 
        disabled={isControlling}
        title={`Stop all shades in ${room}`}
        className="px-4 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded"
      >
        All Stop
      </button>
      <button 
        onClick={() => handleControl('down')} 
        disabled={isControlling}
        title={`Lower all shades in ${room}`}
        className="px-4 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded"
      >
        All Down
      </button>
    </div>
  );
}

export default ShadeControl;