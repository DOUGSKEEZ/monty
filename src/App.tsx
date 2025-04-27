import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ShadesControlPage from './pages/ShadesControlPage';
import WeatherPage from './pages/WeatherPage';
import SettingsPage from './pages/SettingsPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="shades" element={<ShadesControlPage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
};

export default App;
