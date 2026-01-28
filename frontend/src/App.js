import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ShadesPage from './pages/ShadesPage';
import WeatherPage from './pages/WeatherPage';
import PianobarPage from './pages/PianobarPage';
import SettingsPage from './pages/SettingsPage';
import GuestRegisterPage from './pages/GuestRegisterPage';
import NotFoundPage from './pages/NotFoundPage';
import { AppProvider, useAppContext } from './utils/AppContext';

// Inner component that can access theme context for dark mode
function AppContent() {
  const { theme } = useAppContext();

  // Apply dark class to document root for Tailwind dark mode to work
  useEffect(() => {
    if (theme.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme.darkMode]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 dark:text-white transition-colors">
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shades" element={<ShadesPage />} />
          <Route path="/pianobar" element={<PianobarPage />} />
          <Route path="/weather" element={<WeatherPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/guest/:roomId" element={<GuestRegisterPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  // Clear stale cache on app initialization (preserve theme settings)
  useEffect(() => {
    if (localStorage.getItem('pianobar_cache_version') !== '2.0') {
      // Preserve theme settings before clearing
      const themeMode = localStorage.getItem('montyThemeMode');
      const manualTheme = localStorage.getItem('montyManualTheme');
      const darkMode = localStorage.getItem('montyDarkMode');

      localStorage.clear();

      // Restore preserved settings
      if (themeMode) localStorage.setItem('montyThemeMode', themeMode);
      if (manualTheme) localStorage.setItem('montyManualTheme', manualTheme);
      if (darkMode) localStorage.setItem('montyDarkMode', darkMode);

      localStorage.setItem('pianobar_cache_version', '2.0');
      console.log('🚫👻 Cleared stale pianobar cache - cache version upgraded to 2.0 (preserved theme settings)');
    }
  }, []);

  return (
    <AppProvider>
      <Router>
        <AppContent />
      </Router>
    </AppProvider>
  );
}

export default App;
