import axios from 'axios';
import { Shade } from '../models/Shade';
import { io, Socket } from 'socket.io-client';

const API_URL = 'http://localhost:5000/api';
let socket: Socket | null = null;

// Initialize socket connection
export const initializeSocket = () => {
  if (!socket) {
    socket = io('http://localhost:5000');
    
    socket.on('connect', () => {
      console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });
  }
  
  return socket;
};

// Get socket instance
export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

// Register shade update listener
export const registerShadeUpdateListener = (callback: (shade: Shade) => void) => {
  const socket = getSocket();
  socket.on('shade_update', callback);
  
  return () => {
    socket.off('shade_update', callback);
  };
};

// Get all shades
export const fetchAllShades = async (): Promise<Shade[]> => {
  try {
    const response = await axios.get(`${API_URL}/shades`);
    return response.data;
  } catch (error) {
    console.error('Error fetching all shades:', error);
    throw new Error('Failed to fetch shades');
  }
};

// Get shades for a specific room
export const fetchShades = async (roomId: string): Promise<Shade[]> => {
  try {
    const response = await axios.get(`${API_URL}/shades/room/${roomId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching shades for room ${roomId}:`, error);
    throw new Error('Failed to fetch shades for room');
  }
};

// Control a specific shade
export const controlShade = async (
  shadeId: string, 
  action: string, 
  position?: number
): Promise<Shade> => {
  try {
    const response = await axios.post(`${API_URL}/shades/${shadeId}/control`, {
      action,
      position
    });
    return response.data;
  } catch (error) {
    console.error(`Error controlling shade ${shadeId}:`, error);
    throw new Error('Failed to control shade');
  }
};

// Control all shades in a room
export const controlRoomShades = async (
  roomId: string, 
  action: string, 
  position?: number
): Promise<Shade[]> => {
  try {
    const response = await axios.post(`${API_URL}/shades/room/${roomId}/control`, {
      action,
      position
    });
    return response.data;
  } catch (error) {
    console.error(`Error controlling shades in room ${roomId}:`, error);
    throw new Error('Failed to control room shades');
  }
};
