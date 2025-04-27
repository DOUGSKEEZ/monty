export interface Shade {
  id: string;
  roomId: string;
  name: string;
  position: number; // 0-100 where 0 is fully closed, 100 is fully open
  status: 'closed' | 'open' | 'partial' | 'moving';
  lastUpdated: Date;
}
