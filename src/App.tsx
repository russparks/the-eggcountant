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
  NotebookPen,
  ChevronDown,
  Egg,
  House,
  MapPin,
  Pencil,
  PoundSterling,
  RefreshCw,
  Settings,
  Stethoscope,
  Trash2,
  TrendingUp,
  Utensils,
  Wheat,
  X,
} from 'lucide-react';
import { authApi, dataApi, SessionUser, uploadApi } from './api';
import { CHICKEN_FACTS, CHICKEN_WIKI } from './constants';
import { ChickBatch, EggLog, EggLogMode, FeedLog, Hen, HenAppearance, Location, MedicationLog, SaleItemType, SaleLog } from './types';
import eggcountantLogo from '../media/eggcountant-logo.png';
import singleEggIcon from '../media/1-egg.png';
import doubleEggIcon from '../media/2-eggs.png';
import tripleEggIcon from '../media/3-eggs.png';
import eggCupIcon from '../media/1-egg-cup.png';
import friedEggIcon from '../media/1-fried.png';
import hatchingEggIcon from '../media/1-hatching.png';
import demoHen2 from '../media/Layer 2.png';
import demoHen3 from '../media/Layer 3.png';
import demoHen4 from '../media/Layer 4.png';
import demoHen5 from '../media/Layer 5.png';
import demoHen6 from '../media/Layer 6.png';
import demoHen7 from '../media/Layer 7.png';
import demoHen8 from '../media/Layer 8.png';
import demoHen9 from '../media/Layer 9.png';

type TabKey = 'dashboard' | 'chicks' | 'settings' | 'sales' | 'wiki';
type SettingsMode = 'birds' | 'coops' | 'feed';
type LogMode = EggLogMode;
type CalendarFilter = 'eggs' | 'chicks' | 'sales' | 'feed';
type CalendarRange = '7' | '14' | 'month';

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

const DEMO_HENS: Hen[] = [
  { id: 'demo-hen-1', name: 'Hen Solo', locationId: 'demo-coop-1', status: 'Healthy', photoUrl: demoHen2 },
  { id: 'demo-hen-2', name: 'Meryl Cheep', locationId: 'demo-coop-1', status: 'Fluffy', photoUrl: demoHen3 },
  { id: 'demo-hen-3', name: 'Yolko Ono', locationId: 'demo-coop-2', status: 'Broody', photoUrl: demoHen4 },
  { id: 'demo-hen-4', name: 'Cluck Norris', locationId: 'demo-coop-2', status: 'Healthy', photoUrl: demoHen5 },
  { id: 'demo-hen-5', name: 'Princess Lay-a', locationId: 'demo-coop-3', status: 'Speckled', photoUrl: demoHen6 },
  { id: 'demo-hen-6', name: 'Eggatha Crispy', locationId: 'demo-coop-3', status: 'Scruffy', photoUrl: demoHen7 },
  { id: 'demo-hen-7', name: 'Feather Locklear', locationId: 'demo-coop-1', status: 'Moulting', photoUrl: demoHen8 },
  { id: 'demo-hen-8', name: 'Hennifer Lopez', locationId: 'demo-coop-2', status: 'Healthy', photoUrl: demoHen9 },
];

const DEMO_COOPS: Record<string, string> = {
  'demo-coop-1': 'Cluckingham Palace',
  'demo-coop-2': 'The Yolkshire Arms',
  'demo-coop-3': 'Henley-on-Coop',
};

const appearanceOptions: HenAppearance[] = ['Healthy', 'Unhealthy', 'Broody', 'Fluffy', 'Moulting', 'Speckled', 'Scruffy'];
const coopTypes: Location['type'][] = ['Garden', 'Allotment', 'Other'];
const calendarFilters: { key: CalendarFilter; label: string; icon: ReactNode }[] = [
  { key: 'eggs', label: 'Eggs', icon: <Egg size={14} /> },
  { key: 'chicks', label: 'Chicks', icon: <Bird size={14} /> },
  { key: 'sales', label: 'Sales', icon: <PoundSterling size={14} /> },
  { key: 'feed', label: 'Feed', icon: <Wheat size={14} /> },
];

const recentCutoff = (days: number) => subDays(new Date(), days - 1);
const withinLastDays = (date: string, days: number) => parseISO(date) >= recentCutoff(days);
const eggCupLabel = '🥚⋃';
const saleTypeOptions: { value: SaleItemType; label: string }[] = [
  { value: 'eggs', label: 'Eggs' },
  { value: 'chicks', label: 'Chicks' },
  { value: 'chickens', label: 'Chickens' },
];

const findGardenLocation = (locations: Location[]) => locations.find((location) => location.type === 'Garden' || /garden/i.test(location.name)) || locations[0];
const getBatchEggImage = (count: number) => (count <= 1 ? singleEggIcon : count === 2 ? doubleEggIcon : tripleEggIcon);
const getSaleLabel = (itemType?: SaleItemType, quantity?: number) => {
  const type = itemType || 'eggs';
  const count = quantity ?? 2;
  if (type === 'chicks') return count === 1 ? 'chick sold' : 'chicks sold';
  if (type === 'chickens') return count === 1 ? 'chicken sold' : 'chickens sold';
  return count === 1 ? 'egg sold' : 'eggs sold';
};

const NOTE_WORD_LIMIT = 100;

// DB returns numeric columns as strings — coerce everything back to numbers
const toNum = (v: unknown): number => { const n = Number(v); return isNaN(n) ? 0 : n; };
const normaliseEggLog = (log: EggLog): EggLog => ({ ...log, count: toNum(log.count) });
const normaliseHen = (hen: Hen): Hen => hen;
const normaliseSaleLog = (log: SaleLog): SaleLog => ({ ...log, quantity: toNum(log.quantity), price: toNum(log.price) });
const normaliseFeedLog = (log: FeedLog): FeedLog => ({ ...log, amount: toNum(log.amount), cost: log.cost != null ? toNum(log.cost) : undefined, weight: log.weight != null ? toNum(log.weight) : undefined });
const normaliseMedicationLog = (log: MedicationLog): MedicationLog => log;
const normaliseLocation = (loc: Location): Location => loc;
const normaliseChickBatch = (batch: ChickBatch): ChickBatch => ({ ...batch, count: toNum(batch.count), hatchedCount: batch.hatchedCount != null ? toNum(batch.hatchedCount) : undefined, perishedCount: batch.perishedCount != null ? toNum(batch.perishedCount) : undefined });

