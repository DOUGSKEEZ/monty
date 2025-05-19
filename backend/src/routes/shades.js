const express = require('express');
const router = express.Router();
const shadeService = require('../services/shadeService');
const logger = require('../utils/logger').getModuleLogger('shade-routes');
const path = require('path');
const fs = require('fs');

// Control an individual shade
router.post('/control', async (req, res) => {
  try {
    const { shade_id, command, repeat } = req.body;
    
    if (!shade_id || !command) {
      return res.status(400).json({
        success: false,
        error: 'shade_id and command are required'
      });
    }
    
    const result = await shadeService.controlShade(
      parseInt(shade_id), 
      command.toString(),
      repeat === true
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error controlling shade: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error while controlling shade'
    });
  }
});

// Control a scene (group of shades)
router.post('/scene', async (req, res) => {
  try {
    const { scene_group, command, repeat } = req.body;
    
    if (!scene_group || !command) {
      return res.status(400).json({
        success: false,
        error: 'scene_group and command are required'
      });
    }
    
    const result = await shadeService.controlScene(
      scene_group.toString(),
      command.toString(),
      repeat === true
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error controlling scene: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error while controlling scene'
    });
  }
});

// Trigger a predefined scene workflow
router.post('/scene-workflow', async (req, res) => {
  try {
    const { scene_name } = req.body;
    
    if (!scene_name) {
      return res.status(400).json({
        success: false,
        error: 'scene_name is required'
      });
    }
    
    const result = await shadeService.triggerShadeScene(
      scene_name.toString()
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error executing scene workflow: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error while executing scene workflow'
    });
  }
});

