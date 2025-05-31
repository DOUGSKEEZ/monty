import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ShadesPage from './pages/ShadesPage';
import WeatherPage from './pages/WeatherPage';
import PianobarPage from './pages/PianobarPage';
import SettingsPage from './pages/SettingsPage';
import { AppProvider } from './utils/AppContext';

function App() {
  // Clear stale cache on app initialization
  useEffect(() => {
    if (localStorage.getItem('pianobar_cache_version') !== '2.0') {
      localStorage.clear();
      localStorage.setItem('pianobar_cache_version', '2.0');
      console.log('🚫👻 Cleared stale pianobar cache - cache version upgraded to 2.0');
    }
  }, []);
  return (
    <AppProvider>
      <Router>
        <div className="flex flex-col min-h-screen bg-gray-100">
          <Navbar />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/shades" element={<ShadesPage />} />
              <Route path="/pianobar" element={<PianobarPage />} />
              <Route path="/weather" element={<WeatherPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