const countWords = (value: string) => value.trim() ? value.trim().split(/\s+/).length : 0;
const normalizeOptionalNote = (value: string) => value.trim() || undefined;
const truncateToWordLimit = (value: string, limit = NOTE_WORD_LIMIT) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return value;
  return words.slice(0, limit).join(' ');
};

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
    const safeList = async <K extends import('./api').CollectionName>(collection: K): Promise<import('./api').AppRecordMap[K][]> => {
      try {
        return await dataApi.list(collection);
      } catch {
        return [];
      }
    };
    const load = async () => {
      setLoadingData(true);
      try {
        const [locations, eggLogs, hens, feedLogs, medicationLogs, saleLogs, chickBatches] = await Promise.all([
          safeList('locations'),
          safeList('eggLogs'),
          safeList('hens'),
          safeList('feedLogs'),
          safeList('medicationLogs'),
          safeList('saleLogs'),
          safeList('chickBatches'),
        ]);

        if (!cancelled) {
          setState({
            locations: locations.map(normaliseLocation),
            eggLogs: eggLogs.map(normaliseEggLog),
            hens: hens.map(normaliseHen),
            feedLogs: feedLogs.map(normaliseFeedLog),
            medicationLogs: medicationLogs.map(normaliseMedicationLog),
            saleLogs: saleLogs.map(normaliseSaleLog),
            chickBatches: chickBatches.map(normaliseChickBatch),
          });
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
    window.scrollTo(0, 0);
  }, [activeTab]);

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
            <img src={eggcountantLogo} alt="The Eggcountant" className="h-20 w-auto mx-auto object-contain" />
            <p className="text-violet-900/40 font-medium uppercase tracking-[0.2em] text-[10px] mt-2">Hostinger-friendly flock bookkeeping</p>
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
    <div className="min-h-screen bg-[#F8F7FF] text-violet-900 font-sans relative overflow-x-hidden egg-art app-shell">
      <BackgroundArt />

      <AppHeader />

      <main className="max-w-md mx-auto p-4 pb-44 space-y-4 relative z-10 app-main">
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
                onOpenWiki={() => setActiveTab('wiki')}
              />
            )}
            {activeTab === 'chicks' && (
              <ChicksPage
                chickBatches={chickBatches}
                locations={locations}
                onSaveBatch={(item) => upsert('chickBatches', 'chickBatches', item)}
                onDeleteBatch={(id) => remove('chickBatches', 'chickBatches', id)}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsPage
                mode={settingsMode}
                setMode={setSettingsMode}
                hens={hens}
                locations={locations}
                onSaveHen={(item) => upsert('hens', 'hens', item)}
                onDeleteHen={(id) => remove('hens', 'hens', id)}
                onSaveLocation={(item) => upsert('locations', 'locations', item)}
                onDeleteLocation={(id) => remove('locations', 'locations', id)}
                feedLogs={feedLogs}
                medicationLogs={medicationLogs}
                onSaveFeed={(item) => upsert('feedLogs', 'feedLogs', item)}
                onDeleteFeed={(id) => remove('feedLogs', 'feedLogs', id)}
                onSaveMedication={(item) => upsert('medicationLogs', 'medicationLogs', item)}
                onDeleteMedication={(id) => remove('medicationLogs', 'medicationLogs', id)}
                onLogout={() => setLogoutConfirmOpen(true)}
              />
            )}
            {activeTab === 'sales' && <SalesTracker saleLogs={saleLogs} onSave={(item) => upsert('saleLogs', 'saleLogs', item)} onDelete={(id) => remove('saleLogs', 'saleLogs', id)} />}
            {activeTab === 'wiki' && <ChickenWiki />}
          </>
        )}
      </main>

      <button
        onClick={() => setLogSheetOpen(true)}
        aria-label="Log eggs"
        className="fixed bottom-[-22px] left-1/2 -translate-x-1/2 z-40 w-[88px] h-[112px] egg-fab bg-violet-600 text-white shadow-[0_18px_40px_rgba(124,58,237,0.35)] flex items-center justify-center border-4 border-[#F8F7FF]"
      >
        <Egg size={38} />
      </button>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-violet-100 px-4 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 shadow-[0_-4px_20px_rgba(124,58,237,0.05)]">
        <div className="max-w-md mx-auto grid grid-cols-5 items-end gap-1">
          <NavButton icon={<House size={26} />} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<Bird size={26} />} label="Chicks" active={activeTab === 'chicks'} onClick={() => setActiveTab('chicks')} />
          <div className="h-14" />
          <NavButton icon={<PoundSterling size={26} />} label="Sales" active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
          <NavButton icon={<Settings size={26} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </div>
      </nav>

      {logSheetOpen && (
        <LogSheet
          locations={locations}
          defaultMode="produce"
          onClose={() => setLogSheetOpen(false)}
          onSaveEgg={async (item, mode) => {
            await upsert('eggLogs', 'eggLogs', item);
            setSplash({ mode, at: Date.now() });
          }}
          onSaveBatch={async (item) => {
            await upsert('chickBatches', 'chickBatches', item);
            setSplash({ mode: 'breed', at: Date.now() });
          }}
        />
      )}

      {logoutConfirmOpen && (
        <ConfirmSheet
          title="Sign out?"
          body=""
          confirmText="Sign out"
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={handleLogout}
        />
      )}

      {splash && <LogSplash mode={splash.mode} />}
    </div>
  );
}

function AppHeader() {
  return (
    <header className="bg-white/92 backdrop-blur border-b border-violet-100 p-4 sticky top-0 z-30 shadow-sm">
      <div className="max-w-md mx-auto flex items-center justify-center">
        <img src={eggcountantLogo} alt="The Eggcountant" className="h-14 w-auto object-contain" />
      </div>
    </header>
  );
}

