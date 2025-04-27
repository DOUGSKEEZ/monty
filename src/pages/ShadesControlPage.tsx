import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ShadeControl from '../components/ShadeControl';
import { Room } from '../models/Room';
import { Shade } from '../models/Shade';
import { fetchRooms } from '../api/roomsApi';
import { fetchShades, controlShade, controlRoomShades } from '../api/shadesApi';
import './ShadesControlPage.css';

const ShadesControlPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(roomId);
  const [shades, setShades] = useState<Shade[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRooms = async () => {
      try {
        const data = await fetchRooms();
        setRooms(data);

        // If no room is selected, select the first one that has shades
        if (!selectedRoomId && data.length > 0) {
          const roomWithShades = data.find(room => room.hasShades);
          if (roomWithShades) {
            setSelectedRoomId(roomWithShades.id);
          }
        }
      } catch (err) {
        console.error('Error loading rooms:', err);
        setError('Failed to load rooms');
      }
    };

    loadRooms();
  }, [selectedRoomId]);

  useEffect(() => {
    const loadShades = async () => {
      if (!selectedRoomId) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchShades(selectedRoomId);
        setShades(data);
      } catch (err) {
        console.error('Error loading shades:', err);
        setError('Failed to load shades');
      } finally {
        setIsLoading(false);
      }
    };

    loadShades();
  }, [selectedRoomId]);

  const handleRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRoomId(e.target.value);
  };

  const handleControlShade = async (shadeId: string, action: string, position?: number) => {
    try {
      const updatedShade = await controlShade(shadeId, action, position);
      setShades(prevShades => 
        prevShades.map(shade => 
          shade.id === updatedShade.id ? updatedShade : shade
        )
      );
    } catch (err) {
      console.error('Error controlling shade:', err);
      setError('Failed to control shade');
    }
  };

  const handleControlAllShades = async (action: string, position?: number) => {
    if (!selectedRoomId) return;
    
    try {
      const updatedShades = await controlRoomShades(selectedRoomId, action, position);
      setShades(updatedShades);
    } catch (err) {
      console.error('Error controlling all shades:', err);
      setError('Failed to control shades');
    }
  };

  const selectedRoom = rooms.find(room => room.id === selectedRoomId);

  return (
    <div className="shades-page">
      <h1>Shades Control</h1>
      
      <div className="room-selector">
        <label htmlFor="room-select">Select Room:</label>
        <select 
          id="room-select" 
          value={selectedRoomId || ''} 
          onChange={handleRoomChange}
        >
          <option value="" disabled>Select a room</option>
          {rooms
            .filter(room => room.hasShades)
            .map(room => (
              <option key={room.id} value={room.id}>
                {room.name} (Floor {room.floor})
              </option>
            ))
          }
        </select>
      </div>

      {selectedRoom && (
        <div className="room-controls">
          <h2>{selectedRoom.name} - All Shades</h2>
          <div className="room-buttons">
            <button 
              className="btn btn-primary"
              onClick={() => handleControlAllShades('open')}
            >
              Open All
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => handleControlAllShades('stop')}
            >
              Stop All
            </button>
            <button 
              className="btn btn-danger"
              onClick={() => handleControlAllShades('close')}
            >
              Close All
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="loading">Loading shades...</div>
      ) : error ? (
        <div className="error">Error: {error}</div>
      ) : shades.length === 0 ? (
        <div className="no-shades">No shades found in this room</div>
      ) : (
        <div className="shades-grid">
          {shades.map(shade => (
            <ShadeControl 
              key={shade.id} 
              shade={shade} 
              onControl={handleControlShade} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ShadesControlPage;
