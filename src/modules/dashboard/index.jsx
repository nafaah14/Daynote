import { LayoutDashboard } from 'lucide-react';
import { DashboardScreen } from './DashboardScreen';

export default {
  id: 'dashboard',
  title: 'Dashboard',
  icon: LayoutDashboard,
  accent: 'var(--accent-dashboard)',
  tier: 'integrated',
  routes: [{ path: '/dashboard', element: <DashboardScreen /> }],
  search: () => [],
};
