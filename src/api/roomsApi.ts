import axios from 'axios';
import { Room } from '../models/Room';

const API_URL = 'http://localhost:5000/api';

// Get all rooms
export const fetchRooms = async (): Promise<Room[]> => {
  try {
    const response = await axios.get(`${API_URL}/rooms`);
    return response.data;
  } catch (error) {
    console.error('Error fetching rooms:', error);
    throw new Error('Failed to fetch rooms');
  }
};

// Get a specific room by ID
export const fetchRoom = async (roomId: string): Promise<Room> => {
  try {
    const response = await axios.get(`${API_URL}/rooms/${roomId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching room ${roomId}:`, error);
    throw new Error('Failed to fetch room');
  }
};