// Get shade configuration
router.get('/config', async (req, res) => {
  try {
    // Path to the shades database
    const shadeDbPath = path.join(__dirname, '../../../data/shades.db');
    
    // Check if the shades.db file exists
    if (!fs.existsSync(shadeDbPath)) {
      logger.warn(`Shades database not found at ${shadeDbPath}`);
      // Mock data for development and testing
      const mockData = {
        shades: [
          // Main Level
          { id: 14, name: 'Main Level Privacy', type: 'Privacy', room: 'Main Level', location: 'All' },
          { id: 28, name: 'Main Level Solar', type: 'Solar', room: 'Main Level', location: 'All' },
          // Kitchen Windows
          { id: 101, name: 'Kitchen Portrait 01 Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Portrait 01' },
          { id: 102, name: 'Kitchen Portrait 02 Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Portrait 02' },
          { id: 103, name: 'Kitchen Portrait 03 Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Portrait 03' },
          { id: 104, name: 'Kitchen Patio Door Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Patio Door' },
          { id: 105, name: 'Kitchen Media Window Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Media Window' },
          { id: 106, name: 'Kitchen Dining Table Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Dining Table' },
          { id: 107, name: 'Pantry Laundry Solar', type: 'Solar', room: 'Main Level', location: 'Pantry Laundry' },
          // Kitchen Privacy
          { id: 201, name: 'Kitchen Portrait 01 Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Portrait 01' },
          { id: 202, name: 'Kitchen Portrait 02 Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Portrait 02' },
          { id: 203, name: 'Kitchen Portrait 03 Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Portrait 03' },
          { id: 204, name: 'Kitchen Patio Door Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Patio Door' },
          { id: 205, name: 'Kitchen Media Window Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Media Window' },
          { id: 206, name: 'Kitchen Dining Table Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Dining Table' },
          { id: 207, name: 'Pantry Laundry Privacy', type: 'Privacy', room: 'Main Level', location: 'Pantry Laundry' },
          // Great Room
          { id: 301, name: 'Great Room - Main Left Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Main Left' },
          { id: 302, name: 'Great Room - Main Right Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Main Right' },
          { id: 303, name: 'Great Room - Upper Left Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Upper Left' },
          { id: 304, name: 'Great Room - Upper Right Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Upper Right' },
          { id: 305, name: 'Great Room North - Blackout Left', type: 'Blackout', room: 'Main Level', location: 'Great Room North - Left' },
          { id: 306, name: 'Great Room North - Blackout Right', type: 'Blackout', room: 'Main Level', location: 'Great Room North - Right' },
          { id: 401, name: 'Great Room - Main Left Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Main Left' },
          { id: 402, name: 'Great Room - Main Right Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Main Right' },
          { id: 403, name: 'Great Room - Upper Left Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Upper Left' },
          { id: 404, name: 'Great Room - Upper Right Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Upper Right' },
          
          // Bedroom
          { id: 40, name: 'Bedroom Blackout', type: 'Blackout', room: 'Bedroom', location: 'All' },
          { id: 44, name: 'Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'All' },
          { id: 42, name: 'East Bedroom Blackout', type: 'Blackout', room: 'Bedroom', location: 'Bedroom East' },
          { id: 43, name: 'North Bedroom Blackout', type: 'Blackout', room: 'Bedroom', location: 'Bedroom North' },
          { id: 45, name: 'South Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'Bedroom South' },
          { id: 46, name: 'Southwest Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'Bedroom Southwest' },
          { id: 47, name: 'West Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'Bedroom West' },
          
          // Office
          { id: 36, name: 'Office Solar', type: 'Solar', room: 'Office', location: 'All' },
          { id: 33, name: 'Office Privacy', type: 'Privacy', room: 'Office', location: 'All' },
          { id: 37, name: 'Slider Door | Dimming', type: 'Privacy', room: 'Office', location: 'Slider Door' },
          { id: 38, name: 'Right Office | Blackout', type: 'Blackout', room: 'Office', location: 'Right Office' },
          { id: 39, name: 'Center Office | Blackout', type: 'Blackout', room: 'Office', location: 'Center Office' },
          { id: 34, name: 'Left Office | Blackout', type: 'Blackout', room: 'Office', location: 'Left Office' },
          
          // Loft
          { id: 48, name: 'Loft Blackout', type: 'Blackout', room: 'Loft', location: 'All' },
          { id: 49, name: 'Loft Deskside Dimming', type: 'Privacy', room: 'Loft', location: 'Loft Deskside' },
          { id: 50, name: 'Loft Deskside Blackout', type: 'Blackout', room: 'Loft', location: 'Loft Deskside' },
          { id: 51, name: 'Loft Back Window', type: 'Blackout', room: 'Loft', location: 'Loft Back Window' }
        ]
      };
      
      return res.json({
        success: true,
        data: mockData,
        note: 'Using mock data since shades.db was not found'
      });
    }
    
    // In a real implementation, you would query the SQLite database
    // For now, we're using mock data similar to above
    return res.json({
      success: true,
      data: {
        shades: [
          // Same mock data as above
          // Main Level
          { id: 14, name: 'Main Level Privacy', type: 'Privacy', room: 'Main Level', location: 'All' },
          { id: 28, name: 'Main Level Solar', type: 'Solar', room: 'Main Level', location: 'All' },
          // Kitchen Windows
          { id: 101, name: 'Kitchen Portrait 01 Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Portrait 01' },
          { id: 102, name: 'Kitchen Portrait 02 Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Portrait 02' },
          { id: 103, name: 'Kitchen Portrait 03 Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Portrait 03' },
          { id: 104, name: 'Kitchen Patio Door Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Patio Door' },
          { id: 105, name: 'Kitchen Media Window Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Media Window' },
          { id: 106, name: 'Kitchen Dining Table Solar', type: 'Solar', room: 'Main Level', location: 'Kitchen Dining Table' },
          { id: 107, name: 'Pantry Laundry Solar', type: 'Solar', room: 'Main Level', location: 'Pantry Laundry' },
          // Kitchen Privacy
          { id: 201, name: 'Kitchen Portrait 01 Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Portrait 01' },
          { id: 202, name: 'Kitchen Portrait 02 Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Portrait 02' },
          { id: 203, name: 'Kitchen Portrait 03 Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Portrait 03' },
          { id: 204, name: 'Kitchen Patio Door Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Patio Door' },
          { id: 205, name: 'Kitchen Media Window Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Media Window' },
          { id: 206, name: 'Kitchen Dining Table Privacy', type: 'Privacy', room: 'Main Level', location: 'Kitchen Dining Table' },
          { id: 207, name: 'Pantry Laundry Privacy', type: 'Privacy', room: 'Main Level', location: 'Pantry Laundry' },
          // Great Room
          { id: 301, name: 'Great Room - Main Left Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Main Left' },
          { id: 302, name: 'Great Room - Main Right Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Main Right' },
          { id: 303, name: 'Great Room - Upper Left Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Upper Left' },
          { id: 304, name: 'Great Room - Upper Right Solar', type: 'Solar', room: 'Main Level', location: 'Great Room - Upper Right' },
          { id: 305, name: 'Great Room North - Blackout Left', type: 'Blackout', room: 'Main Level', location: 'Great Room North - Left' },
          { id: 306, name: 'Great Room North - Blackout Right', type: 'Blackout', room: 'Main Level', location: 'Great Room North - Right' },
          { id: 401, name: 'Great Room - Main Left Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Main Left' },
          { id: 402, name: 'Great Room - Main Right Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Main Right' },
          { id: 403, name: 'Great Room - Upper Left Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Upper Left' },
          { id: 404, name: 'Great Room - Upper Right Privacy', type: 'Privacy', room: 'Main Level', location: 'Great Room - Upper Right' },
          
          // Bedroom
          { id: 40, name: 'Bedroom Blackout', type: 'Blackout', room: 'Bedroom', location: 'All' },
          { id: 44, name: 'Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'All' },
          { id: 42, name: 'East Bedroom Blackout', type: 'Blackout', room: 'Bedroom', location: 'Bedroom East' },
          { id: 43, name: 'North Bedroom Blackout', type: 'Blackout', room: 'Bedroom', location: 'Bedroom North' },
          { id: 45, name: 'South Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'Bedroom South' },
          { id: 46, name: 'Southwest Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'Bedroom Southwest' },
          { id: 47, name: 'West Bedroom Privacy', type: 'Privacy', room: 'Bedroom', location: 'Bedroom West' },
          
          // Office
          { id: 36, name: 'Office Solar', type: 'Solar', room: 'Office', location: 'All' },
          { id: 33, name: 'Office Privacy', type: 'Privacy', room: 'Office', location: 'All' },
          { id: 37, name: 'Slider Door | Dimming', type: 'Privacy', room: 'Office', location: 'Slider Door' },
          { id: 38, name: 'Right Office | Blackout', type: 'Blackout', room: 'Office', location: 'Right Office' },
          { id: 39, name: 'Center Office | Blackout', type: 'Blackout', room: 'Office', location: 'Center Office' },
          { id: 34, name: 'Left Office | Blackout', type: 'Blackout', room: 'Office', location: 'Left Office' },
          
          // Loft
          { id: 48, name: 'Loft Blackout', type: 'Blackout', room: 'Loft', location: 'All' },
          { id: 49, name: 'Loft Deskside Dimming', type: 'Privacy', room: 'Loft', location: 'Loft Deskside' },
          { id: 50, name: 'Loft Deskside Blackout', type: 'Blackout', room: 'Loft', location: 'Loft Deskside' },
          { id: 51, name: 'Loft Back Window', type: 'Blackout', room: 'Loft', location: 'Loft Back Window' }
        ]
      }
    });
  } catch (error) {
    logger.error(`Error getting shade configuration: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting shade configuration'
    });
  }
});

module.exports = router;