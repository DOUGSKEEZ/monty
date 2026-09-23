import React from 'react';
import { useAppContext } from '../utils/AppContext';
import { Link, useLocation } from 'react-router-dom';
import { visiblePages } from '../utils/pages';

function Footer() {
  const { weather, guest } = useAppContext();
  const location = useLocation();
  
  // Get the current temperature
  const getCurrentTemp = () => {
    if (weather.loading || !weather.current) {
      return null;
    }
    return Math.round(weather.current.temperature?.current);
  };
  
  const currentTemp = getCurrentTemp();
  const isWeatherPage = location.pathname === '/weather';

  const weatherCredits = '✨ Weather icons by Meteocons (MIT License)';

  return (
    <>
      {/* Mobile page nav - sits on the page background, above the footer band. Desktop has tabs in the navbar */}
      <nav className="md:hidden flex justify-evenly py-2 border-t border-gray-300 dark:border-gray-700">
        {visiblePages(guest.isGuest).map(page => {
          const active = location.pathname === page.path;
          return (
            <Link
              key={page.path}
              to={page.path}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center w-16 py-1 rounded-lg transition ${
                active
                  ? 'bg-blue-100 ring-1 ring-blue-400 text-blue-700 dark:bg-white/10 dark:ring-white/30 dark:text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <span className="text-lg leading-none">{page.emoji}</span>
              <span className="text-[10px] font-medium leading-tight mt-0.5">{page.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
      <footer className="bg-gray-800 dark:bg-gray-950 text-white px-6 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:p-4 shadow-inner dark:border-t dark:border-gray-700">
        <div className="container mx-auto flex justify-between items-center text-xs md:text-base">
          <div>
            {currentTemp !== null && (
              <span className="mr-4">🌡️ {currentTemp}°F</span>
            )}
            {isWeatherPage && (
              <span className="hidden md:inline text-xs text-gray-400">{weatherCredits}</span>
            )}
          </div>
          <div className="flex items-center space-x-2 md:space-x-3">
            <p>Monty Home Automation &copy; {new Date().getFullYear()}</p>
            <img
              src="/images/Monty.png"
              alt="Monty"
              className="w-6 h-6 md:w-10 md:h-10 opacity-75 hover:opacity-100 transition-opacity duration-300"
              title="Monty, your home automation butler"
            />
          </div>
        </div>
        {/* Weather credits get their own line on mobile - too long for the single footer row */}
        {isWeatherPage && (
          <p className="md:hidden mt-1 text-[10px] text-gray-400 text-center">{weatherCredits}</p>
        )}
      </footer>
    </>
  );
}

export default Footer;
