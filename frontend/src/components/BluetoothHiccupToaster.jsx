import { useEffect } from 'react';
import { bluetoothApi } from '../utils/api';
import { useAppContext } from '../utils/AppContext';

// Backend link events: BluetoothLinkMonitor drops aptX HD to SBC when the link can't
// keep up; BluetoothLinkRecovery unsticks a reversed/silent link.
// Manual steps are ordered on purpose: power-cycling the speakers while still
// connected can leave them connected backwards (no sound) - disconnect first.
const MANUAL_STEPS = 'disconnect Bluetooth in Monty, power-cycle the speakers, let them boot, then reconnect.';
const TOASTS = {
  // A fresh connect asks for aptX HD again (bt-connect.sh prefer_hifi_codec) - no power-cycle needed
  'codec-fallback': 'Monty switched the speakers to standard quality to keep the music smooth. For hi-fi again: disconnect and reconnect Bluetooth in Monty.',
  recovered: 'Bluetooth got stuck, so Monty reset the connection to the speakers. Music should be back.',
  'recovery-failed': `Monty couldn't fix Bluetooth on its own. To get music back: ${MANUAL_STEPS}`
};
const SEEN_KEY = 'monty_bt_hiccups_seen';

/** App-wide: toasts the newest of today's not-yet-seen Bluetooth link events (polls every minute). */
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
        const newest = fresh[fresh.length - 1]; // one toast: the latest state is what matters
        actions.showToast('monty-bt', TOASTS[newest.type] || TOASTS['codec-fallback'], 20000);
        try { localStorage.setItem(SEEN_KEY, String(new Date(newest.timestamp).getTime())); } catch { /* ignore */ }
      } catch { /* backend unreachable — try again next poll */ }
    };
    check();
    const id = setInterval(check, 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
