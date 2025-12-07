import React, { useState, useEffect } from 'react';
import { useAppContext } from '../utils/AppContext';
import AwayManager from '../components/AwayManager';
import AwayDatePicker from '../components/AwayDatePicker';
import AwayCalendarDisplay from '../components/AwayCalendarDisplay';
import AwayPeriodsList from '../components/AwayPeriodsList';

function SettingsPage() {
  // Get state and actions from context
  const { scheduler, weather, theme, actions } = useAppContext();
  
  // Component state
  const [saving, setSaving] = useState(false);
  const [testingScene, setTestingScene] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [operationMessage, setOperationMessage] = useState('');
  const [arduinoStatus, setArduinoStatus] = useState({ connected: false, loading: true });

  // Form states (initialized from context)
  const [sceneSettings, setSceneSettings] = useState({
    good_afternoon_time: '14:30',
    good_evening_offset_minutes: 60,
    good_night_offset_minutes: 0
  });
  // Draft states for explicit save behavior
  const [sceneDrafts, setSceneDrafts] = useState({
    good_afternoon_time: '14:30',
    good_evening_offset_minutes: 60,
    good_night_offset_minutes: 0
  });
  const [sceneChanges, setSceneChanges] = useState({
    good_afternoon_time: false,
    good_evening_offset_minutes: false,
    good_night_offset_minutes: false
  });
  const [wakeUpSettings, setWakeUpSettings] = useState({
    enabled: false,
    time: '',
    good_morning_delay_minutes: 15
  });
  // Draft state for wake-up delay
  const [wakeUpDelayDraft, setWakeUpDelayDraft] = useState(15);
  const [wakeUpDelayChanged, setWakeUpDelayChanged] = useState(false);
  const [musicSettings, setMusicSettings] = useState({
    enabled_for_morning: true,
    enabled_for_evening: true,
    enabled_for_afternoon: false,
    enabled_for_night: false
  });
  const [timezoneSettings, setTimezoneSettings] = useState({
    current: 'America/Denver',
    display: 'America/Denver (Mountain Time)',
    systemTime: ''
  });

  // Update form states when scheduler config changes
  useEffect(() => {
    if (scheduler.config) {
      const config = scheduler.config;
      
      const sceneConfig = {
        good_afternoon_time: config.scenes?.good_afternoon_time || '14:30',
        good_evening_offset_minutes: config.scenes?.good_evening_offset_minutes || 60,
        good_night_offset_minutes: config.scenes?.good_night_offset_minutes || 0
      };
      setSceneSettings(sceneConfig);
      setSceneDrafts(sceneConfig);
      setSceneChanges({
        good_afternoon_time: false,
        good_evening_offset_minutes: false,
        good_night_offset_minutes: false
      });
      
      const wakeUpConfig = {
        enabled: config.wake_up?.enabled || false,
        time: config.wake_up?.time || '',
        good_morning_delay_minutes: config.wake_up?.good_morning_delay_minutes || 15
      };
      setWakeUpSettings(wakeUpConfig);
      setWakeUpDelayDraft(wakeUpConfig.good_morning_delay_minutes);
      setWakeUpDelayChanged(false);
      
      setMusicSettings({
        enabled_for_morning: config.music?.enabled_for_morning !== undefined ? config.music.enabled_for_morning : true,
        enabled_for_evening: config.music?.enabled_for_evening !== undefined ? config.music.enabled_for_evening : true,
        enabled_for_afternoon: config.music?.enabled_for_afternoon !== undefined ? config.music.enabled_for_afternoon : false,
        enabled_for_night: config.music?.enabled_for_night !== undefined ? config.music.enabled_for_night : false
      });
    }
  }, [scheduler.config]);

  // Load configuration on mount
  useEffect(() => {
    console.log('🛠️ SettingsPage mounted - loading scheduler data...');
    actions.refreshScheduler();
    loadArduinoStatus();
    loadSystemTimezone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: intentionally run once to initialize page

  // Load Arduino status
  const loadArduinoStatus = async () => {
    try {
      const response = await fetch('http://192.168.10.15:8000/health');
      const health = await response.json();
      setArduinoStatus({
        connected: health.arduino_connected,
        loading: false,
        lastCommand: health.last_command_time,
        uptime: health.uptime_seconds
      });
    } catch (error) {
      console.error('Error loading Arduino status:', error);
      setArduinoStatus({ connected: false, loading: false, error: true });
    }
  };

  // Load system timezone
  const loadSystemTimezone = async () => {
    try {
      const response = await fetch('/api/system/timezone');
      const result = await response.json();
      
      if (result.success) {
        setTimezoneSettings({
          current: result.data.timezone,
          display: getTimezoneDisplay(result.data.timezone),
          systemTime: result.data.currentTime
        });
      }
    } catch (error) {
      console.error('Error loading system timezone:', error);
    }
  };

  // Show success message helper
  const showSuccess = (message) => {
    setSaveSuccess('success');
    setOperationMessage(message);
    setTimeout(() => {
      setSaveSuccess(null);
      setOperationMessage('');
    }, 3000);
  };

  // Show error message helper
  const showError = (message) => {
    setSaveSuccess('error');
    setOperationMessage(message);
    setTimeout(() => {
      setSaveSuccess(null);
      setOperationMessage('');
    }, 5000);
  };

  // Handle scene draft changes
  const handleSceneDraftChange = (field, value) => {
    setSceneDrafts(prev => ({ ...prev, [field]: value }));
    setSceneChanges(prev => ({ 
      ...prev, 
      [field]: value !== sceneSettings[field] 
    }));
  };

  // Save individual scene setting
  const saveSceneSetting = async (field) => {
    const updatedSetting = { [field]: sceneDrafts[field] };
    await updateSceneSettings(updatedSetting);
    // Reset change tracking for this field
    setSceneChanges(prev => ({ ...prev, [field]: false }));
  };

  // Handle wake-up delay draft changes
  const handleWakeUpDelayChange = (value) => {
    setWakeUpDelayDraft(value);
    setWakeUpDelayChanged(value !== wakeUpSettings.good_morning_delay_minutes);
  };

  // Save wake-up delay setting
  const saveWakeUpDelay = async () => {
    await updateWakeUpSettings({ good_morning_delay_minutes: wakeUpDelayDraft });
    setWakeUpDelayChanged(false);
  };

  // Update scene timing settings
  const updateSceneSettings = async (updatedSettings) => {
    try {
      setSaving(true);
      
      const result = await actions.updateSchedulerConfig('scenes', updatedSettings);
      
      if (result.success) {
        setSceneSettings(prev => ({ ...prev, ...updatedSettings }));
        setSceneDrafts(prev => ({ ...prev, ...updatedSettings }));
        showSuccess('Scene timing updated successfully');
      } else {
        showError(`Failed to update scene settings: ${result.error}`);
      }
    } catch (err) {
      showError(`Error updating scene settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Update wake up settings
  const updateWakeUpSettings = async (updatedSettings) => {
    try {
      setSaving(true);
      
      const result = await actions.updateSchedulerConfig('wakeUp', updatedSettings);
      
      if (result.success) {
        setWakeUpSettings(prev => ({ ...prev, ...updatedSettings }));
        // Update draft state for delay if it was changed
        if (updatedSettings.good_morning_delay_minutes !== undefined) {
          setWakeUpDelayDraft(updatedSettings.good_morning_delay_minutes);
        }
        if (updatedSettings.time === '') {
          showSuccess('Wake up alarm cleared successfully');
        } else {
          showSuccess('Wake up settings updated successfully');
        }
      } else {
        showError(`Failed to update wake up settings: ${result.error}`);
      }
    } catch (err) {
      showError(`Error updating wake up settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Update music settings
  const updateMusicSettings = async (updatedSettings) => {
    try {
      setSaving(true);
      
      const result = await actions.updateSchedulerConfig('music', updatedSettings);
      
      if (result.success) {
        setMusicSettings(prev => ({ ...prev, ...updatedSettings }));
        showSuccess('Music settings updated successfully');
      } else {
        showError(`Failed to update music settings: ${result.error}`);
      }
    } catch (err) {
      showError(`Error updating music settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Timezone is now read-only - no change functionality

  // Test a scene manually
  const testScene = async (sceneName) => {
    try {
      setTestingScene(sceneName);
      setTestResult(null);
      
      const result = await actions.testSchedulerScene(sceneName);
      
      setTestResult({
        success: result.success,
        message: result.message || result.error,
        sceneName: sceneName
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: `Error testing scene: ${err.message}`,
        sceneName: sceneName
      });
    } finally {
      setTestingScene(null);
    }
  };

  // Timezone helper function for display
  const getTimezoneDisplay = (timezone) => {
    const timezoneMap = {
      'America/Los_Angeles': 'Pacific Time',
      'America/Denver': 'Mountain Time', 
      'America/Chicago': 'Central Time',
      'America/New_York': 'Eastern Time',
      'America/Phoenix': 'Arizona Time',
      'Pacific/Honolulu': 'Hawaii Time',
      'America/Anchorage': 'Alaska Time'
    };
    const name = timezoneMap[timezone] || timezone;
    return `${timezone} (${name})`;
  };

  // Calculate time until alarm
  const calculateTimeUntilAlarm = (alarmTime) => {
    if (!alarmTime) return '';
    
    try {
      const now = new Date();
      const [hours, minutes] = alarmTime.split(':').map(Number);
      
      // Create alarm time for today
      const today = new Date();
      const alarmToday = new Date(today);
      alarmToday.setHours(hours, minutes, 0, 0);
      
      // If alarm time has passed today, it's for tomorrow
      let alarmDateTime = alarmToday;
      if (alarmToday <= now) {
        alarmDateTime = new Date(alarmToday);
        alarmDateTime.setDate(alarmDateTime.getDate() + 1);
      }
      
      // Calculate time difference
      const diff = alarmDateTime - now;
      const hoursUntil = Math.floor(diff / (1000 * 60 * 60));
      const minutesUntil = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hoursUntil === 0) {
        return `Alarm set for ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''} from now`;
      } else if (minutesUntil === 0) {
        return `Alarm set for ${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''} from now`;
      } else {
        return `Alarm set for ${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''} and ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''} from now`;
      }
    } catch (error) {
      console.error('Error calculating time until alarm:', error);
      return '';
    }
  };

  if (scheduler.loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (scheduler.error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error</p>
          <p>{scheduler.error}</p>
          <button 
            onClick={() => actions.refreshScheduler()}
            className="mt-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">

     {/* Scheduler Status Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">📊</span>
          Scheduler Status
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Events Summary:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              {scheduler.schedules && Object.keys(scheduler.schedules).length > 0 ? (
                (() => {
                  // Calculate Good Morning time based on wake-up alarm + delay
                  const getGoodMorningTime = () => {
                    if (!scheduler.wakeUpStatus?.enabled || !scheduler.wakeUpStatus?.time) {
                      return 'Alarm Not Set';
                    }
                    
                    const [hours, minutes] = scheduler.wakeUpStatus.time.split(':').map(Number);
                    const delayMinutes = scheduler.config?.wake_up?.good_morning_delay_minutes || 20;
                    
                    // Add delay to wake-up time
                    const totalMinutes = (hours * 60) + minutes + delayMinutes;
                    const goodMorningHours = Math.floor(totalMinutes / 60) % 24;
                    const goodMorningMinutes = totalMinutes % 60;
                    
                    // Format as 12-hour time
                    const hour12 = goodMorningHours === 0 ? 12 : (goodMorningHours > 12 ? goodMorningHours - 12 : goodMorningHours);
                    const ampm = goodMorningHours >= 12 ? 'PM' : 'AM';
                    const minuteStr = goodMorningMinutes.toString().padStart(2, '0');
                    
                    return `${hour12}:${minuteStr} ${ampm}`;
                  };

                  // Get wake up alarm time
                  const getWakeUpTime = () => {
                    if (!scheduler.wakeUpStatus?.enabled || !scheduler.wakeUpStatus?.time) {
                      return 'N/A';
                    }
                    
                    const [hours, minutes] = scheduler.wakeUpStatus.time.split(':').map(Number);
                    const hour12 = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    const minuteStr = minutes.toString().padStart(2, '0');
                    
                    return `${hour12}:${minuteStr} ${ampm}`;
                  };

                  // Create ordered events array
                  const orderedEvents = [
                    { name: 'Wake Up (Alarm)', time: getWakeUpTime() },
                    { name: 'Good Morning', time: getGoodMorningTime() },
                    { name: 'Good Afternoon', time: scheduler.schedules.good_afternoon || 'Not scheduled' },
                    { name: 'Good Evening', time: scheduler.schedules.good_evening || 'Not scheduled' },
                    { name: 'Good Night', time: scheduler.schedules.good_night || 'Not scheduled' }
                  ];

                  return orderedEvents.map((event, index) => (
                    <li key={index} className="text-base font-semibold text-gray-800">
                      • <span className="font-bold">{event.name}:</span> <span className="text-blue-600">{event.time}</span>
                    </li>
                  ));
                })()
              ) : (
                <li>• Loading schedule...</li>
              )}
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">System Status:</h3>
            <div className="space-y-2">
              {/* Scheduler Status */}
              <div className="flex items-center">
                <span className="inline-block w-3 h-3 rounded-full mr-3 bg-green-500"></span>
                <div>
                  <span className="text-sm font-medium text-gray-700">Scheduler Status:</span>
                  <span className="ml-2 text-sm font-semibold text-green-600">Active</span>
                </div>
              </div>
              
              {/* Next Scene Display - Make it prominent */}
              {scheduler.config?.serviceHealth?.message && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">Next Scene:</p>
                  {(() => {
                    // Extract next scene from message like "Scheduler active, next: Good Night at 8:56 PM"
                    const message = scheduler.config.serviceHealth.message;
                    const nextSceneMatch = message.match(/next:\s*(.+)/i);
                    
                    if (nextSceneMatch) {
                      return (
                        <p className="text-xl font-bold text-bold-1000">
                          {nextSceneMatch[1]}
                        </p>
                      );
                    } else {
                      return (
                        <p className="text-sm text-gray-600">
                          {message}
                        </p>
                      );
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Wake Up Alarm Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">⏰</span>
          Wake Up Alarm
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Wake Up Time
            </label>
            <div className="flex gap-2">
              <input
                type="time"
                value={wakeUpSettings.time}
                onChange={(e) => setWakeUpSettings(prev => ({ ...prev, time: e.target.value }))}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
              <button
                onClick={() => updateWakeUpSettings({ time: wakeUpSettings.time })}
                disabled={saving || !wakeUpSettings.time}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Set
              </button>
              <button
                onClick={() => updateWakeUpSettings({ time: '' })}
                disabled={saving}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Good Morning Delay (minutes after Rise'n'Shine)
            </label>
            <div className="flex gap-2 items-center mb-3">
              <input
                type="number"
                min="5"
                max="60"
                step="5"
                value={wakeUpDelayDraft}
                onChange={(e) => handleWakeUpDelayChange(parseInt(e.target.value))}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-20"
              />
              <button
                onClick={saveWakeUpDelay}
                disabled={saving || !wakeUpDelayChanged}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Update
              </button>
            </div>
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={musicSettings.enabled_for_morning}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setMusicSettings(prev => ({ ...prev, enabled_for_morning: enabled }));
                  updateMusicSettings({ enabled_for_morning: enabled });
                }}
                className="mr-2"
              />
              <span className="text-gray-600">🎵 Start music automatically</span>
            </label>
          </div>
        </div>
        
        <div className="mt-4">
          {/* Actual Alarm Status Display */}
          {scheduler.wakeUpStatus && scheduler.wakeUpStatus.enabled ? (
            <div className="alarm-status bg-green-50 border border-green-200 rounded p-4">
              <p className="text-lg font-medium text-green-700 mb-1">
                {scheduler.wakeUpStatus.nextWakeUpDateTime}
              </p>
              <p className="text-sm text-green-600">
                {calculateTimeUntilAlarm(scheduler.wakeUpStatus.time)}
              </p>
              {scheduler.wakeUpStatus.lastTriggered_formatted && (
                <p className="text-xs text-gray-500 mt-2">
                  Last Triggered: {scheduler.wakeUpStatus.lastTriggered_formatted}
                </p>
              )}
            </div>
          ) : (
            <div className="alarm-status bg-gray-50 border border-gray-200 rounded p-4">
              <p className="text-gray-600">
                <span className="mr-2">⏰</span>No alarm currently set
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Scene Timing Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">📅</span>
          Scene Timing & Scheduling
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            {/* Solar Noon Display */}
            {weather.sunTimes?.solarNoon && (
              <div className="text-xs text-gray-400 mb-1">
                Solar noon: {new Date(weather.sunTimes.solarNoon).toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit', 
                  hour12: true 
                })}
              </div>
            )}
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Good Afternoon Time
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="time"
                value={sceneDrafts.good_afternoon_time}
                onChange={(e) => handleSceneDraftChange('good_afternoon_time', e.target.value)}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
              <button
                onClick={() => saveSceneSetting('good_afternoon_time')}
                disabled={saving || !sceneChanges.good_afternoon_time}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Update
              </button>
            </div>
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={musicSettings.enabled_for_afternoon}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setMusicSettings(prev => ({ ...prev, enabled_for_afternoon: enabled }));
                  updateMusicSettings({ enabled_for_afternoon: enabled });
                }}
                className="mr-2"
              />
              <span className="text-gray-600">🎵 Start music automatically</span>
            </label>
          </div>
          
          <div>
            {/* Sunset Time Display */}
            {weather.sunTimes?.sunsetTime && (
              <div className="text-xs text-gray-400 mb-1">
                Sunset: {weather.sunTimes.sunsetTime}
              </div>
            )}
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Good Evening (minutes before sunset)
            </label>
            <div className="flex gap-2 items-center mb-3">
              <input
                type="number"
                min="0"
                max="180"
                step="15"
                value={sceneDrafts.good_evening_offset_minutes}
                onChange={(e) => handleSceneDraftChange('good_evening_offset_minutes', parseInt(e.target.value))}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-20"
              />
              <button
                onClick={() => saveSceneSetting('good_evening_offset_minutes')}
                disabled={saving || !sceneChanges.good_evening_offset_minutes}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Update
              </button>
            </div>
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={musicSettings.enabled_for_evening}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setMusicSettings(prev => ({ ...prev, enabled_for_evening: enabled }));
                  updateMusicSettings({ enabled_for_evening: enabled });
                }}
                className="mr-2"
              />
              <span className="text-gray-600">🎵 Start music automatically</span>
            </label>
          </div>
          
          <div>
            {/* Civil Twilight End Display */}
            {weather.sunTimes?.civilTwilightEnd && (
              <div className="text-xs text-gray-400 mb-1">
                Civil twilight: {new Date(weather.sunTimes.civilTwilightEnd).toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit', 
                  hour12: true 
                })}
              </div>
            )}
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Good Night (civil twilight offset)
            </label>
            <div className="flex gap-2 items-center mb-3">
              <input
                type="number"
                min="-120"
                max="60"
                step="5"
                value={sceneDrafts.good_night_offset_minutes}
                onChange={(e) => handleSceneDraftChange('good_night_offset_minutes', parseInt(e.target.value))}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-20"
              />
              <span className="text-sm text-gray-500">minutes</span>
              <button
                onClick={() => saveSceneSetting('good_night_offset_minutes')}
                disabled={saving || !sceneChanges.good_night_offset_minutes}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                Update
              </button>
            </div>
            
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={musicSettings.enabled_for_night}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setMusicSettings(prev => ({ ...prev, enabled_for_night: enabled }));
                  updateMusicSettings({ enabled_for_night: enabled });
                }}
                className="mr-2"
              />
              <span className="text-gray-600">🎵 Start music automatically</span>
            </label>
          </div>
        </div>
      </div>

      {/* Theme Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🎨</span>
          Theme
        </h2>

        {/* Mode Selection and Current Theme */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Mode Selection */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-1">Mode:</h3>
            <div className="space-y-2">
              <label className="flex items-center cursor-pointer p-2 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="themeMode"
                  checked={theme.mode === 'festive'}
                  onChange={() => actions.setThemeMode('festive')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-medium">🎉 Auto Seasonal</span>
              </label>

              <label className="flex items-center cursor-pointer p-2 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="themeMode"
                  checked={theme.mode === 'manual'}
                  onChange={() => actions.setThemeMode('manual')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🎯 Manual Select</span>
              </label>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
              <p className="font-medium mb-1">Current:</p>
              <p className="text-gray-700">
                {theme.currentTheme === 'default' ? '🔵 Default' :
                 theme.currentTheme === 'xmas' ? (theme.mode === 'festive' ? '🎉 Christmas' : '🎄 Christmas') :
                 theme.currentTheme === 'northern-lights' ? (theme.mode === 'festive' ? '🎉 Northern Lights' : '🌌 Northern Lights') :
                 theme.currentTheme === 'fireworks-patriotic' ? (theme.mode === 'festive' ? '🎉 Patriotic' : '🇺🇸 Patriotic') :
                 theme.mode === 'festive' ? `🎉 ${theme.currentTheme.charAt(0).toUpperCase() + theme.currentTheme.slice(1)}` :
                 theme.currentTheme.charAt(0).toUpperCase() + theme.currentTheme.slice(1)}
              </p>
            </div>
          </div>

          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Seasonal/Image Themes */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">🌍 Seasonal (Image)</h3>
            <div className="space-y-0">
              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'default'}
                  onChange={() => actions.setManualTheme('default')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🔵 Default</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'summer'}
                  onChange={() => actions.setManualTheme('summer')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">☀️ Summer</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'autumn'}
                  onChange={() => actions.setManualTheme('autumn')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🍂 Autumn</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'halloween'}
                  onChange={() => actions.setManualTheme('halloween')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🎃 Halloween</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'winter'}
                  onChange={() => actions.setManualTheme('winter')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">❄️ Winter</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'xmas'}
                  onChange={() => actions.setManualTheme('xmas')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🎄 Christmas</span>
              </label>
            </div>
          </div>

          {/* Animated Themes */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">✨ Animated (CSS)</h3>
            <div className="space-y-0">
              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'birthday'}
                  onChange={() => actions.setManualTheme('birthday')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🎂 Birthday</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'northern-lights'}
                  onChange={() => actions.setManualTheme('northern-lights')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🌌 Northern Lights</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'fireworks'}
                  onChange={() => actions.setManualTheme('fireworks')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🎆 Fireworks</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'fireworks-patriotic'}
                  onChange={() => actions.setManualTheme('fireworks-patriotic')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🇺🇸 Patriotic</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'starfield'}
                  onChange={() => actions.setManualTheme('starfield')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">⭐ Starfield</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'matrix'}
                  onChange={() => actions.setManualTheme('matrix')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">🟢 Matrix</span>
              </label>

              <label className="flex items-center cursor-pointer p-1 rounded hover:bg-gray-50">
                <input
                  type="radio"
                  name="manualTheme"
                  checked={theme.currentTheme === 'neon'}
                  onChange={() => actions.setManualTheme('neon')}
                  className="mr-2 w-4 h-4"
                />
                <span className="text-sm">💡 Neon</span>
              </label>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* System Controls Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">⚙️</span>
          System Controls
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pianobar Controls */}
          <div>
            <h3 className="text-md font-semibold text-gray-700 mb-3">Pianobar 🎹 🎶</h3>
          <br></br>
          <button
            onClick={async () => {
              if (window.confirm('Are you sure you want to kill all Pianobar processes?\n\nThis will immediately terminate Pianobar and stop all music playback.')) {
                try {
                  setOperationMessage('Killing Pianobar processes...');
                  setSaveSuccess('loading');
                  
                  const result = await actions.controlPianobar('kill');
                  
                  if (result) {
                    showSuccess('Pianobar processes terminated successfully');
                  } else {
                    showError('Failed to kill Pianobar processes');
                  }
                } catch (error) {
                  showError(`Error killing Pianobar: ${error.message}`);
                }
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition-colors duration-200"
          >
            Kill Pianobar
          </button>
          
          <p className="text-xs text-red-600 mt-2">
            This button uses <code>kill -9</code> to forcefully terminate processes. <br></br>Use only when normal stop doesn't work.
          </p>
          </div>

          {/* ShadeCommander Controls */}
          <div>
            <h3 className="text-md font-semibold text-gray-700 mb-3">ShadeCommander 🫡</h3>
            
            {/* Arduino Status with Reconnect Button */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <span className="font-medium text-gray-700 mr-2">Arduino Status:</span>
                  {arduinoStatus.loading ? (
                    <span className="text-gray-500">Loading...</span>
                  ) : (
                    <div className="flex items-center">
                      <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
                        arduinoStatus.connected ? 'bg-green-500' : 'bg-red-500'
                      }`}></span>
                      <span className={arduinoStatus.connected ? 'text-green-700' : 'text-red-700'}>
                        {arduinoStatus.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={async () => {
                    if (arduinoStatus.connected && !window.confirm('Arduino is currently connected. Are you sure you want to force a reconnection?\n\nThis may take 5-10 seconds for port detection.')) {
                      return;
                    }
                    try {
                      setOperationMessage('Reconnecting to Arduino...');
                      setSaveSuccess('loading');
                      const response = await fetch('http://192.168.10.15:8000/arduino/reconnect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });
                      if (response.ok) {
                        showSuccess('Arduino reconnected successfully');
                        // Refresh status after reconnection
                        setTimeout(loadArduinoStatus, 1000);
                      } else {
                        showError('Failed to reconnect Arduino');
                      }
                    } catch (error) {
                      showError(`Error reconnecting Arduino: ${error.message}`);
                    }
                  }}
                  className={`font-semibold py-1 px-3 text-sm rounded transition-colors duration-200 ${
                    arduinoStatus.connected 
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  disabled={arduinoStatus.loading}
                >
                  {arduinoStatus.loading ? 'Loading...' : 'Reconnect'}
                </button>
              </div>
              
              {arduinoStatus.connected && arduinoStatus.lastCommand && (
                <p className="text-xs text-gray-600">
                  Last command: {new Date(arduinoStatus.lastCommand + 'Z').toLocaleString("en-US", { 
                    timeZone: timezoneSettings.current,
                    year: 'numeric',
                    month: 'numeric', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                  })}
                </p>
              )}
            </div>

            {/* Zombie Retry Controls */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600 flex items-center">
                <span className="mr-2">🧟</span>
                Zombie Monitoring
              </h4>
              
              <div className="flex space-x-2">
                <button
                  onClick={async () => {
                    try {
                      setOperationMessage('Getting shade monitor stats...');
                      setSaveSuccess('loading');
                      const response = await fetch('http://192.168.10.15:8000/retries');
                      const result = await response.json();
                                            
                      const monitorInfo = `🧟 ZOMBIE MONITORING
Zombies Seen Today: ${result.zombie_metrics?.zombies_today || 0}
Active Zombies: ${result.active_zombie_warnings || 0}

🔄 ACTIVE OPERATIONS
Total Active Tasks: ${result.total_active_tasks || 0}
Active Shade Tasks: ${result.active_shade_tasks || 0}

📊 SYSTEM STATS
Recent Cancellations: ${result.recent_cancellations || 0}
Total Cancelled Tasks: ${result.total_cancelled_tasks || 0}`;
                      
                      alert(monitorInfo);
                      showSuccess('Retrieved shade monitor statistics');
                    } catch (error) {
                      showError(`Error getting shade monitor: ${error.message}`);
                    }
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded transition-colors duration-200 flex-1"
                >
                  View Shade Monitor
                </button>

                <button
                  onClick={async () => {
                    if (window.confirm('Kill all zombie retry tasks?\n\nThis will cancel all active retry tasks and clear stuck operations.')) {
                      try {
                        setOperationMessage('Killing zombie retries...');
                        setSaveSuccess('loading');
                        const response = await fetch('http://192.168.10.15:8000/retries/all', {
                          method: 'DELETE'
                        });
                        if (response.ok) {
                          const result = await response.json();
                          showSuccess(`Killed ${result.cancelled_count || 0} zombie retry tasks`);
                        } else {
                          showError('Failed to kill zombie retries');
                        }
                      } catch (error) {
                        showError(`Error killing zombie retries: ${error.message}`);
                      }
                    }
                  }}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded transition-colors duration-200 flex items-center"
                >
                  <span className="mr-1">🔫</span>
                  Kill Zombies
                </button>
              </div>
            </div>
          </div>

          {/* Scheduler Testing */}
          <div>
            <h3 className="text-md font-semibold text-gray-700 mb-3">Scheduler 🗓️</h3>
            
            <p className="text-gray-600 text-xs mb-3">
              Scene testing buttons that play music (if enabled) and raise/lower shades defined for each scene.
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              {/* User-time based scenes */}
              <div>
                <h5 className="text-xs font-medium text-gray-600 mb-2">User-time Scenes</h5>
                <div className="space-y-1">
                  {['rise_n_shine', 'good_morning', 'good_afternoon'].map((scene) => (
                    <button
                      key={scene}
                      onClick={() => testScene(scene)}
                      disabled={testingScene === scene}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-1.5 px-2 text-xs rounded transition-colors duration-200 disabled:opacity-50"
                    >
                      {testingScene === scene ? (
                        <span className="flex items-center justify-center">
                          <span className="animate-spin rounded-full h-2 w-2 border-b-2 border-white mr-1"></span>
                          Testing...
                        </span>
                      ) : (
                        scene.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sun-time based scenes */}
              <div>
                <h5 className="text-xs font-medium text-gray-600 mb-2">Sun-time Scenes</h5>
                <div className="space-y-1">
                  {['good_evening', 'good_night'].map((scene) => (
                    <button
                      key={scene}
                      onClick={() => testScene(scene)}
                      disabled={testingScene === scene}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-1.5 px-2 text-xs rounded transition-colors duration-200 disabled:opacity-50"
                    >
                      {testingScene === scene ? (
                        <span className="flex items-center justify-center">
                          <span className="animate-spin rounded-full h-2 w-2 border-b-2 border-white mr-1"></span>
                          Testing...
                        </span>
                      ) : (
                        scene.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {testResult && (
              <div className={`mt-3 p-2 rounded text-xs ${
                testResult.success 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                {testResult.success ? '✅' : '❌'} {testResult.message}
              </div>
            )}
            
            <p className="text-blue-600 text-xs mt-3 italic">
              * When music is enabled, shades wait for Bluetooth & Pianobar to connect first
            </p>
          </div>
        </div>
      </div>

      {/* Away Status Management Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">✈️</span>
          Away Status Management
        </h2>
        
        <p className="text-gray-600 mb-6">
          Manage periods when you'll be away from home. This helps optimize scheduling and automation.
        </p>
        
        <AwayManager>
          {(awayContext) => (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Date Picker Column */}
              <div>
                <AwayDatePicker 
                  awayContext={awayContext}
                  onSuccess={(message) => showSuccess(message)}
                  onError={(message) => showError(message)}
                />
              </div>
              
              {/* Calendar Display Column */}
              <div>
                <AwayCalendarDisplay awayContext={awayContext} />
              </div>
              
              {/* Periods List Column */}
              <div>
                <AwayPeriodsList awayContext={awayContext} />
              </div>
            </div>
          )}
        </AwayManager>
      </div>

      {/* System Timezone Information */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🌍</span>
          System Timezone
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Current System Timezone
            </label>
            <div className="bg-gray-100 rounded py-3 px-4 text-gray-800 mb-3 border-l-4 border-blue-500">
              <span className="font-medium">{timezoneSettings.display}</span>
            </div>
            {timezoneSettings.systemTime && (
              <div className="bg-blue-50 rounded py-2 px-3 border border-blue-200">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">System Time:</span> {timezoneSettings.systemTime}
                </p>
              </div>
            )}
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">ℹ️ About System Timezone:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• All scheduled times use this timezone</li>
              <li>• Changes require system administrator access</li>
              <li>• To change: SSH to server and use <code className="bg-gray-100 px-1 rounded">timedatectl</code></li>
            </ul>
            
          </div>
        </div>
      </div>


      {/* Status notifications */}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Saving...
          </div>
        </div>
      )}

      {saveSuccess === 'success' && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg">
          <div className="flex items-center">
            <span className="mr-2">✅</span>
            {operationMessage || 'Settings updated successfully'}
          </div>
        </div>
      )}

      {saveSuccess === 'error' && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg">
          <div className="flex items-center">
            <span className="mr-2">❌</span>
            {operationMessage || 'Failed to update settings'}
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;