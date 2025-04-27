import { Request, Response } from 'express';
import { Shade } from '../../models/Shade';

// Temporary in-memory storage, would be replaced with a real database
let shades: Shade[] = [
  {
    id: '1',
    roomId: '1',
    name: 'Window 1',
    position: 100,
    status: 'open',
    lastUpdated: new Date()
  },
  {
    id: '2',
    roomId: '1',
    name: 'Window 2',
    position: 0,
    status: 'closed',
    lastUpdated: new Date()
  },
  {
    id: '3',
    roomId: '2',
    name: 'Window 1',
    position: 50,
    status: 'partial',
    lastUpdated: new Date()
  },
  {
    id: '4',
    roomId: '3',
    name: 'Window 1',
    position: 100,
    status: 'open',
    lastUpdated: new Date()
  }
];

// Helper function to communicate with Arduino (would be implemented with actual hardware communication)
const sendCommandToArduino = async (shadeId: string, command: 'open' | 'close' | 'stop' | 'position', value?: number): Promise<boolean> => {
  // In a real implementation, this would send an RF command to the Arduino
  // For now, we'll just simulate a successful command
  console.log(`Sending command to Arduino: Shade ${shadeId}, Command: ${command}${value !== undefined ? `, Value: ${value}` : ''}`);
  
  // Simulate successful communication
  return Promise.resolve(true);
};

// Get all shades
export const getAllShades = (req: Request, res: Response) => {
  res.json(shades);
};

// Get a specific shade by ID
export const getShadeById = (req: Request, res: Response) => {
  const shade = shades.find(s => s.id === req.params.id);
  if (!shade) {
    return res.status(404).json({ message: 'Shade not found' });
  }
  res.json(shade);
};

// Get all shades for a specific room
export const getShadesByRoom = (req: Request, res: Response) => {
  const roomShades = shades.filter(s => s.roomId === req.params.roomId);
  res.json(roomShades);
};

// Control a specific shade
export const controlShade = async (req: Request, res: Response) => {
  const { action, position } = req.body;
  const shadeId = req.params.id;
  
  // Find the shade
  const shadeIndex = shades.findIndex(s => s.id === shadeId);
  if (shadeIndex === -1) {
    return res.status(404).json({ message: 'Shade not found' });
  }
  
  try {
    let command: 'open' | 'close' | 'stop' | 'position';
    let updatedStatus: 'open' | 'closed' | 'partial' | 'moving';
    let updatedPosition = shades[shadeIndex].position;
    
    // Determine the command and status based on the action
    switch (action) {
      case 'open':
        command = 'open';
        updatedStatus = 'open';
        updatedPosition = 100;
        break;
      case 'close':
        command = 'close';
        updatedStatus = 'closed';
        updatedPosition = 0;
        break;
      case 'stop':
        command = 'stop';
        updatedStatus = 'partial';
        break;
      case 'position':
        if (position === undefined || position < 0 || position > 100) {
          return res.status(400).json({ message: 'Invalid position value' });
        }
        command = 'position';
        updatedStatus = position === 0 ? 'closed' : position === 100 ? 'open' : 'partial';
        updatedPosition = position;
        break;
      default:
        return res.status(400).json({ message: 'Invalid action' });
    }
    
    // Send command to Arduino
    const success = await sendCommandToArduino(shadeId, command, command === 'position' ? position : undefined);
    
    if (success) {
      // Update shade status
      shades[shadeIndex] = {
        ...shades[shadeIndex],
        status: updatedStatus,
        position: updatedPosition,
        lastUpdated: new Date()
      };
      
      return res.json(shades[shadeIndex]);
    } else {
      return res.status(500).json({ message: 'Failed to control shade' });
    }
  } catch (error) {
    console.error('Error controlling shade:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Control all shades in a room
export const controlRoomShades = async (req: Request, res: Response) => {
  const { action, position } = req.body;
  const roomId = req.params.roomId;
  
  // Find shades in the room
  const roomShades = shades.filter(s => s.roomId === roomId);
  
  if (roomShades.length === 0) {
    return res.status(404).json({ message: 'No shades found for this room' });
  }
  
  try {
    const results = await Promise.all(roomShades.map(async shade => {
      const shadeIndex = shades.findIndex(s => s.id === shade.id);
      let command: 'open' | 'close' | 'stop' | 'position';
      let updatedStatus: 'open' | 'closed' | 'partial' | 'moving';
      let updatedPosition = shade.position;
      
      switch (action) {
        case 'open':
          command = 'open';
          updatedStatus = 'open';
          updatedPosition = 100;
          break;
        case 'close':
          command = 'close';
          updatedStatus = 'closed';
          updatedPosition = 0;
          break;
        case 'stop':
          command = 'stop';
          updatedStatus = 'partial';
          break;
        case 'position':
          if (position === undefined || position < 0 || position > 100) {
            throw new Error('Invalid position value');
          }
          command = 'position';
          updatedStatus = position === 0 ? 'closed' : position === 100 ? 'open' : 'partial';
          updatedPosition = position;
          break;
        default:
          throw new Error('Invalid action');
      }
      
      // Send command to Arduino
      const success = await sendCommandToArduino(shade.id, command, command === 'position' ? position : undefined);
      
      if (success) {
        // Update shade status
        shades[shadeIndex] = {
          ...shades[shadeIndex],
          status: updatedStatus,
          position: updatedPosition,
          lastUpdated: new Date()
        };
        
        return shades[shadeIndex];
      } else {
        throw new Error(`Failed to control shade ${shade.id}`);
      }
    }));
    
    return res.json(results);
  } catch (error) {
    console.error('Error controlling room shades:', error);
    return res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};
