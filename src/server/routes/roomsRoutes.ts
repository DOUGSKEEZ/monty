import express from 'express';
import * as roomsController from '../controllers/roomsController';

const router = express.Router();

// Get all rooms
router.get('/', roomsController.getAllRooms);

// Get room by ID
router.get('/:id', roomsController.getRoomById);

export default router;
