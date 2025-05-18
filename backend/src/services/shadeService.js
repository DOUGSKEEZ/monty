const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const logger = require('../utils/logger').getModuleLogger('shade-service');
const configManager = require('../utils/config');

// Path to the Python shade controller script
const SHADE_CONTROLLER_PATH = '/home/monty/shades/control_shades.py';

class ShadeService {
  constructor() {
    this.commandQueue = [];
    this.processingQueue = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    // Ensure the shade controller exists
    this.checkControllerExists();
  }
  
  /**
   * Check if the shade controller script exists
   */
  async checkControllerExists() {
    try {
      const { stdout, stderr } = await execPromise(`ls -la ${SHADE_CONTROLLER_PATH}`);
      logger.info('Shade controller found:', stdout.trim());
    } catch (error) {
      logger.error(`Shade controller not found at ${SHADE_CONTROLLER_PATH}. Error: ${error.message}`);
    }
  }
  
  /**
   * Send a command to control an individual shade
   * @param {number} shadeId - The ID of the shade to control
   * @param {string} command - The command to send ('u' for up, 'd' for down, 's' for stop)
   * @param {boolean} repeat - Whether to repeat the command for reliability
   * @returns {Promise<object>} - Result of the command
   */
  async controlShade(shadeId, command, repeat = false) {
    const validCommands = ['u', 'd', 's'];
    
    if (!validCommands.includes(command.toLowerCase())) {
      logger.warn(`Invalid shade command: ${command}`);
      return {
        success: false,
        error: `Invalid command. Must be one of: ${validCommands.join(', ')}`
      };
    }
    
    if (isNaN(shadeId) || shadeId < 1) {
      logger.warn(`Invalid shade ID: ${shadeId}`);
      return {
        success: false, 
        error: 'Invalid shade ID. Must be a positive number'
      };
    }
    
    const cmdStr = `${command.toLowerCase()}${shadeId}`;
    logger.info(`Sending shade command: ${cmdStr}`);
    
    try {
      // If repeat is requested, send the command multiple times with a delay
      if (repeat) {
        const repeatCount = configManager.get('shadeScenes.repeatCommandCount', 2);
        return this.queueRepeatedCommand(cmdStr, repeatCount);
      } else {
        return this.executeSingleCommand(cmdStr);
      }
    } catch (error) {
      logger.error(`Error controlling shade: ${error.message}`);
      return {
        success: false,
        error: `Failed to control shade: ${error.message}`
      };
    }
  }
  
  /**
   * Send a command to control a scene (group of shades)
   * @param {string} sceneGroup - The scene group name
   * @param {string} command - The command to send ('u' for up, 'd' for down, 's' for stop)
   * @param {boolean} repeat - Whether to repeat the command for reliability
   * @returns {Promise<object>} - Result of the command
   */
  async controlScene(sceneGroup, command, repeat = false) {
    const validCommands = ['u', 'd', 's'];
    
    if (!validCommands.includes(command.toLowerCase())) {
      logger.warn(`Invalid scene command: ${command}`);
      return {
        success: false,
        error: `Invalid command. Must be one of: ${validCommands.join(', ')}`
      };
    }
    
    const cmdStr = `scene:${sceneGroup.toLowerCase()},${command.toLowerCase()}`;
    logger.info(`Sending scene command: ${cmdStr}`);
    
    try {
      // If repeat is requested, send the command multiple times with a delay
      if (repeat) {
        const repeatCount = configManager.get('shadeScenes.repeatCommandCount', 2);
        return this.queueRepeatedCommand(cmdStr, repeatCount);
      } else {
        return this.executeSingleCommand(cmdStr);
      }
    } catch (error) {
      logger.error(`Error controlling scene: ${error.message}`);
      return {
        success: false,
        error: `Failed to control scene: ${error.message}`
      };
    }
  }
  
