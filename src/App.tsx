import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bird,
  BookOpen,
  Calendar as CalendarIcon,
  Camera,
  Egg,
  LayoutDashboard,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  PoundSterling,
  RefreshCw,
  Stethoscope,
  Trash2,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { addDays, eachDayOfInterval, endOfMonth, format, isSameDay, parseISO, startOfMonth, subDays } from 'date-fns';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { authApi, dataApi, SessionUser } from './api';
import { CHICKEN_FACTS, CHICKEN_WIKI, DEFAULT_LOCATIONS } from './constants';
import { ChickBatch, EggLog, FeedLog, Hen, Location, MedicationLog, SaleLog } from './types';

type TabKey = 'dashboard' | 'log' | 'locations' | 'hens' | 'feed' | 'sales' | 'calendar' | 'wiki';

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

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [state, setState] = useState<AppState>(initialState);
  const [loadingData, setLoadingData] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

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
    const timer = window.setTimeout(() => setSaveMessage(''), 2500);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  const upsert = async <T extends { id: string }>(key: keyof AppState, collection: import('./api').CollectionName, item: T) => {
    const saved = await dataApi.upsert(collection as any, item as any);
    setState((current) => {
      const list = current[key] as { id: string }[];
      const next = list.some((entry) => entry.id === (saved as any).id)
        ? list.map((entry) => (entry.id === (saved as any).id ? (saved as any) : entry))
        : [saved as any, ...list];
      return { ...current, [key]: next } as AppState;
    });
    setSaveMessage('Saved. Nice.');
  };

  const remove = async (key: keyof AppState, collection: import('./api').CollectionName, id: string) => {
    await dataApi.remove(collection, id);
    setState((current) => ({
      ...current,
      [key]: (current[key] as { id: string }[]).filter((entry) => entry.id !== id),
    }) as AppState);
    setSaveMessage('Deleted. Ruthless.');
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const payload = authMode === 'register'
        ? await authApi.register(email, password)
        : await authApi.login(email, password);
      setUser(payload.user);
      setPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    setActiveTab('dashboard');
  };

  const generateDemoData = async () => {
    const locations = state.locations.length ? state.locations : DEFAULT_LOCATIONS;
    if (!state.locations.length) {
      for (const location of DEFAULT_LOCATIONS) {
        await upsert('locations', 'locations', location);
      }
    }

    for (let i = 21; i >= 0; i -= 1) {
      const date = subDays(new Date(), i).toISOString();
      for (const location of locations) {
        await upsert('eggLogs', 'eggLogs', {
          id: crypto.randomUUID(),
          date,
          count: 2 + Math.floor(Math.random() * 6),
          locationId: location.id,
        });
      }
      if (i % 4 === 0) {
        await upsert('saleLogs', 'saleLogs', {
          id: crypto.randomUUID(),
          date,
          quantity: 6 + Math.floor(Math.random() * 12),
          price: Number((2.5 + Math.random() * 4).toFixed(2)),
        });
      }
      if (i % 7 === 0) {
        await upsert('feedLogs', 'feedLogs', {
          id: crypto.randomUUID(),
          date,
          amount: 20,
          cost: Number((12 + Math.random() * 8).toFixed(2)),
          locationId: locations[0].id,
        });
      }
    }
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
            {authMode === 'login' ? "Need an account? Register" : 'Already registered? Sign in'}
          </button>
        </form>
      </AuthShell>
    );
  }

  const { locations, eggLogs, hens, feedLogs, medicationLogs, saleLogs, chickBatches } = state;

  return (
    <div className="min-h-screen bg-[#F8F7FF] text-violet-900 font-sans pb-24">
      <header className="bg-white border-b border-violet-100 p-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/35 font-bold">Signed in as</p>
            <h1 className="text-xl font-serif italic font-black tracking-tight">The Eggcountant</h1>
            <p className="text-xs text-violet-900/45 truncate max-w-[220px]">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={generateDemoData} className="px-3 py-2 rounded-2xl text-xs font-bold bg-violet-50 text-violet-600">Demo Data</button>
            <button onClick={handleLogout} className="p-3 rounded-2xl text-violet-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {saveMessage && <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-medium">{saveMessage}</div>}
        {authError && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-2xl text-sm font-medium">{authError}</div>}
        {loadingData ? (
          <Card><div className="py-10 text-center text-violet-500">Loading your flock books…</div></Card>
        ) : (
          <>
            {activeTab === 'dashboard' && <Dashboard eggLogs={eggLogs} saleLogs={saleLogs} feedLogs={feedLogs} locations={locations} />}
            {activeTab === 'log' && <EggLogger locations={locations} onSave={(item) => upsert('eggLogs', 'eggLogs', item)} />}
            {activeTab === 'locations' && <LocationManager locations={locations} onSave={(item) => upsert('locations', 'locations', item)} onDelete={(id) => remove('locations', 'locations', id)} />}
            {activeTab === 'hens' && <HenTracker hens={hens} locations={locations} chickBatches={chickBatches} onSaveHen={(item) => upsert('hens', 'hens', item)} onDeleteHen={(id) => remove('hens', 'hens', id)} onSaveBatch={(item) => upsert('chickBatches', 'chickBatches', item)} onDeleteBatch={(id) => remove('chickBatches', 'chickBatches', id)} />}
            {activeTab === 'feed' && <FeedAndMedTracker locations={locations} hens={hens} feedLogs={feedLogs} medicationLogs={medicationLogs} onSaveFeed={(item) => upsert('feedLogs', 'feedLogs', item)} onSaveMedication={(item) => upsert('medicationLogs', 'medicationLogs', item)} />}
            {activeTab === 'sales' && <SalesTracker saleLogs={saleLogs} onSave={(item) => upsert('saleLogs', 'saleLogs', item)} />}
            {activeTab === 'calendar' && <CalendarView eggLogs={eggLogs} saleLogs={saleLogs} feedLogs={feedLogs} />}
            {activeTab === 'wiki' && <ChickenWiki />}
          </>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-violet-100 px-2 py-3 z-20 shadow-[0_-4px_20px_rgba(124,58,237,0.05)]">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <NavButton icon={<LayoutDashboard size={22} />} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<Egg size={22} />} label="Log" active={activeTab === 'log'} onClick={() => setActiveTab('log')} />
          <NavButton icon={<Bird size={22} />} label="Hens" active={activeTab === 'hens'} onClick={() => setActiveTab('hens')} />
          <NavButton icon={<Utensils size={22} />} label="Feed" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
          <NavButton icon={<PoundSterling size={22} />} label="Sales" active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
          <NavButton icon={<MapPin size={22} />} label="Coops" active={activeTab === 'locations'} onClick={() => setActiveTab('locations')} />
          <NavButton icon={<CalendarIcon size={22} />} label="Dates" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
          <NavButton icon={<BookOpen size={22} />} label="Wiki" active={activeTab === 'wiki'} onClick={() => setActiveTab('wiki')} />
        </div>
      </nav>
    </div>
  );
}

function Dashboard({ eggLogs, saleLogs, feedLogs, locations }: { eggLogs: EggLog[]; saleLogs: SaleLog[]; feedLogs: FeedLog[]; locations: Location[] }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEggs = eggLogs.filter((log) => log.date.startsWith(today)).reduce((sum, log) => sum + log.count, 0);
  const totalEggs = eggLogs.reduce((sum, log) => sum + log.count, 0);
  const totalSold = saleLogs.reduce((sum, log) => sum + log.quantity, 0);
  const revenue = saleLogs.reduce((sum, log) => sum + log.price, 0);
  const costs = feedLogs.reduce((sum, log) => sum + log.cost, 0);

  const chartData = Array.from({ length: 14 }).map((_, index) => {
    const day = subDays(new Date(), 13 - index);
    const key = format(day, 'yyyy-MM-dd');
    const eggs = eggLogs.filter((log) => log.date.startsWith(key)).reduce((sum, log) => sum + log.count, 0);
    return { day: format(day, 'MMM d'), eggs };
  });

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Today's lay" value={todayEggs} icon={<Egg size={20} className="text-violet-500" />} />
        <StatCard label="Total eggs" value={totalEggs} icon={<Bird size={20} className="text-violet-500" />} />
        <StatCard label="Sold" value={totalSold} icon={<PoundSterling size={20} className="text-violet-500" />} />
        <StatCard label="Profit-ish" value={`£${(revenue - costs).toFixed(2)}`} icon={<TrendingUp size={20} className="text-violet-500" />} />
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

      <Card>
        <h3 className="text-lg font-serif italic mb-4">Production by coop</h3>
        <div className="space-y-4">
          {locations.length === 0 ? <EmptyState icon={<MapPin size={22} />} text="No coops yet. Add one and the numbers get more interesting." /> : locations.map((location) => {
            const eggs = eggLogs.filter((log) => log.locationId === location.id).reduce((sum, log) => sum + log.count, 0);
            const percentage = totalEggs ? (eggs / totalEggs) * 100 : 0;
            return (
              <div key={location.id} className="space-y-1">
                <div className="flex justify-between text-sm font-medium">
                  <span>{location.name}</span>
                  <span>{eggs} eggs</span>
                </div>
                <div className="h-2 bg-violet-50 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} className="h-full bg-violet-600 rounded-full" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function EggLogger({ locations, onSave }: { locations: Location[]; onSave: (item: EggLog) => Promise<void> }) {
  const [count, setCount] = useState(0);
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  useEffect(() => {
    if (!locationId && locations[0]) setLocationId(locations[0].id);
  }, [locationId, locations]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-center space-y-5">
          <div>
            <h2 className="text-3xl font-serif italic font-bold">Log the haul</h2>
            <p className="text-sm text-violet-900/50">How many eggs turned up today?</p>
          </div>
          <div className="flex items-center justify-center gap-8">
            <button onClick={() => setCount(Math.max(0, count - 1))} className="w-14 h-14 rounded-full border-2 border-violet-100 text-2xl text-violet-400">-</button>
            <div className="text-7xl font-serif italic font-bold w-24 text-center">{count}</div>
            <button onClick={() => setCount(count + 1)} className="w-14 h-14 rounded-full bg-violet-600 text-white text-2xl">+</button>
          </div>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
          <Field label="Location">
            <div className="grid grid-cols-2 gap-3">
              {locations.map((location) => (
                <button key={location.id} type="button" onClick={() => setLocationId(location.id)} className={`p-4 rounded-2xl border-2 text-sm font-medium ${locationId === location.id ? 'border-violet-600 bg-violet-50 text-violet-600' : 'border-violet-100 bg-white text-violet-900/60'}`}>
                  {location.name}
                </button>
              ))}
            </div>
          </Field>
          <button
            disabled={!locationId || count === 0}
            onClick={async () => {
              await onSave({ id: crypto.randomUUID(), count, locationId, date: new Date(date).toISOString() });
              setCount(0);
            }}
            className="w-full py-4 bg-violet-600 text-white rounded-3xl font-bold disabled:opacity-40"
          >
            Save collection
          </button>
        </div>
      </Card>
    </div>
  );
}

function LocationManager({ locations, onSave, onDelete }: { locations: Location[]; onSave: (item: Location) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Location['type']>('Garden');
  const [photoUrl, setPhotoUrl] = useState('');

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-serif italic font-bold">Your coops</h2>
            <Plus size={20} className="text-violet-400" />
          </div>
          <Field label="Coop name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Cluckingham Palace" /></Field>
          <Field label="Type">
            <div className="flex gap-2">{(['Garden', 'Allotment'] as const).map((option) => <button key={option} type="button" onClick={() => setType(option)} className={`flex-1 py-3 rounded-xl border-2 ${type === option ? 'border-violet-600 bg-violet-50 text-violet-600' : 'border-transparent bg-violet-50 text-violet-500'}`}>{option}</button>)}</div>
          </Field>
          <Field label="Photo (optional)"><ImagePicker value={photoUrl} onChange={setPhotoUrl} /></Field>
          <button onClick={async () => {
            if (!name.trim()) return;
            await onSave({ id: crypto.randomUUID(), name: name.trim(), type, photoUrl: photoUrl || undefined });
            setName('');
            setPhotoUrl('');
          }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Add location</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {locations.map((location) => (
          <Card key={location.id} className="p-4">
            <div className="relative group text-center">
              <button onClick={() => onDelete(location.id)} className="absolute top-0 right-0 p-2 text-rose-500 opacity-70"><Trash2 size={14} /></button>
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

function HenTracker({ hens, locations, chickBatches, onSaveHen, onDeleteHen, onSaveBatch, onDeleteBatch }: { hens: Hen[]; locations: Location[]; chickBatches: ChickBatch[]; onSaveHen: (item: Hen) => Promise<void>; onDeleteHen: (id: string) => Promise<void>; onSaveBatch: (item: ChickBatch) => Promise<void>; onDeleteBatch: (id: string) => Promise<void> }) {
  const [mode, setMode] = useState<'flock' | 'chicks'>('flock');
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [photoUrl, setPhotoUrl] = useState('');
  const [status, setStatus] = useState<Hen['status']>('Healthy');
  const [batchCount, setBatchCount] = useState('');
  const [batchLocationId, setBatchLocationId] = useState(locations[0]?.id || '');
  const [batchDate, setBatchDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  return (
    <div className="space-y-4">
      <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
        <button onClick={() => setMode('flock')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'flock' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Flock</button>
        <button onClick={() => setMode('chicks')} className={`flex-1 py-3 rounded-xl text-sm font-bold ${mode === 'chicks' ? 'bg-violet-600 text-white' : 'text-violet-900/40'}`}>Chicks</button>
      </div>

      {mode === 'flock' ? (
        <>
          <Card>
            <div className="space-y-4">
              <h2 className="text-2xl font-serif italic font-bold">Add a hen</h2>
              <Field label="Hen name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Henrietta" /></Field>
              <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value as Hen['status'])} className={inputClass}>{['Healthy', 'Sick', 'Recovering'].map((option) => <option key={option}>{option}</option>)}</select></Field>
              <Field label="Location"><select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
              <Field label="Photo (optional)"><ImagePicker value={photoUrl} onChange={setPhotoUrl} /></Field>
              <button onClick={async () => {
                if (!name.trim() || !locationId) return;
                await onSaveHen({ id: crypto.randomUUID(), name: name.trim(), locationId, status, photoUrl: photoUrl || undefined });
                setName('');
                setPhotoUrl('');
                setStatus('Healthy');
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Add hen</button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {hens.length === 0 ? <div className="col-span-2"><Card><EmptyState icon={<Bird size={22} />} text="No hens yet. Bit suspicious, honestly." /></Card></div> : hens.map((hen) => (
              <Card key={hen.id} className="p-3">
                <div className="relative">
                  <button onClick={() => onDeleteHen(hen.id)} className="absolute top-0 right-0 p-1.5 bg-white/80 text-rose-500 rounded-lg"><Trash2 size={12} /></button>
                  <div className="aspect-square rounded-2xl overflow-hidden bg-violet-50 mb-3 flex items-center justify-center">
                    {hen.photoUrl ? <img src={hen.photoUrl} className="w-full h-full object-cover" /> : <Bird className="text-violet-300" />}
                  </div>
                  <p className="font-bold text-sm">{hen.name}</p>
                  <p className="text-[10px] uppercase tracking-widest text-violet-900/40 font-bold">{locations.find((location) => location.id === hen.locationId)?.name}</p>
                  <div className={`mt-2 inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${hen.status === 'Healthy' ? 'bg-emerald-50 text-emerald-700' : hen.status === 'Sick' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{hen.status}</div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <Card>
            <div className="space-y-4">
              <h2 className="text-2xl font-serif italic font-bold">Start a chick batch</h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Egg count"><input value={batchCount} onChange={(e) => setBatchCount(e.target.value)} type="number" className={inputClass} /></Field>
                <Field label="Start date"><input value={batchDate} onChange={(e) => setBatchDate(e.target.value)} type="date" className={inputClass} /></Field>
              </div>
              <Field label="Location"><select value={batchLocationId} onChange={(e) => setBatchLocationId(e.target.value)} className={inputClass}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
              <button onClick={async () => {
                if (!batchCount || !batchLocationId) return;
                const started = new Date(batchDate);
                await onSaveBatch({ id: crypto.randomUUID(), count: Number(batchCount), dateStarted: started.toISOString(), expectedHatchDate: addDays(started, 21).toISOString(), locationId: batchLocationId, status: 'Incubating', chicks: [], hatchedCount: 0, perishedCount: 0 });
                setBatchCount('');
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Start incubation</button>
            </div>
          </Card>

          <div className="space-y-3">
            {chickBatches.length === 0 ? <Card><EmptyState icon={<Egg size={22} />} text="No chick batches yet." /></Card> : chickBatches.map((batch) => (
              <Card key={batch.id}>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <p className="font-bold text-lg">{batch.count} eggs</p>
                    <p className="text-xs text-violet-900/45">Expected hatch: {format(new Date(batch.expectedHatchDate), 'd MMM yyyy')}</p>
                    <p className="text-[10px] mt-2 uppercase tracking-widest text-violet-600 font-bold">{batch.status}</p>
                  </div>
                  <button onClick={() => onDeleteBatch(batch.id)} className="p-2 text-rose-500"><Trash2 size={16} /></button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FeedAndMedTracker({ locations, hens, feedLogs, medicationLogs, onSaveFeed, onSaveMedication }: { locations: Location[]; hens: Hen[]; feedLogs: FeedLog[]; medicationLogs: MedicationLog[]; onSaveFeed: (item: FeedLog) => Promise<void>; onSaveMedication: (item: MedicationLog) => Promise<void> }) {
  const [mode, setMode] = useState<'feed' | 'med'>('feed');
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [feedLocationId, setFeedLocationId] = useState(locations[0]?.id || '');
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [medHenId, setMedHenId] = useState('');
  const [medLocationId, setMedLocationId] = useState(locations[0]?.id || '');

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
              <div className="grid grid-cols-2 gap-4">
                <Field label="Amount (kg)"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></Field>
                <Field label="Cost (£)"><input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} /></Field>
              </div>
              <Field label="Location"><select value={feedLocationId} onChange={(e) => setFeedLocationId(e.target.value)} className={inputClass}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
              <button onClick={async () => {
                if (!amount || !cost || !feedLocationId) return;
                await onSaveFeed({ id: crypto.randomUUID(), date: new Date().toISOString(), amount: Number(amount), cost: Number(cost), locationId: feedLocationId });
                setAmount('');
                setCost('');
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Log feed purchase</button>
            </div>
          </Card>
          <div className="space-y-3">{feedLogs.map((log) => <Card key={log.id}><div className="flex justify-between"><div><p className="font-bold">{log.amount}kg feed</p><p className="text-xs text-violet-900/45">{format(parseISO(log.date), 'd MMM yyyy')}</p></div><div className="text-right"><p className="font-serif italic font-bold">£{log.cost.toFixed(2)}</p><p className="text-[10px] uppercase tracking-widest text-violet-900/35">{locations.find((location) => location.id === log.locationId)?.name}</p></div></div></Card>)}</div>
        </>
      ) : (
        <>
          <Card>
            <div className="space-y-4">
              <Field label="Medication"><input value={medicationName} onChange={(e) => setMedicationName(e.target.value)} className={inputClass} /></Field>
              <Field label="Dosage"><input value={dosage} onChange={(e) => setDosage(e.target.value)} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Hen (optional)"><select value={medHenId} onChange={(e) => setMedHenId(e.target.value)} className={inputClass}><option value="">Whole flock</option>{hens.map((hen) => <option key={hen.id} value={hen.id}>{hen.name}</option>)}</select></Field>
                <Field label="Location"><select value={medLocationId} onChange={(e) => setMedLocationId(e.target.value)} className={inputClass}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
              </div>
              <button onClick={async () => {
                if (!medicationName || !dosage || !medLocationId) return;
                await onSaveMedication({ id: crypto.randomUUID(), date: new Date().toISOString(), medicationName, dosage, locationId: medLocationId, henId: medHenId || undefined });
                setMedicationName('');
                setDosage('');
                setMedHenId('');
              }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Log medication</button>
            </div>
          </Card>
          <div className="space-y-3">{medicationLogs.map((log) => <Card key={log.id}><div className="flex justify-between"><div><p className="font-bold">{log.medicationName}</p><p className="text-xs text-violet-900/45">{log.dosage} • {format(parseISO(log.date), 'd MMM yyyy')}</p></div><div className="text-right text-[10px] uppercase tracking-widest text-violet-900/35 font-bold"><p>{log.henId ? hens.find((hen) => hen.id === log.henId)?.name : 'Whole flock'}</p><p>{locations.find((location) => location.id === log.locationId)?.name}</p></div></div></Card>)}</div>
        </>
      )}
    </div>
  );
}

function SalesTracker({ saleLogs, onSave }: { saleLogs: SaleLog[]; onSave: (item: SaleLog) => Promise<void> }) {
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <h2 className="text-2xl font-serif italic font-bold">Record a sale</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity"><input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} /></Field>
            <Field label="Price (£)"><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} /></Field>
          </div>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
          <button onClick={async () => {
            if (!quantity || !price) return;
            await onSave({ id: crypto.randomUUID(), quantity: Number(quantity), price: Number(price), date: new Date(date).toISOString() });
            setQuantity('');
            setPrice('');
          }} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold">Log sale</button>
        </div>
      </Card>
      <div className="space-y-3">{saleLogs.map((log) => <Card key={log.id}><div className="flex justify-between"><div><p className="font-bold">{log.quantity} eggs sold</p><p className="text-xs text-violet-900/45">{format(parseISO(log.date), 'd MMM yyyy')}</p></div><div className="font-serif italic font-bold text-violet-600">£{log.price.toFixed(2)}</div></div></Card>)}</div>
    </div>
  );
}

function CalendarView({ eggLogs, saleLogs, feedLogs }: { eggLogs: EggLog[]; saleLogs: SaleLog[]; feedLogs: FeedLog[] }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) }), [selectedDate]);
  const selectedKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedEggs = eggLogs.filter((log) => log.date.startsWith(selectedKey)).reduce((sum, log) => sum + log.count, 0);
  const selectedSales = saleLogs.filter((log) => log.date.startsWith(selectedKey)).reduce((sum, log) => sum + log.price, 0);
  const selectedFeed = feedLogs.filter((log) => log.date.startsWith(selectedKey)).reduce((sum, log) => sum + log.cost, 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-serif italic font-bold">{format(selectedDate, 'MMMM yyyy')}</h2>
          <button onClick={() => setSelectedDate(new Date())} className="px-3 py-2 rounded-xl bg-violet-50 text-violet-600 text-xs font-bold">Today</button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center mb-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => <div key={day} className="text-[10px] uppercase tracking-widest text-violet-900/35 font-bold">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: (new Date(days[0]).getDay() + 6) % 7 }).map((_, index) => <div key={`gap-${index}`} />)}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const eggs = eggLogs.filter((log) => log.date.startsWith(key)).reduce((sum, log) => sum + log.count, 0);
            const isSelected = isSameDay(day, selectedDate);
            return (
              <button key={day.toISOString()} onClick={() => setSelectedDate(day)} className={`aspect-square rounded-2xl border ${isSelected ? 'bg-violet-600 text-white border-violet-600' : 'bg-white border-violet-100'} flex flex-col items-center justify-center`}>
                <span className="text-xs font-serif italic">{format(day, 'd')}</span>
                {eggs > 0 && <span className="text-[10px] font-bold">{eggs}</span>}
              </button>
            );
          })}
        </div>
      </Card>
      <Card>
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-violet-900/35 font-bold">Selected day</p>
            <h3 className="text-xl font-serif italic font-bold">{format(selectedDate, 'EEEE d MMMM')}</h3>
          </div>
          <CalendarIcon className="text-violet-400" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <MiniStat label="Eggs" value={selectedEggs} />
          <MiniStat label="Sales" value={`£${selectedSales.toFixed(2)}`} />
          <MiniStat label="Feed" value={`£${selectedFeed.toFixed(2)}`} />
        </div>
      </Card>
    </div>
  );
}

function ChickenWiki() {
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * CHICKEN_FACTS.length));
  return (
    <div className="space-y-4">
      <Card className="bg-violet-600 text-white border-violet-600">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-70 font-bold">Chicken fact</p>
            <button onClick={() => setFactIndex(Math.floor(Math.random() * CHICKEN_FACTS.length))} className="px-3 py-2 rounded-xl bg-white/15 text-xs font-bold">Another one</button>
          </div>
          <p className="text-lg font-serif italic leading-relaxed">“{CHICKEN_FACTS[factIndex]}”</p>
        </div>
      </Card>
      {CHICKEN_WIKI.map((article) => <Card key={article.id}><div className="space-y-2"><div className="flex justify-between items-start gap-3"><h3 className="font-bold text-lg">{article.title}</h3><span className="text-[10px] uppercase tracking-widest bg-violet-50 text-violet-600 px-2 py-1 rounded-full font-bold">{article.category}</span></div><p className="text-sm text-violet-900/70 leading-relaxed">{article.content}</p></div></Card>)}
    </div>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-violet-50 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] aspect-square bg-violet-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] aspect-square bg-violet-300/20 rounded-full blur-3xl" />
      <div className="w-full max-w-md bg-white p-10 rounded-[48px] shadow-2xl shadow-violet-900/10 relative z-10 border border-white">{children}</div>
    </div>
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
  return <Card className="p-4 h-28"><div className="flex justify-between items-start"><span className="text-[10px] uppercase tracking-widest font-bold text-violet-900/40">{label}</span><div className="p-2 bg-violet-50 rounded-lg">{icon}</div></div><div className="text-2xl font-serif italic font-bold mt-6">{value}</div></Card>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="bg-violet-50 rounded-2xl p-4 text-center"><p className="text-[10px] uppercase tracking-widest text-violet-900/35 font-bold">{label}</p><p className="mt-2 font-serif italic font-bold text-violet-700">{value}</p></div>;
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

const inputClass = 'w-full p-4 bg-violet-50 rounded-2xl border-2 border-transparent focus:border-violet-300 focus:outline-none';
