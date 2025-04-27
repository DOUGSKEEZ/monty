import express from 'express';
import * as shadesController from '../controllers/shadesController';

const router = express.Router();

// Get all shades
router.get('/', shadesController.getAllShades);

// Get shade by ID
router.get('/:id', shadesController.getShadeById);

// Get shades by room ID
router.get('/room/:roomId', shadesController.getShadesByRoom);

// Control shade
router.post('/:id/control', shadesController.controlShade);

// Control all shades in room
router.post('/room/:roomId/control', shadesController.controlRoomShades);

export default router;