  /**
   * Execute a single shade controller command
   * @param {string} command - The command to execute
   * @returns {Promise<object>} - Result of the command
   */
  async executeSingleCommand(command) {
    try {
      const { stdout, stderr } = await execPromise(`python3 ${SHADE_CONTROLLER_PATH} ${command}`);
      
      if (stderr) {
        logger.warn(`Shade command warning: ${stderr}`);
      }
      
      logger.info(`Shade command success: ${command}`);
      return {
        success: true,
        message: `Command sent: ${command}`,
        output: stdout.trim()
      };
    } catch (error) {
      // Retry logic for transient errors
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        logger.warn(`Shade command failed, retrying (${this.retryCount}/${this.maxRetries}): ${command}`);
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.executeSingleCommand(command);
      }
      
      // Reset retry count for next command
      this.retryCount = 0;
      
      logger.error(`Shade command failed: ${error.message}`);
      return {
        success: false,
        error: `Failed to execute command: ${error.message}`
      };
    }
  }
  
  /**
   * Queue a command to be repeated multiple times with a delay
   * @param {string} command - The command to execute
   * @param {number} repeatCount - Number of times to repeat the command
   * @returns {Promise<object>} - Result of the command sequence
   */
  queueRepeatedCommand(command, repeatCount) {
    return new Promise((resolve, reject) => {
      for (let i = 0; i < repeatCount; i++) {
        // Add command to the queue with a delay between repeats
        this.commandQueue.push({
          command,
          delay: i * 1000, // 1 second delay between repeats
          resolve: i === repeatCount - 1 ? resolve : null, // Only resolve on the last command
          reject: i === repeatCount - 1 ? reject : null     // Only reject on the last command
        });
      }
      
      // Start processing the queue if not already processing
      if (!this.processingQueue) {
        this.processCommandQueue();
      }
    });
  }
  
  /**
   * Process the command queue
   */
  async processCommandQueue() {
    if (this.commandQueue.length === 0) {
      this.processingQueue = false;
      return;
    }
    
    this.processingQueue = true;
    const { command, delay, resolve, reject } = this.commandQueue.shift();
    
    // Apply delay if specified
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    
    try {
      const result = await this.executeSingleCommand(command);
      
      if (resolve) {
        resolve(result);
      }
    } catch (error) {
      logger.error(`Queue command failed: ${error.message}`);
      
      if (reject) {
        reject(error);
      }
    }
    
    // Continue processing the queue
    setTimeout(() => this.processCommandQueue(), 10);
  }
  
  /**
   * Trigger a predefined shade scene
   * @param {string} sceneName - Name of the scene to trigger
   * @returns {Promise<object>} - Result of the scene execution
   */
  async triggerShadeScene(sceneName) {
    const homeStatus = configManager.get('homeStatus.status');
    
    // Check if we're in "away" mode and should skip automation
    if (homeStatus === 'away') {
      logger.info(`Home is in "away" mode, skipping scene: ${sceneName}`);
      return {
        success: true,
        message: 'Scene not executed because home is in away mode',
        scene: sceneName
      };
    }
    
    logger.info(`Triggering shade scene: ${sceneName}`);
    
    try {
      switch (sceneName.toLowerCase()) {
        case 'good-morning':
          return await this.executeGoodMorningScene();
          
        case 'good-afternoon':
          return await this.executeGoodAfternoonScene();
          
        case 'good-evening':
          return await this.executeGoodEveningScene();
          
        case 'good-night':
          return await this.executeGoodNightScene();
          
        case 'rise-and-shine':
          return await this.executeRiseAndShineScene();
          
        case 'let-the-sun-in':
          return await this.executeLetTheSunInScene();
          
        case 'start-the-day':
          return await this.executeStartTheDayScene();
          
        default:
          logger.warn(`Unknown scene name: ${sceneName}`);
          return {
            success: false,
            error: `Unknown scene name: ${sceneName}`
          };
      }
    } catch (error) {
      logger.error(`Error triggering scene: ${error.message}`);
      return {
        success: false,
        error: `Failed to execute scene: ${error.message}`
      };
    }
  }
  
  /**
   * Execute "Good Morning" scene - Raise main floor privacy shades
   */
  async executeGoodMorningScene() {
    logger.info('Executing Good Morning scene');
    const repeat = configManager.get('shadeScenes.enableRepeatCommands', true);
    
    // Raise main floor privacy shades (ID: 14)
    const result = await this.controlShade(14, 'u', repeat);
    
    return {
      success: result.success,
      message: 'Good Morning scene executed',
      details: result
    };
  }
  
  /**
   * Execute "Good Afternoon" scene - Lower solar shades
   */
  async executeGoodAfternoonScene() {
    logger.info('Executing Good Afternoon scene');
    const repeat = configManager.get('shadeScenes.enableRepeatCommands', true);
    
    // Lower main floor solar shades (ID: 28)
    const mainResult = await this.controlShade(28, 'd', repeat);
    
    // Also lower office solar shades (ID: 36) according to scene requirements
    const officeResult = await this.controlShade(36, 'd', repeat);
    
    return {
      success: mainResult.success && officeResult.success,
      message: 'Good Afternoon scene executed',
      details: {
        main: mainResult,
        office: officeResult
      }
    };
  }
  
  /**
   * Execute "Good Evening" scene - Raise solar shades
   */
  async executeGoodEveningScene() {
    logger.info('Executing Good Evening scene');
    const repeat = configManager.get('shadeScenes.enableRepeatCommands', true);
    
    // Raise main floor solar shades (ID: 28)
    const result = await this.controlShade(28, 'u', repeat);
    
    return {
      success: result.success,
      message: 'Good Evening scene executed',
      details: result
    };
  }
  
  /**
   * Execute "Good Night" scene - Lower privacy shades
   */
  async executeGoodNightScene() {
    logger.info('Executing Good Night scene');
    const repeat = configManager.get('shadeScenes.enableRepeatCommands', true);
    
    // Queue commands for all the shades mentioned in the requirements
    const results = {};
    
    // Main level privacy shades (ID: 14)
    results.main = await this.controlShade(14, 'd', repeat);
    
    // Bedroom blackout shades (ID: 40)
    results.bedroom = await this.controlShade(40, 'd', repeat);
    
    // Office privacy shades (ID: 33)
    results.office = await this.controlShade(33, 'd', repeat);
    
    // Loft all shades (ID: 48)
    results.loft = await this.controlShade(48, 'd', repeat);
    
    // Check if all commands succeeded
    const success = Object.values(results).every(r => r.success);
    
    return {
      success,
      message: 'Good Night scene executed',
      details: results
    };
  }
  
  /**
   * Execute "Rise and Shine" scene - Raise bedroom blackout shades
   */
  async executeRiseAndShineScene() {
    logger.info('Executing Rise and Shine scene');
    const repeat = configManager.get('shadeScenes.enableRepeatCommands', true);
    
    // Raise bedroom blackout shades (ID: 40)
    const result = await this.controlShade(40, 'u', repeat);
    
    return {
      success: result.success,
      message: 'Rise and Shine scene executed',
      details: result
    };
  }
  
  /**
   * Execute "Let the Sun In" scene - 7 minutes after wake up
   * Raise west-facing privacy shades in bedroom and all Loft shades
   */
  async executeLetTheSunInScene() {
    logger.info('Executing Let the Sun In scene');
    const repeat = configManager.get('shadeScenes.enableRepeatCommands', true);
    
    const results = {};
    
    // Raise west facing privacy shades in bedroom (ID: 42 & 43)
    results.bedroom42 = await this.controlShade(42, 'u', repeat);
    results.bedroom43 = await this.controlShade(43, 'u', repeat);
    
    // Raise all Loft shades (ID: 48)
    results.loft = await this.controlShade(48, 'u', repeat);
    
    // Check if all commands succeeded
    const success = Object.values(results).every(r => r.success);
    
    return {
      success,
      message: 'Let the Sun In scene executed',
      details: results
    };
  }
  
  /**
   * Execute "Start the Day" scene - 20 minutes after wake up
   * Raise most office shades with special instructions
   */
  async executeStartTheDayScene() {
    logger.info('Executing Start the Day scene');
    const repeat = configManager.get('shadeScenes.enableRepeatCommands', true);
    
    const results = {};
    
    // Raise all office privacy shades (ID: 33)
    results.officePrivacy = await this.controlShade(33, 'u', repeat);
    
    // Raise west-facing office solar shades (ID: 34)
    results.officeSolar = await this.controlShade(34, 'u', repeat);
    
    // Special instruction to send another UP command to shade 31 after 20 seconds
    setTimeout(async () => {
      try {
        const specialResult = await this.controlShade(31, 'u', repeat);
        logger.info(`Special instruction for shade 31: ${specialResult.success ? 'Success' : 'Failed'}`);
      } catch (error) {
        logger.error(`Error sending special instruction to shade 31: ${error.message}`);
      }
    }, 20000);
    
    // Check if initial commands succeeded
    const success = Object.values(results).every(r => r.success);
    
    return {
      success,
      message: 'Start the Day scene executed (special instruction for shade 31 scheduled)',
      details: results
    };
  }
}

// Create and export a singleton instance
const shadeService = new ShadeService();
module.exports = shadeService;