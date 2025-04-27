import { Request, Response } from 'express';
import { Room } from '../../models/Room';

// Temporary in-memory storage, would be replaced with a real database
const rooms: Room[] = [
  {
    id: '1',
    name: 'Living Room',
    floor: 1,
    hasShades: true
  },
  {
    id: '2',
    name: 'Kitchen',
    floor: 1,
    hasShades: true
  },
  {
    id: '3',
    name: 'Master Bedroom',
    floor: 2,
    hasShades: true
  },
  {
    id: '4',
    name: 'Guest Bedroom',
    floor: 2,
    hasShades: true
  }
];

// Get all rooms
export const getAllRooms = (req: Request, res: Response) => {
  res.json(rooms);
};

// Get a specific room by ID
export const getRoomById = (req: Request, res: Response) => {
  const room = rooms.find(r => r.id === req.params.id);
  if (!room) {
    return res.status(404).json({ message: 'Room not found' });
  }
  res.json(room);
};
