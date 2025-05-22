/**
 * Absolute minimal FIFO test for pianobar commands
 * No dependencies on any other modules in the project
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Config
const homeDir = process.env.HOME || '/home/monty';
const pianobarConfigDir = path.join(homeDir, '.config/pianobar');
const pianobarCtl = path.join(pianobarConfigDir, 'ctl');

console.log('Starting direct FIFO test...');
console.log(`FIFO path: ${pianobarCtl}`);

// Ensure FIFO exists
async function ensureFifo() {
  console.log('Ensuring FIFO exists...');
  
  // Check if config dir exists
  if (!fs.existsSync(pianobarConfigDir)) {
    console.log(`Creating config dir: ${pianobarConfigDir}`);
    fs.mkdirSync(pianobarConfigDir, { recursive: true });
  }
  
  // Check if FIFO exists and is actually a FIFO
  let needNewFifo = false;
  
  if (fs.existsSync(pianobarCtl)) {
    try {
      const stats = fs.statSync(pianobarCtl);
      if (!stats.isFIFO()) {
        console.log('Found non-FIFO file, removing and recreating');
        fs.unlinkSync(pianobarCtl);
        needNewFifo = true;
      } else {
        console.log('FIFO exists and is valid');
      }
    } catch (error) {
      console.error(`Error checking FIFO: ${error.message}`);
      try {
        fs.unlinkSync(pianobarCtl);
      } catch (unlinkError) {
        console.error(`Error removing bad FIFO: ${unlinkError.message}`);
      }
      needNewFifo = true;
    }
  } else {
    console.log('FIFO does not exist, creating it');
    needNewFifo = true;
  }
  
  // Create new FIFO if needed
  if (needNewFifo) {
    try {
      console.log('Creating new FIFO...');
      await execPromise(`mkfifo ${pianobarCtl}`);
      await execPromise(`chmod 666 ${pianobarCtl}`);
      console.log('FIFO created successfully');
    } catch (error) {
      console.error(`Error creating FIFO: ${error.message}`);
      throw error;
    }
  }
  
  // Set permissions
  try {
    await execPromise(`chmod 666 ${pianobarCtl}`);
    console.log('FIFO permissions set to 666');
  } catch (error) {
    console.error(`Error setting FIFO permissions: ${error.message}`);
  }
}

// Send command to FIFO
async function sendCommand(command) {
  console.log(`Sending command: ${command}`);
  
  // Simple synchronous write with timeout
  const startTime = Date.now();
  
  try {
    // Create a promise that resolves when the write completes
    const writePromise = new Promise((resolve, reject) => {
      try {
        fs.writeFileSync(pianobarCtl, `${command}\n`, { encoding: 'utf8' });
        resolve({ success: true });
      } catch (error) {
        reject(error);
      }
    });
    
    // Create a timeout promise
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: false, timedOut: true });
      }, 3000);
    });
    
    // Race between write and timeout
    const result = await Promise.race([writePromise, timeoutPromise]);
    
    if (result.timedOut) {
      console.log('Command timed out after 3 seconds');
      return { success: false, timedOut: true };
    }
    
    const duration = Date.now() - startTime;
    console.log(`Command sent successfully in ${duration}ms`);
    return { success: true, duration };
  } catch (error) {
    console.error(`Error sending command: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main function
async function main() {
  try {
    // Ensure FIFO exists
    await ensureFifo();
    
    // Commands to test
    const commands = [
      { name: 'play/pause', cmd: 'p' },
      { name: 'next song', cmd: 'n' },
      { name: 'love song', cmd: '+' }
    ];
    
    // Send each command with a delay between them
    for (const command of commands) {
      console.log(`\n--- Testing ${command.name} (${command.cmd}) ---`);
      const result = await sendCommand(command.cmd);
      console.log(`Result: ${JSON.stringify(result)}`);
      
      // Wait between commands
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\nAll commands sent successfully');
    process.exit(0);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();