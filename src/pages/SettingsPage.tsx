import React, { useState, useEffect } from 'react';
import './SettingsPage.css';

interface SettingsState {
  weatherRefreshInterval: number;
  autoCloseShades: boolean;
  autoCloseTime: string;
  autoOpenShades: boolean;
  autoOpenTime: string;
  apiKey: string;
  latitude: string;
  longitude: string;
}

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState>({
    weatherRefreshInterval: 15,
    autoCloseShades: false,
    autoCloseTime: '19:00',
    autoOpenShades: false,
    autoOpenTime: '07:00',
    apiKey: '',
    latitude: '',
    longitude: ''
  });

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    // In a real app, we would load settings from an API or localStorage
    // For now, we'll just simulate loading environment variables
    const loadSettings = async () => {
      // Simulating API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setSettings({
        weatherRefreshInterval: 15,
        autoCloseShades: false,
        autoCloseTime: '19:00',
        autoOpenShades: false,
        autoOpenTime: '07:00',
        apiKey: 'your_api_key_here', // From .env
        latitude: '51.507351', // From .env
        longitude: '-0.127758' // From .env
      });
    };

    loadSettings();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage('');

    try {
      // Simulating API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // In a real app, we would save to an API or localStorage
      console.log('Saving settings:', settings);
      
      setSaveMessage('Settings saved successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage('Error saving settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      
      <form onSubmit={handleSave} className="settings-form">
        <div className="settings-section">
          <h2>Weather Settings</h2>
          
          <div className="form-group">
            <label htmlFor="weatherRefreshInterval">Weather Refresh Interval (minutes):</label>
            <input
              type="number"
              id="weatherRefreshInterval"
              name="weatherRefreshInterval"
              min="5"
              max="60"
              value={settings.weatherRefreshInterval}
              onChange={handleInputChange}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="apiKey">OpenWeatherMap API Key:</label>
            <input
              type="text"
              id="apiKey"
              name="apiKey"
              value={settings.apiKey}
              onChange={handleInputChange}
              className="full-width"
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="latitude">Latitude:</label>
              <input
                type="text"
                id="latitude"
                name="latitude"
                value={settings.latitude}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="longitude">Longitude:</label>
              <input
                type="text"
                id="longitude"
                name="longitude"
                value={settings.longitude}
                onChange={handleInputChange}
              />
            </div>
          </div>
        </div>
        
        <div className="settings-section">
          <h2>Shade Automation</h2>
          
          <div className="form-group checkbox-group">
            <input
              type="checkbox"
              id="autoCloseShades"
              name="autoCloseShades"
              checked={settings.autoCloseShades}
              onChange={handleInputChange}
            />
            <label htmlFor="autoCloseShades">Automatically close shades at:</label>
            <input
              type="time"
              id="autoCloseTime"
              name="autoCloseTime"
              value={settings.autoCloseTime}
              onChange={handleInputChange}
              disabled={!settings.autoCloseShades}
            />
          </div>
          
          <div className="form-group checkbox-group">
            <input
              type="checkbox"
              id="autoOpenShades"
              name="autoOpenShades"
              checked={settings.autoOpenShades}
              onChange={handleInputChange}
            />
            <label htmlFor="autoOpenShades">Automatically open shades at:</label>
            <input
              type="time"
              id="autoOpenTime"
              name="autoOpenTime"
              value={settings.autoOpenTime}
              onChange={handleInputChange}
              disabled={!settings.autoOpenShades}
            />
          </div>
        </div>
        
        <div className="form-actions">
          {saveMessage && (
            <div className={`save-message ${saveMessage.includes('Error') ? 'error' : 'success'}`}>
              {saveMessage}
            </div>
          )}
          
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
