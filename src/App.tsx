import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  subDays,
} from 'date-fns';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Bird,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  Egg,
  LogOut,
  MapPin,
  Pencil,
  PoundSterling,
  RefreshCw,
  Settings,
  Sparkles,
  Stethoscope,
  Trash2,
  TrendingUp,
  Utensils,
  X,
} from 'lucide-react';
import { authApi, dataApi, SessionUser } from './api';
import { CHICKEN_FACTS, CHICKEN_WIKI } from './constants';
import { ChickBatch, EggLog, EggLogMode, FeedLog, Hen, HenAppearance, Location, MedicationLog, SaleLog } from './types';

type TabKey = 'dashboard' | 'settings' | 'feed' | 'sales' | 'wiki';
type SettingsMode = 'birds' | 'coops';
type LogMode = EggLogMode;
type CalendarFilter = 'eggs' | 'sales' | 'feed' | 'meds';

type AppState = {
  locations: Location[];
  eggLogs: EggLog[];
  hens: Hen[];
  feedLogs: FeedLog[];
  medicationLogs: MedicationLog[];
  saleLogs: SaleLog[];
  chickBatches: ChickBatch[];
};

const initialState: AppState = {
  locations: [],
  eggLogs: [],
  hens: [],
  feedLogs: [],
  medicationLogs: [],
  saleLogs: [],
  chickBatches: [],
};

