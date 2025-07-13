// Multi-platform Notification Service
// Supports Telegram, Discord, PagerDuty, and more

const logger = require('../utils/logger').getModuleLogger('notifications');

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.enabledPlatforms = [];
    
    // Load configuration from environment
    this.config = {
      telegram: {
        enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
        apiUrl: 'https://api.telegram.org/bot'
      },
      discord: {
        enabled: !!process.env.DISCORD_WEBHOOK_URL,
        webhookUrl: process.env.DISCORD_WEBHOOK_URL
      },
      pagerduty: {
        enabled: !!process.env.PAGERDUTY_INTEGRATION_KEY,
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        apiUrl: 'https://events.pagerduty.com/v2/enqueue'
      }
    };
  }

  initialize() {
    if (this.isInitialized) return;

    // Check which platforms are configured
    Object.entries(this.config).forEach(([platform, config]) => {
      if (config.enabled) {
        this.enabledPlatforms.push(platform);
        logger.info(`${platform} notifications enabled`);
      } else {
        logger.warn(`${platform} notifications disabled - missing configuration`);
      }
    });

    if (this.enabledPlatforms.length === 0) {
      logger.warn('No notification platforms configured');
    } else {
      logger.info(`Notification service initialized with platforms: ${this.enabledPlatforms.join(', ')}`);
    }

    this.isInitialized = true;
  }

  async sendAlert(title, message, severity = 'info', metadata = {}) {
    this.initialize();

    if (this.enabledPlatforms.length === 0) {
      logger.warn('No notification platforms available');
      return { success: false, error: 'No platforms configured' };
    }

    const results = {};

    // Send to all enabled platforms in parallel
    const promises = this.enabledPlatforms.map(async (platform) => {
      try {
        let result;
        switch (platform) {
          case 'telegram':
            result = await this.sendTelegram(title, message, severity, metadata);
            break;
          case 'discord':
            result = await this.sendDiscord(title, message, severity, metadata);
            break;
          case 'pagerduty':
            result = await this.sendPagerDuty(title, message, severity, metadata);
            break;
          default:
            throw new Error(`Unknown platform: ${platform}`);
        }
        results[platform] = { success: true, ...result };
      } catch (error) {
        logger.error(`Failed to send ${platform} notification:`, error.message);
        results[platform] = { success: false, error: error.message };
      }
    });

    await Promise.allSettled(promises);
    
    const successCount = Object.values(results).filter(r => r.success).length;
    
    return {
      success: successCount > 0,
      platforms: results,
      successCount,
      totalPlatforms: this.enabledPlatforms.length
    };
  }

  async sendTelegram(title, message, severity, metadata) {
    const config = this.config.telegram;
    
    // Format message with emoji based on severity
    const emoji = this.getSeverityEmoji(severity);
    const formattedMessage = `${emoji} *${title}*\n\n${message}\n\n_${new Date().toISOString()}_`;
    
    const url = `${config.apiUrl}${config.botToken}/sendMessage`;
    const payload = {
      chat_id: config.chatId,
      text: formattedMessage,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return { messageId: result.result.message_id };
  }

  async sendDiscord(title, message, severity, metadata) {
    const config = this.config.discord;
    
    // Discord embed colors
    const colors = {
      critical: 0xFF0000, // Red
      error: 0xFF4500,    // Orange Red
      warning: 0xFFA500,  // Orange
      info: 0x0099FF,     // Blue
      success: 0x00FF00   // Green
    };

    const embed = {
      title: title,
      description: message,
      color: colors[severity] || colors.info,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Monty Home Automation'
      },
      fields: []
    };

    // Add metadata as fields
    if (metadata && Object.keys(metadata).length > 0) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (embed.fields.length < 25) { // Discord limit
          embed.fields.push({
            name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value: String(value),
            inline: true
          });
        }
      });
    }

    const payload = {
      embeds: [embed]
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord webhook error: ${response.status} - ${error}`);
    }

    return { success: true };
  }

  async sendPagerDuty(title, message, severity, metadata) {
    const config = this.config.pagerduty;
    
    // Map severity to PagerDuty event action
    const eventAction = ['critical', 'error'].includes(severity) ? 'trigger' : 'trigger';
    
    const payload = {
      routing_key: config.integrationKey,
      event_action: eventAction,
      dedup_key: `shadecommander-${metadata.error_type || 'unknown'}-${Date.now()}`,
      payload: {
        summary: title,
        source: 'Monty Home Automation',
        severity: severity,
        component: 'ShadeCommander',
        group: 'Home Automation',
        class: 'Infrastructure',
        custom_details: {
          message: message,
          timestamp: new Date().toISOString(),
          ...metadata
        }
      }
    };

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PagerDuty API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return { dedupKey: result.dedup_key, message: result.message };
  }

  getSeverityEmoji(severity) {
    const emojis = {
      critical: '🚨',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅'
    };
    return emojis[severity] || '📢';
  }

  // Convenience methods for different alert types
  async sendShadeCommanderDown(error, metadata = {}) {
    return this.sendAlert(
      'ShadeCommander Service Down',
      `ShadeCommander is not responding: ${error}`,
      'critical',
      { service: 'ShadeCommander', ...metadata }
    );
  }

  async sendShadeCommanderDegraded(details, metadata = {}) {
    const issues = [];
    if (!details.arduino_connected) issues.push('Arduino disconnected');
    if (!details.database_accessible) issues.push('Database inaccessible');
    
    return this.sendAlert(
      'ShadeCommander Service Degraded',
      `ShadeCommander is responding but degraded: ${issues.join(', ')}`,
      'warning',
      { service: 'ShadeCommander', ...metadata }
    );
  }

  async sendShadeCommanderRecovered(metadata = {}) {
    return this.sendAlert(
      'ShadeCommander Service Recovered',
      'ShadeCommander is now healthy and responding normally',
      'success',
      { service: 'ShadeCommander', ...metadata }
    );
  }

  async sendTestAlert() {
    return this.sendAlert(
      'Notification Test',
      'This is a test notification from Monty Home Automation system',
      'info',
      { test: true, timestamp: new Date().toISOString() }
    );
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      enabledPlatforms: this.enabledPlatforms,
      configuration: Object.fromEntries(
        Object.entries(this.config).map(([platform, config]) => [
          platform,
          { enabled: config.enabled }
        ])
      )
    };
  }
}

// Export singleton instance
const notificationService = new NotificationService();
module.exports = notificationService;