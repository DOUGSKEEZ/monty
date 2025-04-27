import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import shadesRoutes from './routes/shadesRoutes';
import weatherRoutes from './routes/weatherRoutes';
import roomsRoutes from './routes/roomsRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/shades', shadesRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/rooms', roomsRoutes);

// Create HTTP server and Socket.io instance
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('shade_control', (data) => {
    console.log('Shade control:', data);
    // Handle shade control commands and relay to Arduino
    // Broadcast updates to all connected clients
    io.emit('shade_update', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
