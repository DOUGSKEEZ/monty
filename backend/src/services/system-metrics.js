// src/services/system-metrics.js
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const serviceRegistry = require('../utils/ServiceRegistry');
const logger = require('../utils/logger');

const execPromise = util.promisify(exec);

const systemMetricsService = {
  isCore: true, // Mark as core service if critical for monitoring
  status: 'initializing',
  metrics: {
    cpuUsageHistory: [], // Array to store historical CPU % data
    memoryUsageHistory: [],
    temperatureHistory: [],
    maxHistory: 5 // Store last 5 data points
  },

  checkHealth: async () => {
    logger.info('🔄 Starting system-metrics health check');
    try {
      const metrics = {};

      // CPU Usage (calculated from /proc/stat)
      try {
        const stat = await fs.readFile('/proc/stat', 'utf8');
        const cpuLine = stat.split('\n')[0];
        const cpuValues = cpuLine.split(/\s+/).slice(1).map(Number);
        
        // Calculate CPU usage percentage
        const idle = cpuValues[3] + cpuValues[4]; // idle + iowait
        const total = cpuValues.reduce((sum, val) => sum + val, 0);
        const cpuUsage = Math.round(((total - idle) / total) * 100);
        metrics.cpuUsage = cpuUsage;
        
        // Also get processes from loadavg
        const loadavg = await fs.readFile('/proc/loadavg', 'utf8');
        metrics.processes = parseInt(loadavg.split(' ')[3].split('/')[1]);
        logger.info(`✅ CPU Usage: ${metrics.cpuUsage}%, Processes: ${metrics.processes}`);
      } catch (e) {
        logger.error(`❌ Failed to read CPU usage: ${e.message}`);
        metrics.cpuUsage = null;
        metrics.processes = null;
      }

      // Temperature (reading from /sys/class/thermal)
      try {
        const temp = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        metrics.temperature = parseInt(temp.trim()) / 1000; // Convert millidegrees to Celsius
        logger.info(`✅ Temperature: ${metrics.temperature}°C`);
      } catch (e) {
        logger.error(`❌ Failed to read temperature: ${e.message}`);
        metrics.temperature = 'N/A'; // Handle systems without thermal sensor
      }

      // Disk Usage (using df command)
      try {
        const { stdout: dfOutput } = await execPromise('df -h /');
        const dfLines = dfOutput.split('\n')[1].split(/\s+/);
        metrics.diskUsage = dfLines[4]; // e.g., "11.3%"
        metrics.diskTotal = dfLines[1]; // e.g., "97.87GB"
        logger.info(`✅ Disk Usage: ${metrics.diskUsage} of ${metrics.diskTotal}`);
      } catch (e) {
        logger.error(`❌ Failed to read disk usage: ${e.message}`);
        metrics.diskUsage = null;
        metrics.diskTotal = null;
      }

      // Memory Usage (using free command)
      try {
        const { stdout: freeOutput } = await execPromise('free -m');
        const memLine = freeOutput.split('\n')[1].split(/\s+/);
        const usedMem = parseInt(memLine[2]);
        const totalMem = parseInt(memLine[1]);
        metrics.memoryUsage = `${Math.round((usedMem / totalMem) * 100)}%`;
        
        // Swap Usage (from same free command output)
        const swapLine = freeOutput.split('\n')[2].split(/\s+/);
        const usedSwap = parseInt(swapLine[2]);
        const totalSwap = parseInt(swapLine[1]);
        metrics.swapUsage = totalSwap ? `${Math.round((usedSwap / totalSwap) * 100)}%` : '0%';
        logger.info(`✅ Memory Usage: ${metrics.memoryUsage}, Swap Usage: ${metrics.swapUsage}`);
      } catch (e) {
        logger.error(`❌ Failed to read memory usage: ${e.message}`);
        metrics.memoryUsage = null;
        metrics.swapUsage = null;
      }

      // Users Logged In (using who command)
      try {
        const { stdout: whoOutput } = await execPromise('who | wc -l');
        metrics.usersLoggedIn = parseInt(whoOutput.trim());
        logger.info(`✅ Users Logged In: ${metrics.usersLoggedIn}`);
      } catch (e) {
        logger.error(`❌ Failed to read users logged in: ${e.message}`);
        metrics.usersLoggedIn = null;
      }

      // IPv4 Address (using ip command with fallback)
      try {
        const { stdout: ipOutput } = await execPromise('ip addr show enp1s0 | grep "inet "');
        const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+)/);
        metrics.ipAddress = ipMatch ? ipMatch[1] : 'N/A';
        logger.info(`✅ IPv4 Address: ${metrics.ipAddress}`);
      } catch (e) {
        logger.error(`❌ Failed to read IPv4 address: ${e.message}`);
        try {
          // Fallback: try to get any IPv4 address
          const { stdout: ipFallback } = await execPromise('hostname -I | awk "{print $1}"');
          metrics.ipAddress = ipFallback.trim() || 'N/A';
          logger.info(`✅ IPv4 Address (fallback): ${metrics.ipAddress}`);
        } catch (fallbackError) {
          metrics.ipAddress = 'N/A';
        }
      }

      // Update historical data AFTER collecting metrics
      systemMetricsService.metrics.cpuUsageHistory.push(metrics.cpuUsage);
      systemMetricsService.metrics.memoryUsageHistory.push(metrics.memoryUsage ? parseFloat(metrics.memoryUsage) : null);
      systemMetricsService.metrics.temperatureHistory.push(metrics.temperature === 'N/A' ? null : metrics.temperature);
      
      // Trim history to maxHistory
      if (systemMetricsService.metrics.cpuUsageHistory.length > systemMetricsService.metrics.maxHistory) {
        systemMetricsService.metrics.cpuUsageHistory.shift();
        systemMetricsService.metrics.memoryUsageHistory.shift();
        systemMetricsService.metrics.temperatureHistory.shift();
      }

      // Update metrics in service (keep historical arrays intact)
      systemMetricsService.metrics = { 
        ...systemMetricsService.metrics, 
        ...metrics
      };
      
      logger.info(`✅ System Metrics Updated: CPU=${metrics.cpuUsage}%, Temp=${metrics.temperature}°C, Memory=${metrics.memoryUsage}`);
      logger.info(`📊 History Arrays: CPU=[${systemMetricsService.metrics.cpuUsageHistory}], Memory=[${systemMetricsService.metrics.memoryUsageHistory}], Temp=[${systemMetricsService.metrics.temperatureHistory}]`);
      
      return {
        status: 'ok',
        message: 'System metrics collected successfully',
        metrics: systemMetricsService.metrics
      };
    } catch (error) {
      logger.error(`❌ System-metrics checkHealth failed: ${error.message}`);
      return {
        status: 'error',
        message: `Failed to collect system metrics: ${error.message}`,
        metrics: systemMetricsService.metrics
      };
    }
  }
};

// Initialize service status
systemMetricsService.status = 'ready';

// Register the service
serviceRegistry.register('SystemMetrics', systemMetricsService);

module.exports = systemMetricsService;