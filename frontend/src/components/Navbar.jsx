import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../utils/AppContext';
import { getPageInfo, visiblePages } from '../utils/pages';

function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [owlPickerPos, setOwlPickerPos] = useState(null); // null = closed, else {top, left}
  const owlRef = useRef(null);
  const location = useLocation();
  const { theme, guest, actions } = useAppContext();
  const pages = visiblePages(guest.isGuest);

  // Helper to determine if a link is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Close menus whenever the route changes
  useEffect(() => {
    setIsMenuOpen(false);
    setOwlPickerPos(null);
  }, [location.pathname]);

  // Escape closes the owl picker
  useEffect(() => {
    if (!owlPickerPos) return;
    const onKey = (e) => e.key === 'Escape' && setOwlPickerPos(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [owlPickerPos]);

  // Secret owl nav: position the picker just below the owl (page coords, so it scrolls with the page)
  const toggleOwlPicker = () => {
    if (owlPickerPos) return setOwlPickerPos(null);
    const rect = owlRef.current.getBoundingClientRect();
    setOwlPickerPos({ top: rect.bottom + window.scrollY + 8, left: Math.max(8, rect.left + window.scrollX - 8) });
    setIsMenuOpen(false);
  };

  const pageInfo = getPageInfo(location.pathname);

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

  // Shared text shadow style for readability on light backgrounds
  const textShadowStyle = { textShadow: '1px 1px 3px rgba(0, 0, 0, 0.6)' };

  // Check if we should hide title on mobile for this theme
  const shouldHideTitleOnMobile = hideTitleOnMobileThemes.includes(theme.currentTheme);

  return (
    <nav
      className={`text-white p-4 shadow-md ${navbarTheme.className}`}
      style={navbarTheme.style || {}}
    >
      <div className="container mx-auto flex justify-between items-center relative z-10">
        <div className="flex items-center space-x-3">
          {/* Owl = secret page picker */}
          <button
            ref={owlRef}
            onClick={toggleOwlPicker}
            aria-label="Open page picker"
            aria-expanded={!!owlPickerPos}
            className="shrink-0"
          >
            <img
              src={pageInfo.icon}
              alt={pageInfo.alt}
              className="w-16 h-16 transform scale-x-[-1]"
            />
          </button>
          <Link
            to="/"
            className={`text-3xl font-semibold ${shouldHideTitleOnMobile ? 'hidden md:block' : ''}`}
            style={textShadowStyle}
          >
            {pageInfo.title}
          </Link>
        </div>

        {/* Mobile controls: Dark mode toggle + Hamburger */}
        <div className="flex items-center space-x-2 md:hidden">
          {/* Dark Mode Toggle - Mobile */}
          <button
            onClick={() => actions.toggleDarkMode(!theme.darkMode)}
            className="p-2 rounded hover:bg-black hover:bg-opacity-20 transition"
            aria-label={theme.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme.darkMode ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
              </svg>
            )}
          </button>

          {/* Hamburger menu button */}
          <button
            onClick={() => { setIsMenuOpen(!isMenuOpen); setOwlPickerPos(null); }}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
        </div>
        
        {/* Desktop menu */}
        <div className="hidden md:flex space-x-6">
          {pages.map(page => (
            <Link
              key={page.path}
              to={page.path}
              className={`px-3 py-2 rounded transition ${
                isActive(page.path)
                  ? 'bg-black bg-opacity-30 text-white'
                  : 'hover:bg-black hover:bg-opacity-20 hover:text-white'
              }`}
              style={textShadowStyle}
            >
              {page.label}
            </Link>
          ))}
          {/* Dark Mode Toggle - Desktop */}
          <button
            onClick={() => actions.toggleDarkMode(!theme.darkMode)}
            className="p-2 rounded hover:bg-black hover:bg-opacity-20 transition"
            aria-label={theme.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme.darkMode ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
              </svg>
            )}
          </button>
          {/* Show guest indicator */}
          {guest.isGuest && (
            <span className="px-3 py-2 bg-black bg-opacity-20 rounded text-sm" style={textShadowStyle}>
              {guest.roomEmoji} Guest
            </span>
          )}
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-black bg-opacity-40 p-4 mt-2 rounded shadow-lg relative z-20">
          <div className="flex flex-col space-y-2">
            {pages.map(page => (
              <Link
                key={page.path}
                to={page.path}
                className={`px-4 py-2 rounded ${isActive(page.path) ? 'bg-black bg-opacity-50' : 'hover:bg-black hover:bg-opacity-30'}`}
                onClick={() => setIsMenuOpen(false)}
                style={textShadowStyle}
              >
                {page.label}
              </Link>
            ))}
            {/* Show guest indicator on mobile */}
            {guest.isGuest && (
              <span className="px-4 py-2 bg-black bg-opacity-20 rounded text-sm text-center" style={textShadowStyle}>
                {guest.roomEmoji} {guest.roomLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Secret owl picker - portaled to body so themed navbars (overflow: hidden) don't clip it */}
      {owlPickerPos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOwlPickerPos(null)} />
          <div
            className="absolute z-50 flex justify-evenly py-3 px-2 rounded-2xl shadow-xl backdrop-blur-[2px] ring-2 bg-slate-100/80 ring-slate-400 text-gray-700 dark:bg-slate-500/80 dark:ring-slate-300 dark:text-slate-50"
            style={{ ...owlPickerPos, width: 'min(calc(100vw - 16px), 440px)' }}
          >
            {pages.map(page => (
              <Link
                key={page.path}
                to={page.path}
                onClick={() => setOwlPickerPos(null)}
                className={`flex flex-col items-center w-16 p-1 rounded-xl transition ${
                  isActive(page.path)
                    ? 'bg-blue-100 ring-2 ring-blue-500 dark:bg-slate-400 dark:ring-blue-300'
                    : 'hover:bg-slate-200 dark:hover:bg-slate-400/60'
                }`}
              >
                <img src={page.icon} alt={page.alt} className="w-14 h-14 transform scale-x-[-1]" />
                <span className="text-[11px] font-medium leading-tight mt-1">{page.shortLabel}</span>
              </Link>
            ))}
          </div>
        </>,
        document.body
      )}
    </nav>
  );
}

export default Navbar;
