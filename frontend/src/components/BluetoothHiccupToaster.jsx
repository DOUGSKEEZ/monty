import { useEffect } from 'react';
import { bluetoothApi } from '../utils/api';
import { useAppContext } from '../utils/AppContext';

// Backend BluetoothLinkMonitor drops aptX HD to SBC when the link can't keep up.
// Steps are ordered on purpose: power-cycling the speakers while still connected
// can leave them connected backwards (no sound) - disconnect first.
const TOAST = 'Monty switched the speakers to standard quality to keep the music smooth. ' +
  'For hi-fi again: disconnect Bluetooth in Monty, power-cycle the speakers, let them boot, then reconnect.';
const SEEN_KEY = 'monty_bt_hiccups_seen';

/** App-wide: toasts today's not-yet-seen Bluetooth codec fallbacks (polls every minute). */
export default function BluetoothHiccupToaster() {
  const { actions } = useAppContext();

  useEffect(() => {
    const check = async () => {
      try {
        const res = await bluetoothApi.getLinkHealth();
        let seen = 0;
        try { seen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { /* storage unavailable */ }
        const todayStr = new Date().toDateString();
        const fresh = (res.events || []).filter(e =>
          new Date(e.timestamp).toDateString() === todayStr && new Date(e.timestamp).getTime() > seen
        );
        if (fresh.length === 0) return;
        actions.showToast('monty-bt', TOAST, 20000); // one toast even if several fallbacks
        try { localStorage.setItem(SEEN_KEY, String(new Date(fresh[fresh.length - 1].timestamp).getTime())); } catch { /* ignore */ }
      } catch { /* backend unreachable — try again next poll */ }
    };
    check();
    const id = setInterval(check, 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
