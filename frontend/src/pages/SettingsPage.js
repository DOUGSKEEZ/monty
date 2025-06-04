import React, { useState, useEffect } from 'react';
import { useAppContext } from '../utils/AppContext';

function SettingsPage() {
  // Get state and actions from context
  const { scheduler, actions } = useAppContext();
  
  // Component state
  const [saving, setSaving] = useState(false);
  const [testingScene, setTestingScene] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [operationMessage, setOperationMessage] = useState('');

  // Form states (initialized from context)
  const [sceneSettings, setSceneSettings] = useState({
    good_afternoon_time: '14:30',
    good_evening_offset_minutes: 60
  });
  // Draft states for explicit save behavior
  const [sceneDrafts, setSceneDrafts] = useState({
    good_afternoon_time: '14:30',
    good_evening_offset_minutes: 60
  });
  const [sceneChanges, setSceneChanges] = useState({
    good_afternoon_time: false,
    good_evening_offset_minutes: false
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
    enabled_for_evening: true
  });
  const [timezoneSettings, setTimezoneSettings] = useState({
    current: 'America/Denver',
    display: 'America/Denver (Mountain Time)'
  });
  const [showTimezoneConfirm, setShowTimezoneConfirm] = useState(false);
  const [pendingTimezone, setPendingTimezone] = useState(null);

  // Update form states when scheduler config changes
  useEffect(() => {
    if (scheduler.config) {
      const config = scheduler.config;
      
      const sceneConfig = {
        good_afternoon_time: config.scenes?.good_afternoon_time || '14:30',
        good_evening_offset_minutes: config.scenes?.good_evening_offset_minutes || 60
      };
      setSceneSettings(sceneConfig);
      setSceneDrafts(sceneConfig);
      setSceneChanges({
        good_afternoon_time: false,
        good_evening_offset_minutes: false
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
        enabled_for_morning: config.music?.enabled_for_morning !== false,
        enabled_for_evening: config.music?.enabled_for_evening !== false
      });
      
      // Update timezone settings from location config
      if (config.location?.timezone) {
        setTimezoneSettings({
          current: config.location.timezone,
          display: getTimezoneDisplay(config.location.timezone)
        });
      }
    }
  }, [scheduler.config]);

  // Load configuration on mount
  useEffect(() => {
    console.log('🛠️ SettingsPage mounted - loading scheduler data...');
    actions.refreshScheduler();
  }, []); // Empty dependency array - only run on mount

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

  // Handle timezone selection
  const handleTimezoneSelect = (newTimezone) => {
    if (newTimezone === timezoneSettings.current) return;
    
    setPendingTimezone(newTimezone);
    setShowTimezoneConfirm(true);
  };

  // Update timezone settings
  const updateTimezone = async () => {
    try {
      setSaving(true);
      setShowTimezoneConfirm(false);
      
      const response = await fetch('/api/scheduler/timezone', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ timezone: pendingTimezone })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setTimezoneSettings({
          current: pendingTimezone,
          display: getTimezoneDisplay(pendingTimezone)
        });
        showSuccess('Timezone updated - all schedules refreshed');
        // Refresh scheduler data to show updated times
        actions.refreshScheduler();
      } else {
        showError(`Failed to update timezone: ${result.error}`);
      }
    } catch (err) {
      showError(`Error updating timezone: ${err.message}`);
    } finally {
      setSaving(false);
      setPendingTimezone(null);
    }
  };

  // Cancel timezone change
  const cancelTimezoneChange = () => {
    setShowTimezoneConfirm(false);
    setPendingTimezone(null);
  };

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

  // Helper functions
  const formatSceneName = (sceneName) => {
    return sceneName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Timezone helper function
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

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatWakeUpTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour12 = hours === '00' ? 12 : (hours > 12 ? hours - 12 : parseInt(hours));
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Calculate time until alarm
  const calculateTimeUntilAlarm = (alarmTime) => {
    if (!alarmTime) return '';
    
    try {
      // Get current time in user's timezone
      const timezoneInfo = scheduler.wakeUpStatus?.timezone || 'America/Denver (Mountain Time)';
      const timezone = timezoneInfo.split(' ')[0];
      
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
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Settings</h1>

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
            <div className="flex gap-2 items-center">
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Good Afternoon Time
            </label>
            <div className="flex gap-2">
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
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Good Evening (minutes before sunset)
            </label>
            <div className="flex gap-2 items-center">
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
          </div>
        </div>
      </div>

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

                  // Create ordered events array
                  const orderedEvents = [
                    { name: 'Good Morning', time: getGoodMorningTime() },
                    { name: 'Good Afternoon', time: scheduler.schedules.good_afternoon || 'Not scheduled' },
                    { name: 'Good Evening', time: scheduler.schedules.good_evening || 'Not scheduled' },
                    { name: 'Good Night', time: scheduler.schedules.good_night || 'Not scheduled' }
                  ];

                  return orderedEvents.map((event, index) => (
                    <li key={index}>
                      • {event.name}: {event.time}
                    </li>
                  ));
                })()
              ) : (
                <li>• Loading schedule...</li>
              )}
            </ul>
          </div>
          
          <div>
            <div className="flex items-center mb-8">
              <h3 className="font-semibold text-gray-700">Service Health:</h3>
              <span className={`text-xs font-medium ml-2 ${
                scheduler.config?.serviceHealth?.status === 'ok' ? 'text-green-600' : 'text-red-600'
              }`}>
                {scheduler.config?.serviceHealth?.status === 'ok' ? 'Active' : 'Inactive'}
              </span>
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
                      <p className="text-lg font-bold text-bold-700">
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

      {/* Music Integration Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🎵</span>
          Music Integration
        </h2>
        
        <div className="space-y-4">
          <label className="flex items-center">
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
            <span className="text-gray-700">Enable music for morning scenes</span>
          </label>
          
          <label className="flex items-center">
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
            <span className="text-gray-700">Enable music for evening scenes</span>
          </label>
        </div>
      </div>

      {/* Scene Testing Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🧪</span>
          Scene Testing
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {['good_afternoon', 'good_evening', 'good_night', 'rise_n_shine', 'good_morning'].map(scene => (
            <button
              key={scene}
              onClick={() => testScene(scene)}
              disabled={testingScene === scene}
              className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-3 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testingScene === scene ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1"></div>
                  Testing...
                </span>
              ) : (
                `Test ${formatSceneName(scene)}`
              )}
            </button>
          ))}
        </div>
        
        {testResult && (
          <div className={`p-3 rounded text-sm ${
            testResult.success 
              ? 'bg-green-100 border border-green-400 text-green-700' 
              : 'bg-red-100 border border-red-400 text-red-700'
          }`}>
            <p className="font-semibold">
              {testResult.success ? '✅' : '❌'} {testResult.message}
            </p>
          </div>
        )}
      </div>

      {/* System Controls Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">⚙️</span>
          System Controls
        </h2>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-800 mb-2 flex items-center">
            <span className="mr-2">🚨</span>
            Emergency Controls
          </h3>
          
          <p className="text-red-700 text-sm mb-4">
            Use this button if Pianobar becomes unresponsive or stuck. This will forcefully terminate all Pianobar processes.
          </p>
          
          <button
            onClick={async () => {
              if (window.confirm('⚠️ Are you sure you want to FORCE KILL all Pianobar processes?\n\nThis will immediately terminate Pianobar and stop all music playback.')) {
                try {
                  setOperationMessage('Force killing Pianobar processes...');
                  setSaveSuccess('loading');
                  
                  const result = await actions.controlPianobar('kill');
                  
                  if (result) {
                    showSuccess('🚨 Pianobar processes terminated successfully');
                  } else {
                    showError('Failed to kill Pianobar processes');
                  }
                } catch (error) {
                  showError(`Error killing Pianobar: ${error.message}`);
                }
              }
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg flex items-center transition-colors duration-200"
          >
            <span className="mr-2 text-xl">☠️</span>
            NUCLEAR OPTION: Kill Pianobar
          </button>
          
          <p className="text-xs text-red-600 mt-2">
            This button uses <code>kill -9</code> to forcefully terminate processes. Use only when normal stop doesn't work.
          </p>
        </div>
      </div>

      {/* Timezone Settings Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🌍</span>
          Timezone Settings
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Current Timezone
            </label>
            <div className="bg-gray-100 rounded py-2 px-3 text-gray-700 mb-3">
              {timezoneSettings.display}
            </div>
            
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Change Timezone
            </label>
            <select
              value={timezoneSettings.current}
              onChange={(e) => handleTimezoneSelect(e.target.value)}
              className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-full"
            >
              <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
              <option value="America/Denver">Mountain Time (Denver)</option>
              <option value="America/Chicago">Central Time (Chicago)</option>
              <option value="America/New_York">Eastern Time (New York)</option>
              <option value="America/Phoenix">Arizona Time (Phoenix)</option>
              <option value="Pacific/Honolulu">Hawaii Time (Honolulu)</option>
              <option value="America/Anchorage">Alaska Time (Anchorage)</option>
            </select>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">⚠️ Important:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Changing timezone affects all scheduled times</li>
              <li>• Wake-up alarms will be adjusted automatically</li>
              <li>• Scene times will be recalculated</li>
              <li>• All active schedules will be refreshed</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Timezone Confirmation Modal */}
      {showTimezoneConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              🌍 Confirm Timezone Change
            </h3>
            
            <div className="mb-4">
              <p className="text-gray-700 mb-2">
                Change from:
              </p>
              <div className="bg-gray-100 rounded p-2 mb-2">
                <strong>{getTimezoneDisplay(timezoneSettings.current)}</strong>
              </div>
              
              <p className="text-gray-700 mb-2">
                Change to:
              </p>
              <div className="bg-blue-100 rounded p-2 mb-4">
                <strong>{getTimezoneDisplay(pendingTimezone)}</strong>
              </div>
              
              <div className="bg-yellow-100 border border-yellow-400 rounded p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>This will:</strong><br/>
                  • Update all scheduled scenes<br/>
                  • Adjust wake-up alarm times<br/>
                  • Recalculate sunset-based scenes<br/>
                  • Refresh all cron schedules
                </p>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelTimezoneChange}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={updateTimezone}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}

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