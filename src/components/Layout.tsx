import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  ArrowLeftRight,
  Users,
  GraduationCap,
  History,
  FileBarChart,
  Settings,
  Info,
  LogOut,
  Menu,
  X,
  Cloud,
  CloudUpload,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { cn } from '@/lib/utils';
import { subscribeToCloudSync, waitForCloudSync } from '@/lib/cloudSync';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/books', label: 'Books', icon: BookOpen },
  { to: '/issue-return', label: 'Issue / Return', icon: ArrowLeftRight },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/classes', label: 'Classes', icon: GraduationCap },
  { to: '/history', label: 'Issue History', icon: History },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/about', label: 'About', icon: Info },
];

export function Layout() {
  const { signOut, user } = useAuth();
  const { settings, activeYear } = useSettings();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCloudWrites, setPendingCloudWrites] = useState(0);

  useEffect(() => subscribeToCloudSync(setPendingCloudWrites), []);

  useEffect(() => {
    if (pendingCloudWrites === 0) return;
    const preventUnsyncedExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnsyncedExit);
    return () => window.removeEventListener('beforeunload', preventUnsyncedExit);
  }, [pendingCloudWrites]);

  const handleSignOut = async () => {
    await waitForCloudSync();
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col z-40 transition-transform',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <img src="/app-icon-192.png" alt="School Library app icon" className="h-10 w-10 rounded-xl" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 truncate">
                {settings?.school_name || 'School Library'}
              </h1>
              <p className="text-xs text-slate-500">Library Management</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-4 py-3 space-y-2">
          <div className={`flex items-center gap-2 text-xs ${pendingCloudWrites > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
            {pendingCloudWrites > 0 ? <CloudUpload size={14} className="animate-pulse" /> : <Cloud size={14} />}
            {pendingCloudWrites > 0
              ? `Saving ${pendingCloudWrites} change${pendingCloudWrites === 1 ? '' : 's'} to cloud...`
              : 'All changes saved to cloud'}
          </div>
          {activeYear && (
            <div className="text-xs text-slate-500">
              Academic Year: <span className="font-semibold text-slate-700">{activeYear.year_label}</span>
            </div>
          )}
          {user && (
            <div className="text-xs text-slate-400 truncate">Signed in as {user.email}</div>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Developed by{' '}
              <a
                href="https://itsjeevanvarghese.web.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                Jeevan Varghese
              </a>
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600 p-1">
            <Menu size={22} />
          </button>
          <span className="text-sm font-semibold text-slate-700">
            {settings?.school_name || 'School Library'}
          </span>
          <div className="w-8" />
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Close button for mobile sidebar */}
      {sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(false)}
          className="fixed top-4 right-4 z-50 lg:hidden p-2 bg-white rounded-lg shadow-lg"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
}
