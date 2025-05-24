const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Path to state persistence file
const STATE_FILE = path.join(__dirname, '../../../data/cache/app_state.json');

// Initialize state file if it doesn't exist
const initializeStateFile = () => {
  if (!fs.existsSync(STATE_FILE)) {
    const initialState = {
      currentSong: null,
      lastUpdated: Date.now()
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initialState, null, 2));
  }
};

// Get current application state
router.get('/', (req, res) => {
  try {
    initializeStateFile();
    const stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    res.json(stateData);
  } catch (error) {
    console.error('Error reading state:', error);
    res.status(500).json({ error: 'Failed to read application state' });
  }
});

// Update specific state key
router.put('/:key', (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    initializeStateFile();
    const stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    
    // Update the specific key
    stateData[key] = value;
    stateData.lastUpdated = Date.now();
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2));
    
    res.json({ 
      success: true, 
      key, 
      value, 
      lastUpdated: stateData.lastUpdated 
    });
  } catch (error) {
    console.error('Error updating state:', error);
    res.status(500).json({ error: 'Failed to update application state' });
  }
});

// Bulk update multiple state keys
router.put('/', (req, res) => {
  try {
    const updates = req.body;
    
    initializeStateFile();
    const stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    
    // Update multiple keys
    Object.keys(updates).forEach(key => {
      if (key !== 'lastUpdated') {
        stateData[key] = updates[key];
      }
    });
    stateData.lastUpdated = Date.now();
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateData, null, 2));
    
    res.json({ 
      success: true, 
      updates,
      lastUpdated: stateData.lastUpdated 
    });
  } catch (error) {
    console.error('Error bulk updating state:', error);
    res.status(500).json({ error: 'Failed to bulk update application state' });
  }
});

module.exports = router;