function Dashboard({
  eggLogs,
  saleLogs,
  feedLogs,
  medicationLogs,
  locations,
  chickBatches,
  onOpenWiki,
}: {
  eggLogs: EggLog[];
  saleLogs: SaleLog[];
  feedLogs: FeedLog[];
  medicationLogs: MedicationLog[];
  locations: Location[];
  chickBatches: ChickBatch[];
  onOpenWiki: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('eggs');
  const totalEggs = eggLogs.reduce((sum, log) => sum + log.count, 0);
  const totalSold = saleLogs.reduce((sum, log) => sum + log.quantity, 0);
  const revenue = saleLogs.reduce((sum, log) => sum + log.price, 0);
  const costs = feedLogs.reduce((sum, log) => sum + (log.cost || 0), 0);
  const latestLay = eggLogs.length > 0 ? eggLogs[0].count : 0;

  const chartData = Array.from({ length: 14 }).map((_, index) => {
    const day = subDays(new Date(), 13 - index);
    const key = format(day, 'yyyy-MM-dd');
    const eggs = eggLogs.filter((log) => log.date.startsWith(key)).reduce((sum, log) => sum + log.count, 0);
    return { day: format(day, 'MMM d'), eggs };
  });

  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedEggLogs = eggLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedEggs = selectedEggLogs.reduce((sum, log) => sum + log.count, 0);
  const selectedSales = saleLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedFeed = feedLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedMeds = medicationLogs.filter((log) => log.date.startsWith(selectedKey));
  const selectedIncubationStarts = chickBatches.filter((batch) => batch.dateStarted.startsWith(selectedKey));

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="LATEST CLUTCH" value={latestLay} icon={<img src={singleEggIcon} alt="" className="w-8 h-8 object-contain" />} />
        <StatCard label="TOTAL HAUL" value={totalEggs} icon={<img src={eggCupIcon} alt="" className="w-8 h-8 object-contain" />} />
        <StatCard label="TOTAL SOLD" value={totalSold} icon={<img src={friedEggIcon} alt="" className="w-8 h-8 object-contain" />} />
        <StatCard label="PROFIT-ISH" value={`£${(revenue - costs).toFixed(2)}`} icon={<img src={hatchingEggIcon} alt="" className="w-8 h-8 object-contain" />} accent="net" />
      </section>

      <Card>
        <div className="flex justify-between items-end mb-4 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-serif italic">Rollin' Lay Count</h3>
            </div>
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
        calendarFilter={calendarFilter}
        onChangeFilter={setCalendarFilter}
        eggLogs={eggLogs}
        saleLogs={saleLogs}
        feedLogs={feedLogs}
        medicationLogs={medicationLogs}
        chickBatches={chickBatches}
      />

      <Card>
        <div className="space-y-1">
          <h3 className="text-xl font-serif italic font-bold">{format(selectedDate, 'EEEE d MMMM')}</h3>
          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/35 font-bold">Selected day</p>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <MiniStat label="Egg lay" value={selectedEggs} highlight={selectedEggs > 0} />
          <MiniStat label="Sales" value={`£${selectedSales.reduce((sum, log) => sum + log.price, 0).toFixed(2)}`} />
          <MiniStat label="Feed" value={`£${selectedFeed.reduce((sum, log) => sum + (log.cost || 0), 0).toFixed(2)}`} />
          <MiniStat label="Meds" value={selectedMeds.length} />
        </div>
        <div className="mt-4 space-y-3">
          {selectedEggLogs.length > 0 && (
            <TimelineRow icon={<Egg size={16} />} tone="border border-[#f6c85f]/70 bg-white text-violet-800" title={`Egg lay: ${selectedEggs}`} subtitle={selectedEggLogs.map((log) => `${log.mode === 'breed' ? 'Breed' : 'Produce'} · ${log.count}`).join(' • ')} />
          )}
          {selectedSales.map((log) => (
            <div key={log.id}><TimelineRow icon={<PoundSterling size={16} />} tone="bg-emerald-50 text-emerald-700" title={`Sale: ${log.quantity} eggs`} subtitle={`£${log.price.toFixed(2)}`} /></div>
          ))}
          {selectedFeed.map((log) => (
            <div key={log.id}><TimelineRow icon={<Wheat size={16} />} tone="bg-violet-50 text-violet-700" title={`Chow top-up: ${log.amount} ${log.amount === 1 ? 'pack / bag' : 'packs / bags'}`} subtitle={[log.feedType, log.weight ? `${log.weight}kg` : null, log.cost ? `£${log.cost.toFixed(2)}` : null].filter(Boolean).join(' • ')} /></div>
          ))}
          {selectedMeds.map((log) => (
            <div key={log.id}><TimelineRow icon={<Stethoscope size={16} />} tone="bg-rose-50 text-rose-700" title={log.medicationName} subtitle={log.dosage} /></div>
          ))}
          {selectedIncubationStarts.map((batch) => (
            <div key={batch.id}><TimelineRow icon={<Bird size={16} />} tone="bg-sky-50 text-sky-700" title={`Chicks started: ${batch.count} eggs`} subtitle={`Expected hatch ${format(parseISO(batch.expectedHatchDate), 'd MMM')}`} /></div>
          ))}
          {selectedEggLogs.length === 0 && selectedSales.length === 0 && selectedFeed.length === 0 && selectedMeds.length === 0 && selectedIncubationStarts.length === 0 && (
            <EmptyState icon={<CalendarDays size={20} />} text="Quiet day. Suspiciously efficient." />
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-serif italic mb-4">It's not a competition...but...</h3>
        <div className="space-y-4">
          {locations.length === 0 ? <EmptyState icon={<MapPin size={22} />} text="No coops yet. Add one in Settings." /> : locations.map((location) => {
            const eggs = eggLogs.filter((log) => log.locationId === location.id).reduce((sum, log) => sum + log.count, 0);
            const percentage = totalEggs ? (eggs / totalEggs) * 100 : 0;
            return (
              <div key={location.id} className="space-y-2">
                <div className="flex justify-between items-end text-sm font-medium gap-3">
                  <span>{location.name}</span>
                  <div className="flex items-center gap-2 text-right leading-none">
                    <img src={singleEggIcon} alt="" className="w-5 h-5 object-contain" />
                    <div className="text-xs font-bold text-violet-900/45">x</div>
                    <div className="text-lg font-serif italic font-bold text-violet-700">{eggs}</div>
                  </div>
                </div>
                <div className="h-2 bg-violet-50 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-600 rounded-full" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <button onClick={onOpenWiki} className="w-full flex items-center justify-between gap-3 text-left rounded-[24px] bg-violet-50 px-4 py-4 text-violet-700">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/40 font-bold">Hen Wiki</p>
            <p className="font-serif italic font-bold text-lg">Facts, puns, and chicken nerdery</p>
          </div>
          <BookOpen size={22} />
        </button>
      </Card>
    </div>
  );
}

function CalendarCard({
  selectedDate,
  onSelectDate,
  calendarFilter,
  onChangeFilter,
  eggLogs,
  saleLogs,
  feedLogs,
  medicationLogs,
  chickBatches,
}: {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  calendarFilter: CalendarFilter;
  onChangeFilter: (value: CalendarFilter) => void;
  eggLogs: EggLog[];
  saleLogs: SaleLog[];
  feedLogs: FeedLog[];
  medicationLogs: MedicationLog[];
  chickBatches: ChickBatch[];
}) {
  const [range, setRange] = useState<CalendarRange>('month');
  const days = useMemo(() => {
    if (range === 'month') {
      return eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) });
    }
    const span = range === '7' ? 6 : 13;
    return eachDayOfInterval({ start: subDays(selectedDate, span), end: selectedDate });
  }, [range, selectedDate]);

  const title = range === 'month'
    ? format(selectedDate, 'MMMM yyyy')
    : `${range} day view`;

  const hasEvent = (key: string) => {
    if (calendarFilter === 'eggs') return eggLogs.some((log) => log.date.startsWith(key));
    if (calendarFilter === 'sales') return saleLogs.some((log) => log.date.startsWith(key));
    if (calendarFilter === 'feed') return feedLogs.some((log) => log.date.startsWith(key)) || medicationLogs.some((log) => log.date.startsWith(key));
    return chickBatches.some((batch) => batch.dateStarted.startsWith(key));
  };

  const eventValue = (key: string) => {
    if (calendarFilter === 'eggs') return eggLogs.filter((log) => log.date.startsWith(key)).reduce((sum, log) => sum + log.count, 0);
    if (calendarFilter === 'sales') return saleLogs.filter((log) => log.date.startsWith(key)).length;
    if (calendarFilter === 'feed') return feedLogs.filter((log) => log.date.startsWith(key)).length + medicationLogs.filter((log) => log.date.startsWith(key)).length;
    return chickBatches.filter((batch) => batch.dateStarted.startsWith(key)).reduce((sum, batch) => sum + batch.count, 0);
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-2xl font-serif italic font-bold">{title}</h2>
        {range !== 'month' && <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/35 font-bold">ending {format(selectedDate, 'd MMM')}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {calendarFilters.map((item) => (
          <button key={item.key} onClick={() => onChangeFilter(item.key)} className={`px-3 py-2.5 rounded-2xl text-xs font-bold border flex items-center justify-center gap-1.5 ${calendarFilter === item.key ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2 text-center mb-2">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => <div key={day} className="text-[10px] uppercase tracking-widest text-violet-900/35 font-bold">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {range === 'month' && Array.from({ length: (new Date(days[0]).getDay() + 6) % 7 }).map((_, index) => <div key={`gap-${index}`} />)}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const isSelected = isSameDay(day, selectedDate);
          const value = eventValue(key);
          const active = hasEvent(key);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`aspect-square rounded-2xl border flex flex-col items-center justify-center px-1 ${isSelected ? 'bg-violet-600 text-white border-violet-600' : active ? 'bg-white border-[#f6c85f]' : 'bg-white border-violet-100'}`}
            >
              <span className={`text-[11px] font-semibold ${isSelected ? 'text-white/80' : 'text-violet-900/55'}`}>{format(day, 'd')}</span>
              {active && <span className={`text-sm font-black leading-none mt-1 ${isSelected ? 'text-white' : 'text-violet-700'}`}>{value}</span>}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <button onClick={() => setRange('7')} className={`py-2.5 rounded-2xl text-xs font-bold border ${range === '7' ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>7 days</button>
        <button onClick={() => setRange('14')} className={`py-2.5 rounded-2xl text-xs font-bold border ${range === '14' ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>14 days</button>
        <button onClick={() => setRange('month')} className={`py-2.5 rounded-2xl text-xs font-bold border ${range === 'month' ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>1 month</button>
      </div>
    </Card>
  );
}

function ChicksPage({
  chickBatches,
  locations,
  onSaveBatch,
  onDeleteBatch,
}: {
  chickBatches: ChickBatch[];
  locations: Location[];
  onSaveBatch: (item: ChickBatch) => Promise<void>;
  onDeleteBatch: (id: string) => Promise<void>;
}) {
  const sortedBatches = [...chickBatches].sort((a, b) => parseISO(b.dateStarted).getTime() - parseISO(a.dateStarted).getTime());

  return (
    <div className="space-y-4">
      {sortedBatches.length === 0 ? (
        <Card><EmptyState icon={<Bird size={22} />} text="No incubation batches yet. Tap the big egg to start one." /></Card>
      ) : (
        <div className="space-y-3">
          {sortedBatches.map((batch) => (
            <div key={batch.id}>
              <EditableChickBatchTile
                batch={batch}
                locationName={locations.find((location) => location.id === batch.locationId)?.name}
                onSave={onSaveBatch}
                onDelete={() => onDeleteBatch(batch.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPage({
  mode,
  setMode,
  hens,
  locations,
  feedLogs,
  medicationLogs,
  onSaveHen,
  onDeleteHen,
  onSaveLocation,
  onDeleteLocation,
  onSaveFeed,
  onDeleteFeed,
  onSaveMedication,
  onDeleteMedication,
  onLogout,
}: {
  mode: SettingsMode;
  setMode: (mode: SettingsMode) => void;
  hens: Hen[];
  locations: Location[];
  feedLogs: FeedLog[];
  medicationLogs: MedicationLog[];
  onSaveHen: (item: Hen) => Promise<void>;
  onDeleteHen: (id: string) => Promise<void>;
  onSaveLocation: (item: Location) => Promise<void>;
  onDeleteLocation: (id: string) => Promise<void>;
  onSaveFeed: (item: FeedLog) => Promise<void>;
  onDeleteFeed: (id: string) => Promise<void>;
  onSaveMedication: (item: MedicationLog) => Promise<void>;
  onDeleteMedication: (id: string) => Promise<void>;
  onLogout: () => void;
}) {
  const sections = [
    { key: 'birds' as const, label: 'Birds', icon: <Bird size={16} /> },
    { key: 'coops' as const, label: 'Coops', icon: <MapPin size={16} /> },
    { key: 'feed' as const, label: 'Feed', icon: <Wheat size={16} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {sections.map((section) => (
          <button key={section.key} onClick={() => setMode(section.key)} className={`rounded-[26px] border px-3 py-4 text-sm font-bold flex flex-col items-center gap-2 ${mode === section.key ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-violet-700 border-violet-100'}`}>
            <span className={`w-9 h-9 rounded-2xl flex items-center justify-center ${mode === section.key ? 'bg-white/15' : 'bg-violet-50 text-violet-600'}`}>{section.icon}</span>
            {section.label}
          </button>
        ))}
      </div>

      {mode === 'birds' && <BirdSettings hens={hens} locations={locations} onSaveHen={onSaveHen} onDeleteHen={onDeleteHen} />}
      {mode === 'coops' && <CoopSettings locations={locations} onSaveLocation={onSaveLocation} onDeleteLocation={onDeleteLocation} />}
      {mode === 'feed' && (
        <FeedAndMedTracker
          locations={locations}
          hens={hens}
          feedLogs={feedLogs}
          medicationLogs={medicationLogs}
          onSaveFeed={onSaveFeed}
          onDeleteFeed={onDeleteFeed}
          onSaveMedication={onSaveMedication}
          onDeleteMedication={onDeleteMedication}
        />
      )}

      <button onClick={onLogout} className="w-full py-4 rounded-[28px] bg-rose-500 text-white font-bold shadow-sm">Log out</button>
    </div>
  );
}

function BirdSettings({
  hens,
  locations,
  onSaveHen,
  onDeleteHen,
}: {
  hens: Hen[];
  locations: Location[];
  onSaveHen: (item: Hen) => Promise<void>;
  onDeleteHen: (id: string) => Promise<void>;
}) {
  const [editingHenId, setEditingHenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState(findGardenLocation(locations)?.id || '');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [status, setStatus] = useState<HenAppearance>('Healthy');
  const [savedFlash, setSavedFlash] = useState(false);
  const demoMode = hens.length === 0;
  const displayHens = demoMode ? DEMO_HENS : hens;

  useEffect(() => {
    if (!locationId && locations.length) setLocationId(findGardenLocation(locations)?.id || locations[0].id);
  }, [locationId, locations]);

  useEffect(() => {
    if (!savedFlash) return;
    const timer = window.setTimeout(() => setSavedFlash(false), 1200);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  const resetHenForm = () => {
    setEditingHenId(null);
    setName('');
    setPhotoUrl('');
    setNotes('');
    setStatus('Healthy');
    setLocationId(findGardenLocation(locations)?.id || locations[0]?.id || '');
  };

  return (
    <div className="space-y-4 relative">
      <Card>
        <div className="space-y-4 relative">
          <div className="flex items-start justify-between gap-3 pr-20">
            <div>
              <h2 className="text-2xl font-serif italic font-bold">Add a Little Clucker</h2>
            </div>
            {editingHenId && <button onClick={resetHenForm} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}
          </div>
          <div className="absolute top-0 right-0 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-violet-700 border border-violet-100">
            <img src={hatchingEggIcon} alt="" className="w-5 h-5 object-contain" />
            <span className="text-xs font-black">{hens.length}</span>
          </div>
          {locations.length === 0 ? (
            <div className="rounded-2xl bg-amber-50 text-amber-800 px-4 py-3 text-sm">Add a coop first, then your little cluckers can move in.</div>
          ) : (
            <>
              <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Henrietta" /></Field>
              <Field label="Appearance"><Select value={status} onChange={(e) => setStatus(e.target.value as HenAppearance)}>{appearanceOptions.map((option) => <option key={option}>{option}</option>)}</Select></Field>
              <Field label="Coop"><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
              <Field label="Photo (optional)"><ImagePicker value={photoUrl} onChange={setPhotoUrl} /></Field>
              <Field label="Notes (optional)"><NoteButton note={notes} onClick={() => setNoteOpen(true)} /></Field>
              <button onClick={async () => {
                if (!name.trim() || !locationId) return;
                await onSaveHen({ id: editingHenId || crypto.randomUUID(), name: name.trim(), locationId, status, photoUrl: photoUrl || undefined, notes: normalizeOptionalNote(notes) });
                resetHenForm();
                setSavedFlash(true);
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingHenId ? 'Save bird' : "Let's Cluckin' Go!"}</button>
            </>
          )}
        </div>
      </Card>

      {savedFlash && <InlineSuccessSplash title="Bird saved" subtitle="Back to the flock." icon={<Bird size={30} />} />}

      {demoMode && (
        <Card className="p-4 bg-violet-50/70 border-violet-200">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/40 font-bold">Demo flock</p>
            <p className="text-sm text-violet-900/65">Showing 8 fake hens for fresh installs. Real birds will replace them once you add your own.</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        {displayHens.map((hen) => (
          <Card key={hen.id} className="p-3">
            <div className="relative">
              {!demoMode && (
                <div className="absolute top-0 right-0 flex gap-1">
                  <button onClick={() => {
                    setEditingHenId(hen.id);
                    setName(hen.name);
                    setLocationId(hen.locationId);
                    setPhotoUrl(hen.photoUrl || '');
                    setNotes(hen.notes || '');
                    setStatus(hen.status);
                  }} className="p-1.5 bg-white/80 text-violet-600 rounded-lg"><Pencil size={12} /></button>
                  <button onClick={() => onDeleteHen(hen.id)} className="p-1.5 bg-white/80 text-rose-500 rounded-lg"><Trash2 size={12} /></button>
                </div>
              )}
              <div className="aspect-square rounded-2xl overflow-hidden bg-violet-50 mb-3 flex items-center justify-center">
                {hen.photoUrl ? <img src={hen.photoUrl} className="w-full h-full object-cover" /> : <Bird className="text-violet-300" />}
              </div>
              <p className="font-bold text-sm">{hen.name}</p>
              <p className="text-[10px] uppercase tracking-widest text-violet-900/40 font-bold">{demoMode ? DEMO_COOPS[hen.locationId] : locations.find((location) => location.id === hen.locationId)?.name}</p>
              <div className="mt-2 inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-violet-50 text-violet-700">{hen.status}</div>
              {hen.notes ? <p className="mt-2 text-xs leading-relaxed text-violet-900/55">{hen.notes}</p> : null}
            </div>
          </Card>
        ))}
      </div>
      {noteOpen ? <NoteModal value={notes} onClose={() => setNoteOpen(false)} onSave={setNotes} /> : null}
    </div>
  );
}

function CoopSettings({ locations, onSaveLocation, onDeleteLocation }: { locations: Location[]; onSaveLocation: (item: Location) => Promise<void>; onDeleteLocation: (id: string) => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<Location['type']>('Garden');
  const [photoUrl, setPhotoUrl] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!savedFlash) return;
    const timer = window.setTimeout(() => setSavedFlash(false), 1200);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  const reset = () => {
    setEditingId(null);
    setName('');
    setType('Garden');
    setPhotoUrl('');
  };

  return (
    <div className="space-y-4 relative">
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
            setSavedFlash(true);
          }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingId ? 'Save coop' : 'Add coop'}</button>
        </div>
      </Card>

      {savedFlash && <InlineSuccessSplash title="Coop saved" subtitle="Nest sorted." icon={<MapPin size={30} />} />}

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
  const [feedLocationId, setFeedLocationId] = useState(findGardenLocation(locations)?.id || '');
  const [feedNotes, setFeedNotes] = useState('');
  const [feedNoteOpen, setFeedNoteOpen] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [medHenId, setMedHenId] = useState('');
  const [medLocationId, setMedLocationId] = useState(findGardenLocation(locations)?.id || '');
  const [medNotes, setMedNotes] = useState('');
  const [medNoteOpen, setMedNoteOpen] = useState(false);
  const [medDate, setMedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [savedFlash, setSavedFlash] = useState<null | 'feed' | 'med'>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const recentFeedLogs = useMemo(() => feedLogs.filter((log) => withinLastDays(log.date, 14)), [feedLogs]);

  const resetFeed = () => {
    setEditingFeedId(null);
    setAmount(1);
    setCost('');
    setWeight('');
    setFeedType('');
    setFeedDate(format(new Date(), 'yyyy-MM-dd'));
    setFeedNotes('');
  };

  const resetMed = () => {
    setEditingMedId(null);
    setMedicationName('');
    setDosage('');
    setMedHenId('');
    setMedDate(format(new Date(), 'yyyy-MM-dd'));
    setMedNotes('');
  };

  useEffect(() => {
    if (!feedLocationId && locations.length) setFeedLocationId(findGardenLocation(locations)?.id || locations[0].id);
    if (!medLocationId && locations.length) setMedLocationId(findGardenLocation(locations)?.id || locations[0].id);
  }, [feedLocationId, medLocationId, locations]);

  useEffect(() => {
    if (!savedFlash) return;
    const timer = window.setTimeout(() => setSavedFlash(null), 1200);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  return (
    <div className="space-y-4 relative">
      {savedFlash && <InlineSuccessSplash title={savedFlash === 'feed' ? 'Feed saved' : 'Medication saved'} subtitle="Nice and tidy." icon={savedFlash === 'feed' ? <Wheat size={30} /> : <Stethoscope size={30} />} />}
      <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
        <button onClick={() => setMode('feed')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'feed' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Chow</button>
        <button onClick={() => setMode('med')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'med' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Medication</button>
      </div>

      {mode === 'feed' ? (
        <>
          <div ref={formRef}>
            <Card>
              <div className="space-y-4">
                <div className="flex justify-between items-center"><h2 className="text-2xl font-serif italic font-bold flex items-center gap-2"><Wheat size={22} className="text-violet-500" />Chow Log</h2>{editingFeedId && <button onClick={resetFeed} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}</div>
                <Field label="Packs / Bags"><Stepper value={amount} onChange={setAmount} min={1} max={20} /></Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="WEIGHT"><input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} placeholder="20" /></Field>
                  <Field label="COST"><input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} placeholder="14.99" /></Field>
                </div>
                <Field label="Type (optional)"><input value={feedType} onChange={(e) => setFeedType(e.target.value)} className={inputClass} placeholder="Layers pellets" /></Field>
                <Field label="Date"><DateButton value={feedDate} onChange={setFeedDate} /></Field>
                <Field label="Coop"><Select value={feedLocationId} onChange={(e) => setFeedLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
                <Field label="Notes (optional)"><NoteButton note={feedNotes} onClick={() => setFeedNoteOpen(true)} /></Field>
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
                    notes: normalizeOptionalNote(feedNotes),
                  });
                  resetFeed();
                  setSavedFlash('feed');
                }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingFeedId ? 'Save chow log' : 'Log chow purchase'}</button>
              </div>
            </Card>
          </div>
          <div className="space-y-3">{recentFeedLogs.map((log) => <Card key={log.id}><div className="flex justify-between gap-3"><div><p className="font-bold">{log.amount} {log.amount === 1 ? 'pack / bag' : 'packs / bags'}{log.feedType ? ` · ${log.feedType}` : ''}</p><p className="text-xs text-violet-900/45">{format(parseISO(log.date), 'd MMM yyyy')} • {locations.find((location) => location.id === log.locationId)?.name}</p><p className="text-xs text-violet-900/45">{[log.weight ? `${log.weight}kg` : null, log.cost ? `£${log.cost.toFixed(2)}` : null].filter(Boolean).join(' • ') || 'Optional extras not logged'}</p>{log.notes ? <p className="mt-2 text-xs leading-relaxed text-violet-900/55">{log.notes}</p> : null}</div><div className="flex gap-1"><button onClick={() => { setEditingFeedId(log.id); setAmount(log.amount); setCost(log.cost ? String(log.cost) : ''); setWeight(log.weight ? String(log.weight) : ''); setFeedType(log.feedType || ''); setFeedDate(format(parseISO(log.date), 'yyyy-MM-dd')); setFeedLocationId(log.locationId); setFeedNotes(log.notes || ''); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="p-2 rounded-xl bg-violet-50 text-violet-600"><Pencil size={14} /></button><button onClick={() => onDeleteFeed(log.id)} className="p-2 rounded-xl bg-rose-50 text-rose-500"><Trash2 size={14} /></button></div></div></Card>)}</div>
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
              <Field label="Notes (optional)"><NoteButton note={medNotes} onClick={() => setMedNoteOpen(true)} /></Field>
              <button onClick={async () => {
                if (!medicationName || !dosage || !medLocationId) return;
                await onSaveMedication({ id: editingMedId || crypto.randomUUID(), date: new Date(medDate).toISOString(), medicationName, dosage, locationId: medLocationId, henId: medHenId || undefined, notes: normalizeOptionalNote(medNotes) });
                resetMed();
                setSavedFlash('med');
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Log medication</button>
            </div>
          </Card>
          <div className="space-y-3">{medicationLogs.map((log) => <Card key={log.id}><div className="flex justify-between gap-3"><div><p className="font-bold">{log.medicationName}</p><p className="text-xs text-violet-900/45">{log.dosage} • {format(parseISO(log.date), 'd MMM yyyy')}</p><p className="text-xs text-violet-900/45">{log.henId ? hens.find((hen) => hen.id === log.henId)?.name : 'Whole flock'} • {locations.find((location) => location.id === log.locationId)?.name}</p>{log.notes ? <p className="mt-2 text-xs leading-relaxed text-violet-900/55">{log.notes}</p> : null}</div><div className="flex gap-1"><button onClick={() => { setEditingMedId(log.id); setMedicationName(log.medicationName); setDosage(log.dosage); setMedHenId(log.henId || ''); setMedLocationId(log.locationId); setMedDate(format(parseISO(log.date), 'yyyy-MM-dd')); setMedNotes(log.notes || ''); }} className="p-2 rounded-xl bg-violet-50 text-violet-600"><Pencil size={14} /></button><button onClick={() => onDeleteMedication(log.id)} className="p-2 rounded-xl bg-rose-50 text-rose-500"><Trash2 size={14} /></button></div></div></Card>)}</div>
        </>
      )}
      {feedNoteOpen ? <NoteModal value={feedNotes} onClose={() => setFeedNoteOpen(false)} onSave={setFeedNotes} /> : null}
      {medNoteOpen ? <NoteModal value={medNotes} onClose={() => setMedNoteOpen(false)} onSave={setMedNotes} /> : null}
    </div>
  );
}

function SalesTracker({ saleLogs, onSave, onDelete }: { saleLogs: SaleLog[]; onSave: (item: SaleLog) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(6);
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [itemType, setItemType] = useState<SaleItemType>('eggs');
  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [savedSplash, setSavedSplash] = useState(false);
  const recentSales = useMemo(() => saleLogs.filter((log) => withinLastDays(log.date, 14)), [saleLogs]);

  useEffect(() => {
    if (!savedSplash) return;
    const timer = window.setTimeout(() => setSavedSplash(false), 1200);
    return () => window.clearTimeout(timer);
  }, [savedSplash]);

  const reset = () => {
    setEditingId(null);
    setQuantity(6);
    setPrice('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setItemType('eggs');
    setNotes('');
  };

  return (
    <div className="space-y-4 relative">
      {savedSplash && <InlineSuccessSplash title="Sale logged" subtitle="Cluck n Load complete." icon={<PoundSterling size={30} />} />}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-serif italic font-bold">Record a sale</h2>
            {editingId && <button onClick={reset} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-600">Cancel edit</button>}
          </div>
          <Field label="What was sold"><Select value={itemType} onChange={(e) => setItemType(e.target.value as SaleItemType)}>{saleTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
          <Field label="Units sold"><Stepper value={quantity} onChange={setQuantity} min={1} max={120} /></Field>
          <Field label="Total price (£)"><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} /></Field>
          <Field label="Date"><DateButton value={date} onChange={setDate} /></Field>
          <Field label="Notes (optional)"><NoteButton note={notes} onClick={() => setNoteOpen(true)} /></Field>
          <button onClick={async () => {
            if (!price) return;
            await onSave({ id: editingId || crypto.randomUUID(), quantity, price: Number(price), date: new Date(date).toISOString(), itemType, notes: normalizeOptionalNote(notes) });
            reset();
            setSavedSplash(true);
          }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">{editingId ? 'Save sale' : 'Cluck n Load'}</button>
        </div>
      </Card>
      <div className="space-y-3">{recentSales.map((log) => <Card key={log.id}><div className="flex justify-between gap-3"><div><p className="font-bold">{log.quantity} {getSaleLabel(log.itemType, log.quantity)}</p><p className="text-xs text-violet-900/45">{format(parseISO(log.date), 'd MMM yyyy')}</p>{log.notes ? <p className="mt-2 text-xs leading-relaxed text-violet-900/55">{log.notes}</p> : null}</div><div className="flex items-start gap-2"><div className="font-serif italic font-bold text-violet-600">£{log.price.toFixed(2)}</div><button onClick={() => { setEditingId(log.id); setQuantity(log.quantity); setPrice(String(log.price)); setDate(format(parseISO(log.date), 'yyyy-MM-dd')); setItemType(log.itemType || 'eggs'); setNotes(log.notes || ''); }} className="p-2 rounded-xl bg-violet-50 text-violet-600"><Pencil size={14} /></button><button onClick={() => onDelete(log.id)} className="p-2 rounded-xl bg-rose-50 text-rose-500"><Trash2 size={14} /></button></div></div></Card>)}</div>
      {noteOpen ? <NoteModal value={notes} onClose={() => setNoteOpen(false)} onSave={setNotes} /> : null}
    </div>
  );
}

function ChickenWiki() {
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * CHICKEN_FACTS.length));
  const factLabel = CHICKEN_FACTS[factIndex].includes('?') ? 'Pun of the day' : 'Fact of the day';
  return (
    <div className="space-y-4">
      <Card className="bg-violet-50 text-violet-950 border-violet-200">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-violet-700/70 font-bold">Pun / fact card</p>
              <p className="text-sm text-violet-900/70">{factLabel}</p>
            </div>
            <button onClick={() => setFactIndex(Math.floor(Math.random() * CHICKEN_FACTS.length))} className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold shrink-0">Another one</button>
          </div>
          <p className="text-lg font-serif italic leading-relaxed text-violet-950">“{CHICKEN_FACTS[factIndex]}”</p>
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
  const [locationId, setLocationId] = useState(findGardenLocation(locations)?.id || '');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expectedHatchDate, setExpectedHatchDate] = useState(format(addDays(new Date(), 21), 'yyyy-MM-dd'));
  const [temperature, setTemperature] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    if (!locationId && locations.length) setLocationId(findGardenLocation(locations)?.id || locations[0].id);
  }, [locationId, locations]);

  useEffect(() => {
    if (mode === 'breed') setExpectedHatchDate(format(addDays(new Date(date), 21), 'yyyy-MM-dd'));
  }, [date, mode]);

  const isBreed = mode === 'breed';

  return (
    <div className="fixed inset-0 bg-violet-950/30 z-50 flex items-end justify-center px-3 pt-10 pb-6">
      <div className="w-full max-w-md bg-white rounded-[32px] p-5 space-y-4 shadow-2xl max-h-[82vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-serif italic font-bold">{isBreed ? 'Log Eggs and Chicks' : 'Log eggs'}</h2>
            {!isBreed && <p className="text-sm text-violet-900/50">Pick eggs or chicks and get on with it.</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-violet-50 text-violet-600"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button aria-label="Produce mode" onClick={() => setMode('produce')} className={`py-3 rounded-2xl font-bold border flex items-center justify-center ${mode === 'produce' ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}><img src={friedEggIcon} alt="" className="w-10 h-10 object-contain" /></button>
          <button aria-label="Breed mode" onClick={() => setMode('breed')} className={`py-3 rounded-2xl font-bold border flex items-center justify-center ${mode === 'breed' ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-100'}`}><img src={hatchingEggIcon} alt="" className="w-10 h-10 object-contain" /></button>
        </div>
        <Field label="Egg count"><Stepper value={count} onChange={setCount} min={1} max={48} /></Field>
        <Field label="Date"><DateButton value={date} onChange={setDate} /></Field>
        {isBreed && <Field label="Anticipated hatch date"><DateButton value={expectedHatchDate} onChange={setExpectedHatchDate} /></Field>}
        <Field label="Coop"><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></Field>
        <Field label="Notes (optional)"><NoteButton note={notes} onClick={() => setNoteOpen(true)} /></Field>
        <Field label={`${isBreed ? 'Incubator' : 'Coop'} temperature (optional °C)`}>
          <div className="flex items-center gap-2">
            {[18, 20, 22, 24].map((preset) => <button key={preset} type="button" onClick={() => setTemperature(preset)} className={`px-3 py-2 rounded-xl text-sm font-bold ${temperature === preset ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}>{preset}°</button>)}
            <input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value ? Number(e.target.value) : '')} className={inputClass} placeholder="Custom" />
          </div>
        </Field>
        <button
          disabled={!locationId || count < 1}
          onClick={async () => {
            if (isBreed) {
              const started = new Date(date);
              await onSaveBatch({
                id: crypto.randomUUID(),
                count,
                dateStarted: started.toISOString(),
                expectedHatchDate: new Date(expectedHatchDate).toISOString(),
                locationId,
                status: 'Incubating',
                notes: normalizeOptionalNote(notes),
                temperature: temperature === '' ? undefined : temperature,
                chicks: [],
                hatchedCount: 0,
                perishedCount: 0,
              });
              return;
            }
            await onSaveEgg({ id: crypto.randomUUID(), count, locationId, date: new Date(date).toISOString(), mode, coopTemperature: temperature === '' ? undefined : temperature, notes: normalizeOptionalNote(notes) }, mode);
          }}
          className="w-full py-4 bg-violet-600 text-white rounded-3xl font-bold disabled:opacity-40"
        >
          {isBreed ? 'Start breeding batch' : 'Save collection'}
        </button>
        {noteOpen ? <NoteModal value={notes} onClose={() => setNoteOpen(false)} onSave={setNotes} /> : null}
      </div>
    </div>
  );
}

function LogSplash({ mode }: { mode: LogMode }) {
  return (
    <div className="fixed inset-0 bg-[#F8F7FF]/95 z-[70] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-24 h-24 rounded-full bg-white shadow-xl flex items-center justify-center mx-auto text-violet-600">
          <img src={mode === 'produce' ? friedEggIcon : hatchingEggIcon} alt="" className="w-14 h-14 object-contain" />
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
    <div className="fixed inset-0 bg-violet-950/30 z-50 flex items-end justify-center px-3 pt-10 pb-6">
      <div className="w-full max-w-md bg-white rounded-[32px] p-5 space-y-4 shadow-2xl max-h-[82vh] overflow-y-auto">
        <h3 className="text-2xl font-serif italic font-bold">{title}</h3>
        {body ? <p className="text-sm text-violet-900/55">{body}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 rounded-2xl bg-violet-50 text-violet-700 font-bold">Stay</button>
          <button onClick={onConfirm} className="py-3 rounded-2xl bg-rose-500 text-white font-bold">{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function EditableChickBatchTile({
  batch,
  locationName,
  onSave,
  onDelete,
}: {
  batch: ChickBatch;
  locationName?: string;
  onSave: (item: ChickBatch) => Promise<void>;
  onDelete: () => Promise<void> | Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [hatchedCount, setHatchedCount] = useState(batch.hatchedCount && batch.hatchedCount > 0 ? batch.hatchedCount : batch.count);
  const totalDays = 21;
  const daysDone = Math.max(0, Math.min(totalDays, differenceInCalendarDays(new Date(), parseISO(batch.dateStarted))));
  const percent = Math.max(0, Math.min(100, (daysDone / totalDays) * 100));
  const daysLeft = Math.max(0, differenceInCalendarDays(parseISO(batch.expectedHatchDate), new Date()));
  const eggImage = getBatchEggImage(batch.count);

  useEffect(() => {
    setHatchedCount(batch.hatchedCount && batch.hatchedCount > 0 ? batch.hatchedCount : batch.count);
  }, [batch.count, batch.hatchedCount]);

  const saveEdit = async () => {
    const nextStatus = hatchedCount > 0 ? 'Hatched' : batch.status;
    await onSave({
      ...batch,
      hatchedCount,
      perishedCount: Math.max(0, batch.count - hatchedCount),
      status: nextStatus,
      hatchDate: hatchedCount > 0 ? (batch.hatchDate || new Date().toISOString()) : batch.hatchDate,
    });
    setEditing(false);
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex justify-between items-start gap-4">
          <div className="flex items-start gap-3">
            <img src={eggImage} alt="" className="w-14 h-14 object-contain shrink-0" />
            <div>
              <p className="text-4xl leading-none font-black text-violet-700">{batch.count}</p>
              <p className="font-bold text-sm uppercase tracking-[0.2em] text-violet-900/45 mt-1">Egg batch</p>
              <p className="text-xs text-violet-900/45 mt-2">Started {format(parseISO(batch.dateStarted), 'd MMM yyyy')}{locationName ? ` • ${locationName}` : ''}</p>
              <p className="text-[10px] mt-2 uppercase tracking-widest text-violet-600 font-bold">{batch.status}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => setEditing((current) => !current)} className="p-2 rounded-xl bg-violet-50 text-violet-600"><Pencil size={14} /></button>
            <button onClick={() => onDelete()} className="p-2 rounded-xl bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-violet-500">
          <img src={eggImage} alt="" className="w-8 h-8 object-contain" />
          <div className="flex-1">
            <div className="h-2 rounded-full bg-violet-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-300 to-violet-500 rounded-full" style={{ width: `${percent}%` }} /></div>
          </div>
          <div className="text-right min-w-[84px] ml-auto">
            <img src={hatchingEggIcon} alt="" className="w-7 h-7 object-contain ml-auto" />
            <p className="text-xs text-violet-900/55">{daysLeft === 0 ? 'Hatch window' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</p>
          </div>
        </div>
        {(batch.hatchedCount || batch.perishedCount) ? <p className="text-xs text-violet-900/55">🐣 {batch.hatchedCount || 0} hatched • ☠️ {batch.perishedCount || 0} perished</p> : null}
        {batch.temperature !== undefined ? <p className="text-xs text-violet-900/55">Temperature: {batch.temperature}°C</p> : null}
        {batch.notes ? <p className="text-xs leading-relaxed text-violet-900/55">{batch.notes}</p> : null}
        {editing && (
          <div className="rounded-3xl bg-violet-50 p-4 space-y-4 border border-violet-100">
            <Field label="Chicks hatched">
              <div className="space-y-3">
                <input type="range" min={0} max={batch.count} value={hatchedCount} onChange={(e) => setHatchedCount(Number(e.target.value))} className="w-full accent-violet-600" />
                <div className="flex items-center justify-between text-sm font-medium text-violet-700">
                  <span>0</span>
                  <span className="text-2xl font-serif italic font-bold">{hatchedCount}</span>
                  <span>{batch.count}</span>
                </div>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setEditing(false)} className="py-3 rounded-2xl bg-white text-violet-700 font-bold border border-violet-100">Cancel</button>
              <button onClick={saveEdit} className="py-3 rounded-2xl bg-violet-600 text-white font-bold">Save batch</button>
            </div>
          </div>
        )}
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
  return <button onClick={onClick} className={`flex flex-col items-center justify-center p-1 rounded-xl transition-all ${active ? 'text-violet-600' : 'text-violet-300'}`}><div className={`${active ? 'bg-violet-50' : ''} p-1 rounded-lg`}>{icon}</div><span className="text-[9px] mt-1 font-bold uppercase tracking-widest">{label}</span></button>;
}

function Card({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <section className={`bg-white p-6 rounded-[32px] shadow-sm border border-violet-100 ${className}`}>{children}</section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-widest text-violet-900/40 px-1">{label}</span>{children}</label>;
}

function NoteButton({ note, onClick }: { note?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${note ? 'border-violet-200 bg-violet-50 text-violet-900' : 'border-dashed border-violet-200 bg-white text-violet-600'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 rounded-xl p-2 ${note ? 'bg-white text-violet-600' : 'bg-violet-50 text-violet-500'}`}><NotebookPen size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold">Add note</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-900/35">{countWords(note || '')}/{NOTE_WORD_LIMIT} words</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-violet-900/55 line-clamp-2">{note ? note : 'Optional extra detail, tucked into a tidy little pop-up.'}</p>
        </div>
      </div>
    </button>
  );
}

function NoteModal({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const words = countWords(draft);
  const overLimit = words > NOTE_WORD_LIMIT;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="fixed inset-0 z-[80] bg-violet-950/40 px-3 py-6 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl space-y-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-serif italic font-bold">Add note</h3>
            <p className="text-sm text-violet-900/55">Keep it short and useful. Max {NOTE_WORD_LIMIT} words.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-violet-50 p-2 text-violet-600"><X size={18} /></button>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(truncateToWordLimit(event.target.value))}
          rows={5}
          className={`${inputClass} min-h-[140px] resize-none`}
          placeholder="Anything worth remembering?"
        />
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={`${overLimit ? 'text-rose-500' : 'text-violet-900/45'}`}>{words}/{NOTE_WORD_LIMIT} words</span>
          <span className="text-violet-900/35">Mobile-friendly little note nook.</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl bg-violet-50 py-3 font-bold text-violet-700">Cancel</button>
          <button type="button" disabled={overLimit} onClick={() => { onSave(draft); onClose(); }} className="rounded-2xl bg-violet-600 py-3 font-bold text-white disabled:opacity-40">Save note</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: string | number; icon: ReactNode; accent?: string }) {
  return (
    <Card className="p-4 min-h-[132px] bg-[#FCFBFF] border-[#ECE7FF]">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.24em] font-black text-violet-900/35">{label}</span>
          {accent ? <span className="text-[10px] uppercase tracking-[0.24em] font-black text-violet-400">{accent}</span> : <span />}
        </div>
        <div className="mt-4 text-[2rem] font-black leading-none text-violet-700">{value}</div>
        <div className="mt-auto flex justify-end pt-5 opacity-95">{icon}</div>
      </div>
    </Card>
  );
}

function MiniStat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return <div className={`rounded-2xl p-4 text-center ${highlight ? 'bg-white ring-1 ring-[#f6c85f]' : 'bg-violet-50'}`}><p className="text-[10px] uppercase tracking-widest text-violet-900/35 font-bold">{label}</p><p className={`mt-2 font-serif italic font-bold ${highlight ? 'text-violet-700 text-xl' : 'text-violet-700'}`}>{value}</p></div>;
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

function InlineSuccessSplash({ title, subtitle, icon }: { title: string; subtitle: string; icon: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 rounded-[32px] bg-[#F8F7FF]/94 flex items-center justify-center p-6 text-center">
      <div className="space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-white shadow-sm text-violet-600 flex items-center justify-center">{icon}</div>
        <div>
          <h3 className="text-xl font-serif italic font-bold text-violet-700">{title}</h3>
          <p className="text-sm text-violet-900/55">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function ImagePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const readFile = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        const MAX = 800;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!blob) throw new Error('Image conversion failed');
        const uploadedUrl = await uploadApi.image(blob, 'photo.jpg');
        onChange(uploadedUrl);
      } catch (error) {
        console.error(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
        setUploading(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setUploading(false);
    };
    img.src = objectUrl;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50 p-4 flex items-center justify-center min-h-28">
        {value ? <img src={value} alt="Preview" className="w-20 h-20 object-cover rounded-2xl" /> : <div className="text-center text-violet-400"><Camera size={22} className="mx-auto mb-2" /><span className="text-[10px] font-bold uppercase tracking-[0.2em]">{uploading ? 'Uploading…' : 'No photo yet'}</span></div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={uploading} onClick={() => libraryRef.current?.click()} className="py-3 rounded-2xl bg-white border border-violet-100 text-violet-700 font-bold text-sm disabled:opacity-60">Choose from library</button>
        <button type="button" disabled={uploading} onClick={() => cameraRef.current?.click()} className="py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm disabled:opacity-60">{uploading ? 'Uploading…' : 'Take photo'}</button>
      </div>
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => readFile(event.target.files?.[0])} />
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
