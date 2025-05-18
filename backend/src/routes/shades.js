const express = require('express');
const router = express.Router();
const shadeService = require('../services/shadeService');
const logger = require('../utils/logger').getModuleLogger('shade-routes');

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

module.exports = router;