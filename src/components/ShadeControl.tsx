import React, { useState } from 'react';
import { Shade } from '../models/Shade';
import './ShadeControl.css';

interface ShadeControlProps {
  shade: Shade;
  onControl: (shadeId: string, action: string, position?: number) => void;
}

const ShadeControl: React.FC<ShadeControlProps> = ({ shade, onControl }) => {
  const [position, setPosition] = useState<number>(shade.position);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPosition = parseInt(e.target.value, 10);
    setPosition(newPosition);
  };

  const handleSliderRelease = () => {
    onControl(shade.id, 'position', position);
  };

  const getStatusColor = () => {
    switch (shade.status) {
      case 'open': return 'green';
      case 'closed': return 'red';
      case 'partial': return 'orange';
      case 'moving': return 'blue';
      default: return 'gray';
    }
  };

  return (
    <div className="shade-control card">
      <div className="shade-header">
        <h3>{shade.name}</h3>
        <div className="shade-status" style={{ backgroundColor: getStatusColor() }}>
          {shade.status}
        </div>
      </div>
      
      <div className="shade-position">
        <span>Position: {shade.position}%</span>
      </div>
      
      <div className="shade-slider">
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={position} 
          onChange={handleSliderChange}
          onMouseUp={handleSliderRelease}
          onTouchEnd={handleSliderRelease}
        />
      </div>
      
      <div className="shade-buttons">
        <button 
          className="btn btn-primary"
          onClick={() => onControl(shade.id, 'open')}
        >
          Open
        </button>
        <button 
          className="btn btn-secondary"
          onClick={() => onControl(shade.id, 'stop')}
        >
          Stop
        </button>
        <button 
          className="btn btn-danger"
          onClick={() => onControl(shade.id, 'close')}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default ShadeControl;
