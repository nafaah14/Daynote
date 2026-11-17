import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Ruler, ChevronRight } from 'lucide-react';
import { Card, SectionLabel, EmptyState, Row } from '../../core/ui/components';
import { SupportNote, arSupport } from './support';
import './roomscan.css';

/**
 * RoomScan — walk a room with the camera, tap its corners and openings, and
 * get a dimensioned floor plan and a 3D model. The plan and its milestones
 * are in PLAN.md next to this file.
 *
 * Three.js and the AR session load only when you open a screen that needs
 * them (lazy), so the rest of Daybook doesn't carry them.
 */
export const PROJECT_TYPE = 'roomscan.project';

const Measure = lazy(() => import('./Measure'));
const loading = <div className="page"><p className="rs-sub">Loading…</p></div>;

function RoomScanHome() {
  const nav = useNavigate();
  const [support, setSupport] = useState(null);
  useEffect(() => { arSupport().then(setSupport); }, []);

  return (
    <div className="page rs-page">
      <h1 className="page-title serif">RoomScan</h1>
      <Card className="rs-card">
        <SupportNote support={support} />
      </Card>

      <SectionLabel>Try it</SectionLabel>
      <Card>
        <Row
          accent="var(--accent-roomscan)"
          lead={<Ruler size={18} style={{ color: 'var(--accent-roomscan)' }} />}
          title="Measure test"
          meta="Tap two points in AR and check them against a tape"
          right={<ChevronRight size={16} />}
          onClick={() => nav('/roomscan/measure')}
        />
      </Card>

      <SectionLabel>Rooms</SectionLabel>
      <Card>
        <EmptyState
          title="No rooms yet"
          body="Room capture comes next: corners, ceiling height and walls, then the plan and 3D view."
        />
      </Card>
    </div>
  );
}

export default {
  id: 'roomscan',
  title: 'RoomScan',
  icon: Box,
  accent: 'var(--accent-roomscan)',
  tier: 'integrated',
  routes: [
    { path: '/roomscan', element: <RoomScanHome /> },
    { path: '/roomscan/measure', element: <Suspense fallback={loading}><Measure /></Suspense> },
  ],
  quickActions: [{ id: 'roomscan-measure', label: 'AR measure', icon: Ruler, to: '/roomscan/measure' }],
};
