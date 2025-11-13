import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../utils/AppContext';

function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { theme } = useAppContext();
  
  // Helper to determine if a link is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Dynamic page info based on current route
  const getPageInfo = () => {
    switch (location.pathname) {
      case '/':
        return {
          icon: '/images/Monty.png',
          title: 'Welcome to Monty',
          alt: 'Monty'
        };
      case '/shades':
        return {
          icon: '/images/Monty_Sunglasses.png',
          title: 'Shade Control',
          alt: 'Monty with sunglasses'
        };
      case '/pianobar':
        return {
          icon: '/images/Monty_Headphones.png',
          title: "Monty's Pianobar",
          alt: 'Monty with headphones'
        };
      case '/weather':
        return {
          icon: '/images/Monty_Weather.png',
          title: 'Weather & Temperature',
          alt: 'Monty with weather elements'
        };
      case '/settings':
        return {
          icon: '/images/Monty_Settings.png',
          title: 'Settings',
          alt: 'Monty with settings gear'
        };
      default:
        return {
          icon: '/images/Monty.png',
          title: 'Monty',
          alt: 'Monty'
        };
    }
  };

  const pageInfo = getPageInfo();

  // Define theme types
  const imageThemes = ['autumn', 'halloween', 'xmas', 'winter', 'summer'];
  const cssThemes = ['birthday', 'northern-lights', 'fireworks', 'fireworks-patriotic', 'starfield',
                     'matrix', 'neon'];

  // Themes that should hide the page title on mobile
  const hideTitleOnMobileThemes = ['birthday', 'xmas', 'halloween'];

  // Get theme background styling and className
  const getNavbarTheme = () => {
    const currentTheme = theme.currentTheme;

    // Check if it's a CSS animation theme
    if (cssThemes.includes(currentTheme)) {
      return {
        className: `theme-${currentTheme}`,
        style: null,
      };
    }

    // Check if it's an image theme
    if (imageThemes.includes(currentTheme)) {
      const themeImages = {
        autumn: '/images/themes/autumn.png',
        halloween: '/images/themes/halloween.png',
        xmas: '/images/themes/xmas.png',
        winter: '/images/themes/winter.png',
        summer: '/images/themes/summer.png',
      };

      return {
        className: '',
        style: {
          backgroundImage: `url(${themeImages[currentTheme]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        },
      };
    }

    // Default blue background
    return {
      className: 'bg-blue-600',
      style: null,
    };
  };

  const navbarTheme = getNavbarTheme();

  // Check if we should hide title on mobile for this theme
  const shouldHideTitleOnMobile = hideTitleOnMobileThemes.includes(theme.currentTheme);

  return (
    <nav
      className={`text-white p-4 shadow-md ${navbarTheme.className}`}
      style={navbarTheme.style || {}}
    >
      <div className="container mx-auto flex justify-between items-center relative z-10">
        <Link to="/" className="flex items-center space-x-3">
          <img
            src={pageInfo.icon}
            alt={pageInfo.alt}
            className="w-16 h-16 transform scale-x-[-1]"
          />
          <span className={`text-3xl font-semibold ${shouldHideTitleOnMobile ? 'hidden md:block' : ''}`}>
            {pageInfo.title}
          </span>
        </Link>
        
        {/* Hamburger menu button */}
        <button 
          className="md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
        
        {/* Desktop menu */}
        <div className="hidden md:flex space-x-6">
          <Link
            to="/"
            className={`px-3 py-2 rounded transition ${
              isActive('/')
                ? 'bg-black bg-opacity-30 text-white'
                : 'hover:bg-black hover:bg-opacity-20 hover:text-white'
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/shades"
            className={`px-3 py-2 rounded transition ${
              isActive('/shades')
                ? 'bg-black bg-opacity-30 text-white'
                : 'hover:bg-black hover:bg-opacity-20 hover:text-white'
            }`}
          >
            Shades
          </Link>
          <Link
            to="/pianobar"
            className={`px-3 py-2 rounded transition ${
              isActive('/pianobar')
                ? 'bg-black bg-opacity-30 text-white'
                : 'hover:bg-black hover:bg-opacity-20 hover:text-white'
            }`}
          >
            Pianobar
          </Link>
          <Link
            to="/weather"
            className={`px-3 py-2 rounded transition ${
              isActive('/weather')
                ? 'bg-black bg-opacity-30 text-white'
                : 'hover:bg-black hover:bg-opacity-20 hover:text-white'
            }`}
          >
            Weather
          </Link>
          <Link
            to="/settings"
            className={`px-3 py-2 rounded transition ${
              isActive('/settings')
                ? 'bg-black bg-opacity-30 text-white'
                : 'hover:bg-black hover:bg-opacity-20 hover:text-white'
            }`}
          >
            Settings
          </Link>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-black bg-opacity-40 p-4 mt-2 rounded shadow-lg relative z-20">
          <div className="flex flex-col space-y-2">
            <Link
              to="/"
              className={`px-4 py-2 rounded ${isActive('/') ? 'bg-black bg-opacity-50' : 'hover:bg-black hover:bg-opacity-30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              to="/shades"
              className={`px-4 py-2 rounded ${isActive('/shades') ? 'bg-black bg-opacity-50' : 'hover:bg-black hover:bg-opacity-30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Shades
            </Link>
            <Link
              to="/pianobar"
              className={`px-4 py-2 rounded ${isActive('/pianobar') ? 'bg-black bg-opacity-50' : 'hover:bg-black hover:bg-opacity-30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Pianobar
            </Link>
            <Link
              to="/weather"
              className={`px-4 py-2 rounded ${isActive('/weather') ? 'bg-black bg-opacity-50' : 'hover:bg-black hover:bg-opacity-30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Weather
            </Link>
            <Link
              to="/settings"
              className={`px-4 py-2 rounded ${isActive('/settings') ? 'bg-black bg-opacity-50' : 'hover:bg-black hover:bg-opacity-30'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Settings
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
