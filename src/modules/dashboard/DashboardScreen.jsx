import { PinnedBoard } from './PinnedBoard';
import { DayAgenda } from './DayAgenda';
import { QuickAddFab } from './QuickAddFab';
import './dashboard.css';

export function DashboardScreen() {
  return (
    <div className="page dash-page has-fab">
      <div className="page-head">
        <div>
          <h1 className="page-title serif">Dashboard</h1>
          <p className="page-sub">Pinned, always. The rest, by day.</p>
        </div>
      </div>

      <PinnedBoard />
      <DayAgenda />
      <QuickAddFab />
    </div>
  );
}
