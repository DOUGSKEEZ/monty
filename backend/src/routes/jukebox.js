/**
 * Jukebox API Routes
 *
 * Express routes for YouTube streaming and local library playback
 * Endpoints: /api/jukebox/*
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger').getModuleLogger('jukebox-routes');

// Lazy-loaded service references
let jukeboxService = null;
let audioBroker = null;
let wsService = null;

/**
 * Get or create JukeboxService instance
 */
function getJukeboxService() {
  if (!jukeboxService) {
    try {
      const AudioBroker = require('../services/AudioBroker');
      const JukeboxService = require('../services/JukeboxService');
      const { getWebSocketServiceInstance } = require('../services/PianobarWebsocketIntegration');

      audioBroker = AudioBroker.getInstance();
      wsService = getWebSocketServiceInstance();
      jukeboxService = JukeboxService.getInstance(audioBroker, wsService);

      logger.info('JukeboxService initialized via routes', {
        hasWebSocket: !!wsService
      });
    } catch (error) {
      logger.error(`Failed to initialize JukeboxService: ${error.message}`);
      throw error;
    }
  }
  return jukeboxService;
}

// ==================== SEARCH ====================

/**
 * GET /api/jukebox/search
 * Search YouTube for tracks
 * Query params: q (search query), offset (pagination, optional)
 */
router.get('/search', async (req, res) => {
  try {
    const { q, offset = 0 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const service = getJukeboxService();
    const results = await service.searchYouTube(q.trim(), parseInt(offset) || 0);

    res.json({ success: true, results });

  } catch (error) {
    logger.error(`Search error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PLAYBACK ====================

/**
 * POST /api/jukebox/play-youtube
 * Stream a YouTube video by ID
 * Body: { youtubeId, title?, artist?, duration? }
 */
router.post('/play-youtube', async (req, res) => {
  try {
    const { youtubeId, title, artist, duration } = req.body;

    if (!youtubeId) {
      return res.status(400).json({ error: 'youtubeId required' });
    }

    const service = getJukeboxService();
    await service.playYouTube(youtubeId, { title, artist, duration });

    res.json({ success: true, message: 'Playback started' });

  } catch (error) {
    logger.error(`Play YouTube error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/play-local
 * Play a local file from the library
 * Body: { filepath }
 */
router.post('/play-local', async (req, res) => {
  try {
    const { filepath } = req.body;

    if (!filepath) {
      return res.status(400).json({ error: 'filepath required' });
    }

    const service = getJukeboxService();
    await service.playLocal(filepath);

    res.json({ success: true, message: 'Playback started' });

  } catch (error) {
    logger.error(`Play local error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/play
 * Resume paused playback
 */
router.post('/play', async (req, res) => {
  try {
    const service = getJukeboxService();
    await service.play();

    res.json({ success: true, message: 'Playback resumed' });

  } catch (error) {
    logger.error(`Play error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/pause
 * Pause playback
 */
router.post('/pause', async (req, res) => {
  try {
    const service = getJukeboxService();
    await service.pause();

    res.json({ success: true, message: 'Playback paused' });

  } catch (error) {
    logger.error(`Pause error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/stop
 * Stop playback completely
 */
router.post('/stop', async (req, res) => {
  try {
    const service = getJukeboxService();
    await service.stop();

    res.json({ success: true, message: 'Playback stopped' });

  } catch (error) {
    logger.error(`Stop error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/next
 * Skip to next track in queue
 */
router.post('/next', async (req, res) => {
  try {
    const service = getJukeboxService();
    await service.next();

    res.json({ success: true, message: 'Skipped to next track' });

  } catch (error) {
    logger.error(`Next error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/volume
 * Set volume level
 * Body: { level: 0-100 }
 */
router.post('/volume', async (req, res) => {
  try {
    const { level } = req.body;

    if (level === undefined || level < 0 || level > 100) {
      return res.status(400).json({ error: 'Volume level must be 0-100' });
    }

    const service = getJukeboxService();
    await service.setVolume(level);

    res.json({ success: true, message: `Volume set to ${level}` });

  } catch (error) {
    logger.error(`Volume error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/jukebox/status
 * Get current playback status
 */
router.get('/status', async (req, res) => {
  try {
    const service = getJukeboxService();
    const status = service.getStatus();

    res.json({ success: true, ...status });

  } catch (error) {
    logger.error(`Status error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ==================== LIBRARY ====================

/**
 * GET /api/jukebox/library
 * List all tracks in the library
 */
router.get('/library', async (req, res) => {
  try {
    const service = getJukeboxService();
    const tracks = await service.listLibrary();

    res.json({ success: true, tracks });

  } catch (error) {
    logger.error(`Library list error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/save
 * Save a YouTube track to the library (background download)
 * Body: { youtubeId, artist, title }
 */
router.post('/save', async (req, res) => {
  try {
    const { youtubeId, artist, title } = req.body;

    if (!youtubeId || !artist || !title) {
      return res.status(400).json({ error: 'youtubeId, artist, and title required' });
    }

    const service = getJukeboxService();
    const result = await service.saveTrack(youtubeId, artist.trim(), title.trim());

    res.json({ success: true, ...result });

  } catch (error) {
    logger.error(`Save error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/jukebox/library/:filename
 * Delete a track from the library
 */
router.delete('/library/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({ error: 'filename required' });
    }

    const service = getJukeboxService();
    await service.deleteTrack(filename);

    res.json({ success: true, message: `Deleted: ${filename}` });

  } catch (error) {
    logger.error(`Delete error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ==================== QUEUE ====================

/**
 * GET /api/jukebox/queue
 * Get current queue state
 */
router.get('/queue', async (req, res) => {
  try {
    const service = getJukeboxService();
    const queue = service.getQueue();

    res.json({ success: true, ...queue });

  } catch (error) {
    logger.error(`Queue get error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jukebox/queue
 * Add a track to the queue
 * Body: { filepath }
 */
router.post('/queue', async (req, res) => {
  try {
    const { filepath } = req.body;

    if (!filepath) {
      return res.status(400).json({ error: 'filepath required' });
    }

    const service = getJukeboxService();
    service.addToQueue(filepath);

    res.json({ success: true, message: 'Added to queue', queue: service.getQueue() });

  } catch (error) {
    logger.error(`Queue add error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/jukebox/queue/:slot
 * Remove a track from the queue
 * Params: slot - 'onDeck' or 'inTheHole'
 */
router.delete('/queue/:slot', async (req, res) => {
  try {
    const { slot } = req.params;

    if (slot !== 'onDeck' && slot !== 'inTheHole') {
      return res.status(400).json({ error: 'slot must be "onDeck" or "inTheHole"' });
    }

    const service = getJukeboxService();
    service.removeFromQueue(slot);

    res.json({ success: true, message: `Removed from ${slot}`, queue: service.getQueue() });

  } catch (error) {
    logger.error(`Queue remove error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
