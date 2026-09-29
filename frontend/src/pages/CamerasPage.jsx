import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LiveTile from '../components/cameras/LiveTile';
import EventFeed from '../components/cameras/EventFeed';
import { camerasApi } from '../utils/api';
import './CamerasPage.css';

/**
 * Cameras — live view + Frigate event feed.
 *
 * The camera stack itself (go2rtc hub, Frigate, bridges) is private and configured
 * in the backend's `cameras` config; this page only knows camera ids, names and
 * modes ('live' plays on open, 'wake' = battery camera that connects on tap).
 * Tabs: Live ⇄ Events (#events deep-links to the feed). Leaving Live stops every
 * stream, so nothing streams unseen and woken battery cameras go back to sleep.
 */
function CamerasPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.hash === '#events' ? 'events' : 'live';
  const setTab = (name) => navigate({ hash: name === 'events' ? '#events' : '' }, { replace: true });

  const [cameras, setCameras] = useState([]);
  const [frigateUiUrl, setFrigateUiUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    camerasApi.list()
      .then((r) => {
        setCameras(r?.data?.cameras || []);
        setFrigateUiUrl(r?.data?.frigateUiUrl || null);
      })
      .catch(e => setError(e.message));
  }, []);

  return (
    <div className="container mx-auto p-4 cam-page">
      <nav className="cam-tabs" aria-label="Camera views">
        <button type="button" className={`cam-tab ${tab === 'live' ? 'on' : ''}`} onClick={() => setTab('live')}>
          <span className="cam-rec" aria-hidden="true" />Live
        </button>
        <button type="button" className={`cam-tab ${tab === 'events' ? 'on' : ''}`} onClick={() => setTab('events')}>
          <span aria-hidden="true">🎞️</span>Events
        </button>
      </nav>

      <div className="cam-panel dark:text-gray-100">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">Cameras unavailable ({error}).</p>
        )}

        <div className="cam-grid" hidden={tab !== 'live'}>
          {cameras.map(cam => (
            <LiveTile key={cam.id} cam={cam} active={tab === 'live'} />
          ))}
        </div>

        <div hidden={tab !== 'events'}>
          <EventFeed active={tab === 'events'} cameras={cameras} frigateUiUrl={frigateUiUrl} />
        </div>
      </div>
    </div>
  );
}

export default CamerasPage;