const appearanceOptions: HenAppearance[] = ['Healthy', 'Broody', 'Fluffy', 'Moulting', 'Speckled', 'Scruffy'];
const coopTypes: Location['type'][] = ['Garden', 'Allotment', 'Other'];
const calendarFilters: { key: CalendarFilter; label: string; icon: ReactNode }[] = [
  { key: 'eggs', label: 'Eggs', icon: <Egg size={14} /> },
  { key: 'sales', label: 'Sales', icon: <PoundSterling size={14} /> },
  { key: 'feed', label: 'Feed', icon: <Utensils size={14} /> },
  { key: 'meds', label: 'Meds', icon: <Stethoscope size={14} /> },
];

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [settingsMode, setSettingsMode] = useState<SettingsMode>('birds');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [state, setState] = useState<AppState>(initialState);
  const [loadingData, setLoadingData] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [defaultLogMode, setDefaultLogMode] = useState<LogMode>('produce');
  const [splash, setSplash] = useState<{ mode: LogMode; at: number } | null>(null);

  useEffect(() => {
    authApi
      .session()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!user) {
      setState(initialState);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      try {
        const [locations, eggLogs, hens, feedLogs, medicationLogs, saleLogs, chickBatches] = await Promise.all([
          dataApi.list('locations'),
          dataApi.list('eggLogs'),
          dataApi.list('hens'),
          dataApi.list('feedLogs'),
          dataApi.list('medicationLogs'),
          dataApi.list('saleLogs'),
          dataApi.list('chickBatches'),
        ]);

        if (!cancelled) {
          setState({ locations, eggLogs, hens, feedLogs, medicationLogs, saleLogs, chickBatches });
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : 'Failed to load data');
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  useEffect(() => {
    if (!splash) return;
    const timer = window.setTimeout(() => {
      setSplash(null);
      setLogSheetOpen(false);
      setActiveTab('dashboard');
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [splash]);

  const upsert = async <T extends { id: string }>(key: keyof AppState, collection: import('./api').CollectionName, item: T) => {
    const saved = await dataApi.upsert(collection as never, item as never);
    setState((current) => {
      const list = current[key] as { id: string }[];
      const next = list.some((entry) => entry.id === (saved as { id: string }).id)
        ? list.map((entry) => (entry.id === (saved as { id: string }).id ? (saved as never) : entry))
        : [saved as never, ...list];
      return { ...current, [key]: next } as AppState;
    });
    setSaveMessage('Saved. Tidy.');
    return saved;
  };

  const remove = async (key: keyof AppState, collection: import('./api').CollectionName, id: string) => {
    await dataApi.remove(collection, id);
    setState((current) => ({
      ...current,
      [key]: (current[key] as { id: string }[]).filter((entry) => entry.id !== id),
    }) as AppState);
    setSaveMessage('Gone. Clean work.');
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const payload = authMode === 'register'
        ? await authApi.register(email, password, nickname)
        : await authApi.login(email, password);
      setUser(payload.user);
      setPassword('');
      setNickname('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    setLogoutConfirmOpen(false);
    setActiveTab('dashboard');
  };

  if (!authReady) {
    return <FullscreenMessage icon={<RefreshCw className="animate-spin" />} title="Waking the hens" subtitle="Just a sec…" />;
  }

  if (!user) {
    return (
      <AuthShell>
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="text-center space-y-3 mb-6">
            <div className="w-24 h-24 bg-violet-600 rounded-[32px] flex items-center justify-center mx-auto shadow-xl shadow-violet-200 rotate-3">
              <Egg size={48} className="text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-serif italic font-bold text-violet-900">The Eggcountant</h1>
              <p className="text-violet-900/40 font-medium uppercase tracking-[0.2em] text-[10px] mt-2">Hostinger-friendly flock bookkeeping</p>
            </div>
          </div>

          {authMode === 'register' && (
            <Field label="Nickname">
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} required className={inputClass} placeholder="Captain Cluck" />
            </Field>
          )}
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className={inputClass} placeholder="cluck@palace.com" />
          </Field>
          <Field label="Password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} className={inputClass} placeholder="At least 8 characters" />
          </Field>

          {authError && <p className="text-rose-600 text-sm bg-rose-50 rounded-2xl p-3">{authError}</p>}

          <button className="w-full py-4 bg-violet-600 text-white rounded-3xl font-bold text-lg shadow-xl shadow-violet-200 disabled:opacity-60" disabled={authLoading}>
            {authLoading ? 'One sec…' : authMode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login');
              setAuthError('');
            }}
            className="w-full text-violet-600 font-bold text-sm"
          >
            {authMode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
          </button>
        </form>
      </AuthShell>
    );
  }

  const { locations, eggLogs, hens, feedLogs, medicationLogs, saleLogs, chickBatches } = state;

  return (
    <div className="min-h-screen bg-[#F8F7FF] text-violet-900 font-sans pb-28 relative overflow-x-hidden egg-art">
      <BackgroundArt />

      <header className="bg-white/90 backdrop-blur border-b border-violet-100 p-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-serif italic font-black tracking-tight">The Eggcountant</h1>
            <p className="text-sm text-violet-900/55 truncate max-w-[220px]">{user.nickname || 'Welcome back'}, mind the eggs 🥚</p>
          </div>
          <button onClick={() => setLogoutConfirmOpen(true)} className="p-3 rounded-2xl text-violet-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4 relative z-10">
        {saveMessage && <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-medium">{saveMessage}</div>}
        {authError && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-2xl text-sm font-medium">{authError}</div>}
        {loadingData ? (
          <Card><div className="py-10 text-center text-violet-500">Loading your flock books…</div></Card>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <Dashboard
                eggLogs={eggLogs}
                saleLogs={saleLogs}
                feedLogs={feedLogs}
                medicationLogs={medicationLogs}
                locations={locations}
                chickBatches={chickBatches}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsPage
                mode={settingsMode}
                setMode={setSettingsMode}
                hens={hens}
                locations={locations}
                chickBatches={chickBatches}
                onSaveHen={(item) => upsert('hens', 'hens', item)}
                onDeleteHen={(id) => remove('hens', 'hens', id)}
                onSaveLocation={(item) => upsert('locations', 'locations', item)}
                onDeleteLocation={(id) => remove('locations', 'locations', id)}
                onSaveBatch={(item) => upsert('chickBatches', 'chickBatches', item)}
                onDeleteBatch={(id) => remove('chickBatches', 'chickBatches', id)}
              />
            )}
            {activeTab === 'feed' && (
              <FeedAndMedTracker
                locations={locations}
                hens={hens}
                feedLogs={feedLogs}
                medicationLogs={medicationLogs}
                onSaveFeed={(item) => upsert('feedLogs', 'feedLogs', item)}
                onDeleteFeed={(id) => remove('feedLogs', 'feedLogs', id)}
                onSaveMedication={(item) => upsert('medicationLogs', 'medicationLogs', item)}
                onDeleteMedication={(id) => remove('medicationLogs', 'medicationLogs', id)}
              />
            )}
            {activeTab === 'sales' && <SalesTracker saleLogs={saleLogs} onSave={(item) => upsert('saleLogs', 'saleLogs', item)} onDelete={(id) => remove('saleLogs', 'saleLogs', id)} />}
            {activeTab === 'wiki' && <ChickenWiki />}
          </>
        )}
      </main>

      <button
        onClick={() => setLogSheetOpen(true)}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-16 h-16 rounded-full bg-violet-600 text-white shadow-[0_18px_40px_rgba(124,58,237,0.35)] flex items-center justify-center border-4 border-[#F8F7FF]"
      >
        <Egg size={28} />
      </button>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-violet-100 px-4 py-3 z-20 shadow-[0_-4px_20px_rgba(124,58,237,0.05)]">
        <div className="max-w-md mx-auto grid grid-cols-6 items-end gap-2">
          <NavButton icon={<TrendingUp size={20} />} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          <NavButton icon={<PoundSterling size={20} />} label="Sales" active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
          <div />
          <NavButton icon={<Utensils size={20} />} label="Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
          <NavButton icon={<BookOpen size={20} />} label="Wiki" active={activeTab === 'wiki'} onClick={() => setActiveTab('wiki')} />
        </div>
      </nav>

      {logSheetOpen && (
        <LogSheet
          locations={locations}
          defaultMode={defaultLogMode}
          onClose={() => setLogSheetOpen(false)}
          onSaveEgg={async (item, mode) => {
            await upsert('eggLogs', 'eggLogs', item);
            setDefaultLogMode('produce');
            setSplash({ mode, at: Date.now() });
          }}
          onSaveBatch={async (item) => {
            await upsert('chickBatches', 'chickBatches', item);
            setDefaultLogMode('breed');
            setSplash({ mode: 'breed', at: Date.now() });
          }}
        />
      )}

      {logoutConfirmOpen && (
        <ConfirmSheet
          title="Sign out?"
          body="Not one-tap anymore. Sensible, really."
          confirmText="Sign out"
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={handleLogout}
        />
      )}

      {splash && <LogSplash mode={splash.mode} />}
    </div>
  );
}

function Dashboard({
  eggLogs,
  saleLogs,
  feedLogs,
  medicationLogs,
  locations,
  chickBatches,
}: {
  eggLogs: EggLog[];
  saleLogs: SaleLog[];
  feedLogs: FeedLog[];
  medicationLogs: MedicationLog[];
  locations: Location[];
  chickBatches: ChickBatch[];
}) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('eggs');
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) }), [selectedDate]);
  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEggs = eggLogs.filter((log) => log.date.startsWith(today)).reduce((sum, log) => sum + log.count, 0);
  const totalEggs = eggLogs.reduce((sum, log) => sum + log.count, 0);
  const totalSold = saleLogs.reduce((sum, log) => sum + log.quantity, 0);
  const revenue = saleLogs.reduce((sum, log) => sum + log.price, 0);
  const costs = feedLogs.reduce((sum, log) => sum + (log.cost || 0), 0);

  const chartData = Array.from({ length: 14 }).map((_, index) => {
    const day = subDays(new Date(), 13 - index);
    const key = format(day, 'yyyy-MM-dd');
    const eggs = eggLogs.filter((log) => log.date.startsWith(key)).reduce((sum, log) => sum + log.count, 0);
    return { day: format(day, 'MMM d'), eggs };
  });

  const selectedEggLogs = eggLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedEggs = selectedEggLogs.reduce((sum, log) => sum + log.count, 0);
  const selectedSales = saleLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedFeed = feedLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedMeds = medicationLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedIncubationStarts = chickBatches.filter((batch) => batch.dateStarted.startsWith(selectedKey));

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Today's lay" value={todayEggs} icon={<Egg size={18} className="text-violet-500" />} />
        <StatCard label="Total eggs" value={totalEggs} icon={<Bird size={18} className="text-violet-500" />} />
        <StatCard label="Sold" value={totalSold} icon={<PoundSterling size={18} className="text-violet-500" />} />
        <StatCard label="Profit-ish" value={`£${(revenue - costs).toFixed(2)}`} icon={<TrendingUp size={18} className="text-violet-500" />} />
      </section>

      <Card>
        <div className="flex justify-between items-end mb-4">
          <div>
            <h3 className="text-lg font-serif italic">Production trend</h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/35 font-bold">Last 14 days</p>
          </div>
          <p className="text-2xl font-serif italic text-violet-600 font-bold">{chartData.reduce((sum, item) => sum + item.eggs, 0)}</p>
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="eggArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#ede9fe" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#7c3aed' }} />
              <YAxis hide />
              <Tooltip />
              <Area type="monotone" dataKey="eggs" stroke="#7c3aed" fill="url(#eggArea)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <CalendarCard
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        days={days}
        calendarFilter={calendarFilter}
        onChangeFilter={setCalendarFilter}
        eggLogs={eggLogs}
        saleLogs={saleLogs}
        feedLogs={feedLogs}
        medicationLogs={medicationLogs}
      />

      <Card>
        <div className="flex justify-between items-center gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/35 font-bold">Selected day</p>
            <h3 className="text-xl font-serif italic font-bold">{format(selectedDate, 'EEEE d MMMM')}</h3>
          </div>
          <CalendarDays className="text-violet-400" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <MiniStat label="Egg lay" value={selectedEggs} highlight={selectedEggs > 0} />
          <MiniStat label="Sales" value={`£${selectedSales.reduce((sum, log) => sum + log.price, 0).toFixed(2)}`} />
          <MiniStat label="Feed" value={`£${selectedFeed.reduce((sum, log) => sum + (log.cost || 0), 0).toFixed(2)}`} />
          <MiniStat label="Meds" value={selectedMeds.length} />
        </div>
        <div className="mt-4 space-y-3">
          {selectedEggLogs.length > 0 && (
            <TimelineRow icon={<Egg size={16} />} tone="bg-amber-50 text-amber-700" title={`Egg lay: ${selectedEggs} egg${selectedEggs === 1 ? '' : 's'}`} subtitle={selectedEggLogs.map((log) => `${log.mode === 'breed' ? 'Breed' : 'Produce'} · ${log.count}`).join(' • ')} />
          )}
          {selectedSales.map((log) => (
            <div key={log.id}><TimelineRow icon={<PoundSterling size={16} />} tone="bg-emerald-50 text-emerald-700" title={`Sale: ${log.quantity} eggs`} subtitle={`£${log.price.toFixed(2)}`} /></div>
          ))}
          {selectedFeed.map((log) => (
            <div key={log.id}><TimelineRow icon={<Utensils size={16} />} tone="bg-violet-50 text-violet-700" title={`Feed top-up: ${log.amount} ${log.amount === 1 ? 'bag' : 'bags'}`} subtitle={[log.feedType, log.weight ? `${log.weight}kg` : null, log.cost ? `£${log.cost.toFixed(2)}` : null].filter(Boolean).join(' • ')} /></div>
          ))}
          {selectedMeds.map((log) => (
            <div key={log.id}><TimelineRow icon={<Stethoscope size={16} />} tone="bg-rose-50 text-rose-700" title={log.medicationName} subtitle={log.dosage} /></div>
          ))}
          {selectedIncubationStarts.map((batch) => (
            <div key={batch.id}><TimelineRow icon={<Bird size={16} />} tone="bg-sky-50 text-sky-700" title={`Incubation started: ${batch.count} eggs`} subtitle={`Expected hatch ${format(parseISO(batch.expectedHatchDate), 'd MMM')}`} /></div>
          ))}
          {selectedEggLogs.length === 0 && selectedSales.length === 0 && selectedFeed.length === 0 && selectedMeds.length === 0 && selectedIncubationStarts.length === 0 && (
            <EmptyState icon={<CalendarDays size={20} />} text="Quiet day. Suspiciously efficient." />
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-serif italic mb-4">Production by coop</h3>
        <div className="space-y-4">
          {locations.length === 0 ? <EmptyState icon={<MapPin size={22} />} text="No coops yet. Add one in Settings." /> : locations.map((location) => {
            const eggs = eggLogs.filter((log) => log.locationId === location.id).reduce((sum, log) => sum + log.count, 0);
            const percentage = totalEggs ? (eggs / totalEggs) * 100 : 0;
            return (
              <div key={location.id} className="space-y-1">
                <div className="flex justify-between text-sm font-medium">
                  <span>{location.name}</span>
                  <span>{eggs} eggs</span>
                </div>
                <div className="h-2 bg-violet-50 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {chickBatches.length > 0 && (
        <Card>
          <h3 className="text-lg font-serif italic mb-4">Incubation watch</h3>
          <div className="space-y-3">
            {chickBatches.map((batch) => <div key={batch.id}><ChickBatchTile batch={batch} compact /></div>)}
          </div>
        </Card>
      )}
    </div>
  );
}

function CalendarCard({
  selectedDate,
  onSelectDate,
  days,
  calendarFilter,
  onChangeFilter,
  eggLogs,
  saleLogs,
  feedLogs,
  medicationLogs,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  days: Date[];
  calendarFilter: CalendarFilter;
  onChangeFilter: (value: CalendarFilter) => void;
  eggLogs: EggLog[];
  saleLogs: SaleLog[];
  feedLogs: FeedLog[];
  medicationLogs: MedicationLog[];
}) {
  const hasEvent = (key: string) => {
    if (calendarFilter === 'eggs') return eggLogs.some((log) => log.date.startsWith(key));
    if (calendarFilter === 'sales') return saleLogs.some((log) => log.date.startsWith(key));
    if (calendarFilter === 'feed') return feedLogs.some((log) => log.date.startsWith(key));
    return medicationLogs.some((log) => log.date.startsWith(key));
  };

  const eventValue = (key: string) => {
    if (calendarFilter === 'eggs') return eggLogs.filter((log) => log.date.startsWith(key)).reduce((sum, log) => sum + log.count, 0);
    if (calendarFilter === 'sales') return saleLogs.filter((log) => log.date.startsWith(key)).length;
    if (calendarFilter === 'feed') return feedLogs.filter((log) => log.date.startsWith(key)).length;
    return medicationLogs.filter((log) => log.date.startsWith(key)).length;
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-2xl font-serif italic font-bold">{format(selectedDate, 'MMMM yyyy')}</h2>
        <button onClick={() => onSelectDate(new Date())} className="px-3 py-2 rounded-xl bg-violet-50 text-violet-600 text-xs font-bold">Today</button>
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {calendarFilters.map((item) => (
          <button key={item.key} onClick={() => onChangeFilter(item.key)} className={`shrink-0 px-3 py-2 rounded-2xl text-xs font-bold border flex items-center gap-1.5 ${calendarFilter === item.key ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2 text-center mb-2">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => <div key={day} className="text-[10px] uppercase tracking-widest text-violet-900/35 font-bold">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: (new Date(days[0]).getDay() + 6) % 7 }).map((_, index) => <div key={`gap-${index}`} />)}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, selectedDate);
          const value = eventValue(key);
          const active = hasEvent(key);
          return (
            <button key={day.toISOString()} onClick={() => onSelectDate(day)} className={`aspect-square rounded-2xl border flex flex-col items-center justify-center relative ${isSelected ? 'bg-violet-600 text-white border-violet-600' : active ? 'bg-white border-violet-200' : 'bg-white border-violet-100'}`}>
              <span className={`text-xs font-serif italic ${calendarFilter === 'eggs' && active && !isSelected ? 'font-black text-violet-700' : ''}`}>{format(day, 'd')}</span>
              {active && <span className={`text-[10px] font-bold ${calendarFilter === 'eggs' ? 'text-amber-500' : isSelected ? 'text-white/90' : 'text-violet-500'}`}>{value}</span>}
              {calendarFilter === 'eggs' && active && !isSelected && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function SettingsPage({
  mode,
  setMode,
  hens,
  locations,
  chickBatches,
  onSaveHen,
  onDeleteHen,
  onSaveLocation,
  onDeleteLocation,
  onSaveBatch,
  onDeleteBatch,
}: {
  mode: SettingsMode;
  setMode: (mode: SettingsMode) => void;
  hens: Hen[];
  locations: Location[];
  chickBatches: ChickBatch[];
  onSaveHen: (item: Hen) => Promise<void>;
  onDeleteHen: (id: string) => Promise<void>;
  onSaveLocation: (item: Location) => Promise<void>;
  onDeleteLocation: (id: string) => Promise<void>;
  onSaveBatch: (item: ChickBatch) => Promise<void>;
  onDeleteBatch: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
        <button onClick={() => setMode('birds')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'birds' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Birds</button>
        <button onClick={() => setMode('coops')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'coops' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Coops</button>
      </div>
      {mode === 'birds' ? (
        <BirdSettings hens={hens} locations={locations} chickBatches={chickBatches} onSaveHen={onSaveHen} onDeleteHen={onDeleteHen} onSaveBatch={onSaveBatch} onDeleteBatch={onDeleteBatch} />
      ) : (
        <CoopSettings locations={locations} onSaveLocation={onSaveLocation} onDeleteLocation={onDeleteLocation} />
      )}
    </div>
  );
}

function BirdSettings({
  hens,
  locations,
  chickBatches,
  onSaveHen,
  onDeleteHen,
  onSaveBatch,
  onDeleteBatch,
}: {
  hens: Hen[];
  locations: Location[];
  chickBatches: ChickBatch[];
  onSaveHen: (item: Hen) => Promise<void>;
  onDeleteHen: (id: string) => Promise<void>;
  onSaveBatch: (item: ChickBatch) => Promise<void>;
  onDeleteBatch: (id: string) => Promise<void>;
}) {
  const [subMode, setSubMode] = useState<'flock' | 'chicks'>('flock');
  const [editingHenId, setEditingHenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [photoUrl, setPhotoUrl] = useState('');
  const [status, setStatus] = useState<HenAppearance>('Healthy');
  const [batchCount, setBatchCount] = useState(6);
  const [batchLocationId, setBatchLocationId] = useState(locations[0]?.id || '');
  const [batchDate, setBatchDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<ChickBatch['status']>('Incubating');
  const [hatchedCount, setHatchedCount] = useState(0);
  const [perishedCount, setPerishedCount] = useState(0);
  const [hatchDate, setHatchDate] = useState('');

  useEffect(() => {
    if (!locationId && locations[0]) setLocationId(locations[0].id);
    if (!batchLocationId && locations[0]) setBatchLocationId(locations[0].id);
  }, [locationId, batchLocationId, locations]);

  const resetHenForm = () => {
    setEditingHenId(null);
    setName('');
    setPhotoUrl('');
    setStatus('Healthy');
  };

  const resetBatchForm = () => {
    setEditingBatchId(null);
    setBatchCount(6);
    setBatchDate(format(new Date(), 'yyyy-MM-dd'));
    setBatchStatus('Incubating');
    setHatchedCount(0);
    setPerishedCount(0);
    setHatchDate('');
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
        <button onClick={() => setSubMode('flock')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${subMode === 'flock' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Flock</button>
        <button onClick={() => setSubMode('chicks')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${subMode === 'chicks' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Do Not Cook!</button>
      </div>

      {subMode === 'flock' ? (
        <>
          <Card>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-serif italic font-bold">Add a Bird</h2>
                  <p className="text-sm text-violet-900/50">Total birds: {hens.length}</p>
                </div>
                {editingHenId && <button onClick={resetHenForm} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}
              </div>
              <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Henrietta" /></Field>
              <Field label="Appearance"><Select value={status} onChange={(e) => setStatus(e.target.value as HenAppearance)}>{appearanceOptions.map((option) => <option key={option}>{option}</option>)}</Select></Field>
              <Field label="Coop"><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
              <Field label="Photo (optional)"><ImagePicker value={photoUrl} onChange={setPhotoUrl} /></Field>
              <button onClick={async () => {
                if (!name.trim() || !locationId) return;
                await onSaveHen({ id: editingHenId || crypto.randomUUID(), name: name.trim(), locationId, status, photoUrl: photoUrl || undefined });
                resetHenForm();
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingHenId ? 'Save bird' : "Let's Cluckin' Go!"}</button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {hens.length === 0 ? <div className="col-span-2"><Card><EmptyState icon={<Bird size={22} />} text="No birds yet. Bit suspicious, honestly." /></Card></div> : hens.map((hen) => (
              <Card key={hen.id} className="p-3">
                <div className="relative">
                  <div className="absolute top-0 right-0 flex gap-1">
                    <button onClick={() => {
                      setEditingHenId(hen.id);
                      setName(hen.name);
                      setLocationId(hen.locationId);
                      setPhotoUrl(hen.photoUrl || '');
                      setStatus(hen.status);
                    }} className="p-1.5 bg-white/80 text-violet-600 rounded-lg"><Pencil size={12} /></button>
                    <button onClick={() => onDeleteHen(hen.id)} className="p-1.5 bg-white/80 text-rose-500 rounded-lg"><Trash2 size={12} /></button>
                  </div>
                  <div className="aspect-square rounded-2xl overflow-hidden bg-violet-50 mb-3 flex items-center justify-center">
                    {hen.photoUrl ? <img src={hen.photoUrl} className="w-full h-full object-cover" /> : <Bird className="text-violet-300" />}
                  </div>
                  <p className="font-bold text-sm">{hen.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-violet-900/40 font-bold">{locations.find((location) => location.id === hen.locationId)?.name}</p>
                  <div className="mt-2 inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-violet-50 text-violet-700">{hen.status}</div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <Card>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-serif italic font-bold">Do Not Cook!</h2>
                  <p className="text-sm text-violet-900/50">Start or edit an incubation batch.</p>
                </div>
                {editingBatchId && <button onClick={resetBatchForm} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}
              </div>
              <Field label="Egg count"><Stepper value={batchCount} onChange={setBatchCount} min={1} max={48} /></Field>
              <Field label="Start date"><DateButton value={batchDate} onChange={setBatchDate} /></Field>
              <Field label="Coop"><Select value={batchLocationId} onChange={(e) => setBatchLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
              {editingBatchId && (
                <>
                  <Field label="Result"><div className="grid grid-cols-3 gap-2">{(['Incubating', 'Hatched', 'Failed'] as const).map((option) => <button key={option} type="button" onClick={() => setBatchStatus(option)} className={`rounded-2xl py-3 text-xs font-bold border ${batchStatus === option ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>{option}</button>)}</div></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Hatched"><Stepper value={hatchedCount} onChange={setHatchedCount} min={0} max={batchCount} /></Field>
                    <Field label="Perished"><Stepper value={perishedCount} onChange={setPerishedCount} min={0} max={batchCount} /></Field>
                  </div>
                  <Field label="Hatch date"><DateButton value={hatchDate || batchDate} onChange={setHatchDate} /></Field>
                </>
              )}
              <button onClick={async () => {
                if (!batchLocationId || batchCount < 1) return;
                const started = new Date(batchDate);
                await onSaveBatch({
                  id: editingBatchId || crypto.randomUUID(),
                  count: batchCount,
                  dateStarted: started.toISOString(),
                  expectedHatchDate: addDays(started, 21).toISOString(),
                  locationId: batchLocationId,
                  status: batchStatus,
                  chicks: [],
                  hatchedCount,
                  perishedCount,
                  hatchDate: hatchDate ? new Date(hatchDate).toISOString() : undefined,
                });
                resetBatchForm();
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingBatchId ? 'Save batch' : 'Incubate'}</button>
            </div>
          </Card>

          <div className="space-y-3">
            {chickBatches.length === 0 ? <Card><EmptyState icon={<Egg size={22} />} text="No chick batches yet." /></Card> : chickBatches.map((batch) => (
              <div key={batch.id} className="relative">
                <ChickBatchTile batch={batch} />
                <div className="absolute top-4 right-4 flex gap-2">
                  <button onClick={() => {
                    setEditingBatchId(batch.id);
                    setBatchCount(batch.count);
                    setBatchDate(format(parseISO(batch.dateStarted), 'yyyy-MM-dd'));
                    setBatchLocationId(batch.locationId);
                    setBatchStatus(batch.status);
                    setHatchedCount(batch.hatchedCount || 0);
                    setPerishedCount(batch.perishedCount || 0);
                    setHatchDate(batch.hatchDate ? format(parseISO(batch.hatchDate), 'yyyy-MM-dd') : '');
                  }} className="p-2 rounded-xl bg-white text-violet-600 shadow-sm"><Pencil size={14} /></button>
                  <button onClick={() => onDeleteBatch(batch.id)} className="p-2 rounded-xl bg-white text-rose-500 shadow-sm"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CoopSettings({ locations, onSaveLocation, onDeleteLocation }: { locations: Location[]; onSaveLocation: (item: Location) => Promise<void>; onDeleteLocation: (id: string) => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<Location['type']>('Garden');
  const [photoUrl, setPhotoUrl] = useState('');

  const reset = () => {
    setEditingId(null);
    setName('');
    setType('Garden');
    setPhotoUrl('');
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-serif italic font-bold">Coop settings</h2>
              <p className="text-sm text-violet-900/50">Add or tweak where the flock hangs out.</p>
            </div>
            {editingId && <button onClick={reset} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}
          </div>
          <Field label="Coop name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Cluckingham Palace" /></Field>
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">{coopTypes.map((option) => <button key={option} type="button" onClick={() => setType(option)} className={`py-3 rounded-xl border text-sm font-bold ${type === option ? 'border-violet-600 bg-violet-50 text-violet-600' : 'border-violet-100 bg-white text-violet-700'}`}>{option}</button>)}</div>
          </Field>
          <Field label="Photo (optional)"><ImagePicker value={photoUrl} onChange={setPhotoUrl} /></Field>
          <button onClick={async () => {
            if (!name.trim()) return;
            await onSaveLocation({ id: editingId || crypto.randomUUID(), name: name.trim(), type, photoUrl: photoUrl || undefined });
            reset();
          }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingId ? 'Save coop' : 'Add coop'}</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {locations.map((location) => (
          <Card key={location.id} className="p-4">
            <div className="relative text-center">
              <div className="absolute top-0 right-0 flex gap-1">
                <button onClick={() => {
                  setEditingId(location.id);
                  setName(location.name);
                  setType(location.type);
                  setPhotoUrl(location.photoUrl || '');
                }} className="p-1.5 rounded-lg bg-violet-50 text-violet-600"><Pencil size={12} /></button>
                <button onClick={() => onDeleteLocation(location.id)} className="p-1.5 rounded-lg bg-rose-50 text-rose-500"><Trash2 size={12} /></button>
              </div>
              <div className="w-16 h-16 rounded-2xl mx-auto mb-3 overflow-hidden bg-violet-50 flex items-center justify-center">{location.photoUrl ? <img src={location.photoUrl} className="w-full h-full object-cover" /> : <MapPin className="text-violet-400" />}</div>
              <p className="font-bold">{location.name}</p>
              <p className="text-[10px] uppercase tracking-widest text-violet-900/40 font-bold">{location.type}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FeedAndMedTracker({
  locations,
  hens,
  feedLogs,
  medicationLogs,
  onSaveFeed,
  onDeleteFeed,
  onSaveMedication,
  onDeleteMedication,
}: {
  locations: Location[];
  hens: Hen[];
  feedLogs: FeedLog[];
  medicationLogs: MedicationLog[];
  onSaveFeed: (item: FeedLog) => Promise<void>;
  onDeleteFeed: (id: string) => Promise<void>;
  onSaveMedication: (item: MedicationLog) => Promise<void>;
  onDeleteMedication: (id: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'feed' | 'med'>('feed');
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [amount, setAmount] = useState(1);
  const [cost, setCost] = useState('');
  const [weight, setWeight] = useState('');
  const [feedType, setFeedType] = useState('');
  const [feedDate, setFeedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [feedLocationId, setFeedLocationId] = useState(locations[0]?.id || '');
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [medHenId, setMedHenId] = useState('');
  const [medLocationId, setMedLocationId] = useState(locations[0]?.id || '');
  const [medDate, setMedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const resetFeed = () => {
    setEditingFeedId(null);
    setAmount(1);
    setCost('');
    setWeight('');
    setFeedType('');
    setFeedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const resetMed = () => {
    setEditingMedId(null);
    setMedicationName('');
    setDosage('');
    setMedHenId('');
    setMedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  useEffect(() => {
    if (!feedLocationId && locations[0]) setFeedLocationId(locations[0].id);
    if (!medLocationId && locations[0]) setMedLocationId(locations[0].id);
  }, [feedLocationId, medLocationId, locations]);

  return (
    <div className="space-y-4">
      <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
        <button onClick={() => setMode('feed')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'feed' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Feed</button>
        <button onClick={() => setMode('med')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'med' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Medication</button>
      </div>

      {mode === 'feed' ? (
        <>
          <Card>
            <div className="space-y-4">
              <div className="flex justify-between items-center"><h2 className="text-2xl font-serif italic font-bold">Feed log</h2>{editingFeedId && <button onClick={resetFeed} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}</div>
              <Field label="Bags"><Stepper value={amount} onChange={setAmount} min={1} max={20} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Weight (kg, optional)"><input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} placeholder="20" /></Field>
                <Field label="Cost (£, optional)"><input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} placeholder="14.99" /></Field>
              </div>
              <Field label="Type (optional)"><input value={feedType} onChange={(e) => setFeedType(e.target.value)} className={inputClass} placeholder="Layers pellets" /></Field>
              <Field label="Date"><DateButton value={feedDate} onChange={setFeedDate} /></Field>
              <Field label="Coop"><Select value={feedLocationId} onChange={(e) => setFeedLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
              <button onClick={async () => {
                if (!feedLocationId) return;
                await onSaveFeed({
                  id: editingFeedId || crypto.randomUUID(),
                  date: new Date(feedDate).toISOString(),
                  amount,
                  cost: cost ? Number(cost) : undefined,
                  weight: weight ? Number(weight) : undefined,
                  feedType: feedType || undefined,
                  locationId: feedLocationId,
                });
                resetFeed();
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingFeedId ? 'Save feed log' : 'Log feed purchase'}</button>
            </div>
          </Card>
          <div className="space-y-3">{feedLogs.map((log) => <Card key={log.id}><div className="flex justify-between gap-3"><div><p className="font-bold">{log.amount} {log.amount === 1 ? 'bag' : 'bags'}{log.feedType ? ` · ${log.feedType}` : ''}</p><p className="text-xs text-violet-900/45">{format(parseISO(log.date), 'd MMM yyyy')} • {locations.find((location) => location.id === log.locationId)?.name}</p><p className="text-xs text-violet-900/45">{[log.weight ? `${log.weight}kg` : null, log.cost ? `£${log.cost.toFixed(2)}` : null].filter(Boolean).join(' • ') || 'Optional extras not logged'}</p></div><div className="flex gap-1"><button onClick={() => { setEditingFeedId(log.id); setAmount(log.amount); setCost(log.cost ? String(log.cost) : ''); setWeight(log.weight ? String(log.weight) : ''); setFeedType(log.feedType || ''); setFeedDate(format(parseISO(log.date), 'yyyy-MM-dd')); setFeedLocationId(log.locationId); }} className="p-2 rounded-xl bg-violet-50 text-violet-600"><Pencil size={14} /></button><button onClick={() => onDeleteFeed(log.id)} className="p-2 rounded-xl bg-rose-50 text-rose-500"><Trash2 size={14} /></button></div></div></Card>)}</div>
        </>
      ) : (
        <>
          <Card>
            <div className="space-y-4">
              <div className="flex justify-between items-center"><h2 className="text-2xl font-serif italic font-bold">Medication</h2>{editingMedId && <button onClick={resetMed} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}</div>
              <Field label="Medication"><input value={medicationName} onChange={(e) => setMedicationName(e.target.value)} className={inputClass} /></Field>
              <Field label="Dosage"><input value={dosage} onChange={(e) => setDosage(e.target.value)} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bird (optional)"><Select value={medHenId} onChange={(e) => setMedHenId(e.target.value)}><option value="">Whole flock</option>{hens.map((hen) => <option key={hen.id} value={hen.id}>{hen.name}</option>)}</Select></Field>
                <Field label="Coop"><Select value={medLocationId} onChange={(e) => setMedLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
              </div>
              <Field label="Date"><DateButton value={medDate} onChange={setMedDate} /></Field>
              <button onClick={async () => {
                if (!medicationName || !dosage || !medLocationId) return;
                await onSaveMedication({ id: editingMedId || crypto.randomUUID(), date: new Date(medDate).toISOString(), medicationName, dosage, locationId: medLocationId, henId: medHenId || undefined });
                resetMed();
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Log medication</button>
            </div>
          </Card>
          <div className="space-y-3">{medicationLogs.map((log) => <Card key={log.id}><div className="flex justify-between gap-3"><div><p className="font-bold">{log.medicationName}</p><p className="text-xs text-violet-900/45">{log.dosage} • {format(parseISO(log.date), 'd MMM yyyy')}</p><p className="text-xs text-violet-900/45">{log.henId ? hens.find((hen) => hen.id === log.henId)?.name : 'Whole flock'} • {locations.find((location) => location.id === log.locationId)?.name}</p></div><div className="flex gap-1"><button onClick={() => { setEditingMedId(log.id); setMedicationName(log.medicationName); setDosage(log.dosage); setMedHenId(log.henId || ''); setMedLocationId(log.locationId); setMedDate(format(parseISO(log.date), 'yyyy-MM-dd')); }} className="p-2 rounded-xl bg-violet-50 text-violet-600"><Pencil size={14} /></button><button onClick={() => onDeleteMedication(log.id)} className="p-2 rounded-xl bg-rose-50 text-rose-500"><Trash2 size={14} /></button></div></div></Card>)}</div>
        </>
      )}
    </div>
  );
}

function SalesTracker({ saleLogs, onSave, onDelete }: { saleLogs: SaleLog[]; onSave: (item: SaleLog) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState(6);
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <h2 className="text-2xl font-serif italic font-bold">Record a sale</h2>
          <Field label="Quantity"><Stepper value={quantity} onChange={setQuantity} min={1} max={120} /></Field>
          <Field label="Price (£)"><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} /></Field>
          <Field label="Date"><DateButton value={date} onChange={setDate} /></Field>
          <button onClick={async () => {
            if (!price) return;
            await onSave({ id: crypto.randomUUID(), quantity, price: Number(price), date: new Date(date).toISOString() });
            setQuantity(6);
            setPrice('');
          }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Cluck n Load</button>
        </div>
      </Card>
      <div className="space-y-3">{saleLogs.map((log) => <Card key={log.id}><div className="flex justify-between gap-3"><div><p className="font-bold">{log.quantity} eggs sold</p><p className="text-xs text-violet-900/45">{format(parseISO(log.date), 'd MMM yyyy')}</p></div><div className="flex items-start gap-2"><div className="font-serif italic font-bold text-violet-600">£{log.price.toFixed(2)}</div><button onClick={() => onDelete(log.id)} className="p-2 rounded-xl bg-rose-50 text-rose-500"><Trash2 size={14} /></button></div></div></Card>)}</div>
    </div>
  );
}

function ChickenWiki() {
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * CHICKEN_FACTS.length));
  const factLabel = CHICKEN_FACTS[factIndex].includes('?') ? 'Pun of the day' : 'Fact of the day';
  return (
    <div className="space-y-4">
      <Card className="bg-violet-600 text-white border-violet-600">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-70 font-bold">{factLabel}</p>
            <button onClick={() => setFactIndex(Math.floor(Math.random() * CHICKEN_FACTS.length))} className="px-3 py-2 rounded-xl bg-white/15 text-xs font-bold">Another one</button>
          </div>
          <p className="text-lg font-serif italic leading-relaxed">“{CHICKEN_FACTS[factIndex]}”</p>
        </div>
      </Card>
      <div className="grid gap-3">
        {CHICKEN_WIKI.map((article) => (
          <a key={article.id} href={article.href} target="_blank" rel="noreferrer" className="block">
            <Card className="hover:border-violet-300 transition-colors">
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-3">
                  <h3 className="font-bold text-lg">{article.title}</h3>
                  <span className="text-[10px] uppercase tracking-widest bg-violet-50 text-violet-600 px-2 py-1 rounded-full font-bold">{article.category}</span>
                </div>
                <p className="text-sm text-violet-900/70 leading-relaxed">{article.content}</p>
                <p className="text-xs font-bold text-violet-600">Open article → {article.source}</p>
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}

function LogSheet({
  locations,
  defaultMode,
  onClose,
  onSaveEgg,
  onSaveBatch,
}: {
  locations: Location[];
  defaultMode: LogMode;
  onClose: () => void;
  onSaveEgg: (item: EggLog, mode: LogMode) => Promise<void>;
  onSaveBatch: (item: ChickBatch) => Promise<void>;
}) {
  const [mode, setMode] = useState<LogMode>(defaultMode);
  const [count, setCount] = useState(defaultMode === 'breed' ? 6 : 3);
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [temperature, setTemperature] = useState<number | ''>('');

  useEffect(() => {
    if (!locationId && locations[0]) setLocationId(locations[0].id);
  }, [locationId, locations]);

  return (
    <div className="fixed inset-0 bg-violet-950/30 z-50 flex items-end">
      <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-serif italic font-bold">Log today</h2>
            <p className="text-sm text-violet-900/50">Defaulting to produce, like a sensible hen.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-violet-50 text-violet-600"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMode('produce')} className={`py-3 rounded-2xl font-bold border ${mode === 'produce' ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>Produce</button>
          <button onClick={() => setMode('breed')} className={`py-3 rounded-2xl font-bold border ${mode === 'breed' ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>Breed</button>
        </div>
        <Field label={mode === 'breed' ? 'Egg count for incubation' : 'Egg count'}><Stepper value={count} onChange={setCount} min={1} max={48} /></Field>
        <Field label="Date"><DateButton value={date} onChange={setDate} /></Field>
        <Field label="Coop"><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
        {mode === 'produce' && (
          <Field label="Coop temperature (optional °C)">
            <div className="flex items-center gap-2">
              {[18, 20, 22, 24].map((preset) => <button key={preset} type="button" onClick={() => setTemperature(preset)} className={`px-3 py-2 rounded-xl text-sm font-bold ${temperature === preset ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>{preset}°</button>)}
              <input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value ? Number(e.target.value) : '')} className={inputClass} placeholder="Custom" />
            </div>
          </Field>
        )}
        <button
          disabled={!locationId || count < 1}
          onClick={async () => {
            if (mode === 'breed') {
              const started = new Date(date);
              await onSaveBatch({
                id: crypto.randomUUID(),
                count,
                dateStarted: started.toISOString(),
                expectedHatchDate: addDays(started, 21).toISOString(),
                locationId,
                status: 'Incubating',
                chicks: [],
                hatchedCount: 0,
                perishedCount: 0,
              });
              return;
            }
            await onSaveEgg({ id: crypto.randomUUID(), count, locationId, date: new Date(date).toISOString(), mode, coopTemperature: typeof temperature === 'number' ? temperature : undefined }, mode);
          }}
          className="w-full py-4 bg-violet-600 text-white rounded-3xl font-bold disabled:opacity-40"
        >
          {mode === 'breed' ? 'Start breeding batch' : 'Save collection'}
        </button>
      </div>
    </div>
  );
}

function LogSplash({ mode }: { mode: LogMode }) {
  return (
    <div className="fixed inset-0 bg-[#F8F7FF]/95 z-[70] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-24 h-24 rounded-full bg-white shadow-xl flex items-center justify-center mx-auto text-violet-600">
          {mode === 'produce' ? <span className="text-5xl">🍳</span> : <span className="text-5xl">🐥</span>}
        </div>
        <div>
          <h3 className="text-2xl font-serif italic font-bold">{mode === 'produce' ? 'Eggs logged' : 'Incubation started'}</h3>
          <p className="text-violet-900/55">Back home in a sec…</p>
        </div>
      </div>
    </div>
  );
}

function ConfirmSheet({ title, body, confirmText, onCancel, onConfirm }: { title: string; body: string; confirmText: string; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return (
    <div className="fixed inset-0 bg-violet-950/30 z-50 flex items-end">
      <div className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-5 space-y-4 shadow-2xl">
        <h3 className="text-2xl font-serif italic font-bold">{title}</h3>
        <p className="text-sm text-violet-900/55">{body}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 rounded-2xl bg-violet-50 text-violet-700 font-bold">Stay</button>
          <button onClick={onConfirm} className="py-3 rounded-2xl bg-rose-500 text-white font-bold">{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function ChickBatchTile({ batch, compact = false }: { batch: ChickBatch; compact?: boolean }) {
  const totalDays = 21;
  const daysDone = Math.max(0, Math.min(totalDays, differenceInCalendarDays(new Date(), parseISO(batch.dateStarted))));
  const percent = Math.max(0, Math.min(100, (daysDone / totalDays) * 100));
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(batch.expectedHatchDate), new Date()));

  return (
    <Card className={compact ? 'p-4' : ''}>
      <div className="space-y-3">
        <div className="flex justify-between items-start gap-4 pr-16">
          <div>
            <p className="font-bold text-lg">{batch.count} eggs</p>
            <p className="text-xs text-violet-900/45">Started {format(parseISO(batch.dateStarted), 'd MMM yyyy')}</p>
            <p className="text-[10px] mt-2 uppercase tracking-widest text-violet-600 font-bold">{batch.status}</p>
          </div>
          <div className="text-right text-xs text-violet-900/50">
            <p>{daysLeft === 0 ? 'Hatch window' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</p>
            {batch.hatchedCount || batch.perishedCount ? <p>{batch.hatchedCount || 0} hatched • {batch.perishedCount || 0} perished</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-3 text-violet-500">
          <span className="text-lg">🥚</span>
          <div className="flex-1">
            <div className="h-2 rounded-full bg-violet-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-300 to-violet-500 rounded-full" style={{ width: `${percent}%` }} /></div>
          </div>
          <span className="text-lg">🐥</span>
        </div>
      </div>
    </Card>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-violet-50 flex items-center justify-center p-6 relative overflow-hidden egg-art">
      <BackgroundArt />
      <div className="w-full max-w-md bg-white p-10 rounded-[48px] shadow-2xl shadow-violet-900/10 relative z-10 border border-white">{children}</div>
    </div>
  );
}

function BackgroundArt() {
  return (
    <>
      <div className="absolute top-[-5%] left-[-12%] w-48 h-48 rounded-full bg-violet-200/25 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-8%] w-40 h-40 rounded-full bg-amber-200/25 blur-3xl pointer-events-none" />
      <div className="absolute top-24 right-6 opacity-10 pointer-events-none text-violet-500"><Bird size={56} /></div>
      <div className="absolute top-56 left-4 opacity-10 pointer-events-none text-amber-500"><Egg size={48} /></div>
      <div className="absolute bottom-40 left-8 opacity-10 pointer-events-none text-violet-500"><Bird size={40} /></div>
    </>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex flex-col items-center justify-center p-1 rounded-xl transition-all ${active ? 'text-violet-600' : 'text-violet-300'}`}><div className={`p-1 rounded-lg ${active ? 'bg-violet-50' : ''}`}>{icon}</div><span className="text-[9px] mt-1 font-bold uppercase tracking-widest">{label}</span></button>;
}

function Card({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <section className={`bg-white p-6 rounded-[32px] shadow-sm border border-violet-100 ${className}`}>{children}</section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-widest text-violet-900/40 px-1">{label}</span>{children}</label>;
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return <Card className="p-3 min-h-[88px]"><div className="flex justify-between items-start gap-2"><span className="text-[10px] uppercase tracking-widest font-bold text-violet-900/40">{label}</span><div className="p-1.5 bg-violet-50 rounded-lg">{icon}</div></div><div className="text-xl font-serif italic font-bold mt-3 leading-none">{value}</div></Card>;
}

function MiniStat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return <div className={`rounded-2xl p-4 text-center ${highlight ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-violet-50'}`}><p className="text-[10px] uppercase tracking-widest text-violet-900/35 font-bold">{label}</p><p className={`mt-2 font-serif italic font-bold ${highlight ? 'text-amber-700 text-xl' : 'text-violet-700'}`}>{value}</p></div>;
}

function TimelineRow({ icon, tone, title, subtitle }: { icon: ReactNode; tone: string; title: string; subtitle?: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3 flex items-start gap-3 ${tone}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="font-bold text-sm">{title}</p>
        {subtitle && <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="text-center py-8 text-violet-900/45"><div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">{icon}</div><p>{text}</p></div>;
}

function FullscreenMessage({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="min-h-screen bg-violet-50 flex items-center justify-center"><div className="text-center space-y-3 text-violet-600"><div className="mx-auto w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm">{icon}</div><h2 className="text-2xl font-serif italic font-bold">{title}</h2><p className="text-violet-900/45">{subtitle}</p></div></div>;
}

function ImagePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex-1 cursor-pointer">
        <div className="w-full bg-violet-50 border-2 border-dashed border-violet-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-violet-100 transition-colors">
          {value ? <img src={value} alt="Preview" className="w-12 h-12 object-cover rounded-lg" /> : <><Camera size={20} className="text-violet-400" /><span className="text-[10px] font-bold text-violet-400 uppercase">Upload photo</span></>}
        </div>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onloadend = () => onChange(String(reader.result || ''));
          reader.readAsDataURL(file);
        }} />
      </label>
      {value && <button type="button" onClick={() => onChange('')} className="p-2 text-rose-500 bg-rose-50 rounded-xl"><Trash2 size={18} /></button>}
    </div>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <div className="relative"><select {...props} className={`${inputClass} appearance-none pr-12 ${props.className || ''}`}>{props.children}</select><ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" /></div>;
}

function DateButton({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <button type="button" onClick={() => ref.current?.showPicker ? ref.current.showPicker() : ref.current?.click()} className="w-full p-4 bg-violet-50 rounded-2xl border-2 border-transparent focus:border-violet-300 focus:outline-none flex items-center justify-between text-left">
        <span className="font-medium">{format(new Date(value), 'EEE d MMM yyyy')}</span>
        <CalendarDays size={18} className="text-violet-500" />
      </button>
      <input ref={ref} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
    </div>
  );
}

function Stepper({ value, onChange, min = 0, max = 100 }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <div className="rounded-[28px] bg-violet-50 p-4">
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-violet-600" />
      <div className="flex items-center justify-between mt-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="w-11 h-11 rounded-full bg-white text-violet-600 font-black text-xl shadow-sm">-</button>
        <div className="text-center">
          <div className="text-4xl font-serif italic font-bold leading-none">{value}</div>
          <div className="text-[10px] uppercase tracking-widest text-violet-900/35 font-bold mt-1">Set by slider or taps</div>
        </div>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="w-11 h-11 rounded-full bg-violet-600 text-white font-black text-xl shadow-sm">+</button>
      </div>
    </div>
  );
}

const inputClass = 'w-full p-4 bg-violet-50 rounded-2xl border-2 border-transparent focus:border-violet-300 focus:outline-none';
