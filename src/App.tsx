/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, ReactNode, Dispatch, SetStateAction, Component, ErrorInfo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Egg, 
  MapPin, 
  Bird, 
  Utensils, 
  Stethoscope, 
  PoundSterling, 
  BookOpen, 
  Plus, 
  ChevronRight,
  History,
  LogOut,
  LogIn,
  Calendar as CalendarIcon,
  Pencil,
  Hash,
  TrendingUp,
  Camera,
  Trash2,
  Clock,
  RefreshCw
} from 'lucide-react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  addWeeks, 
  subWeeks, 
  startOfMonth, 
  endOfMonth, 
  isSameMonth, 
  addMonths, 
  subMonths,
  getDay,
  parseISO,
  subDays,
  startOfToday,
  eachWeekOfInterval,
  isWithinInterval
} from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { Location, EggLog, Hen, FeedLog, MedicationLog, SaleLog, ChickBatch, Chick } from './types';
import { DEFAULT_LOCATIONS, CHICKEN_WIKI } from './constants';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const state = (this as any).state;
    const props = (this as any).props;
    if (state.hasError) {
      let message = "Something went wrong.";
      if (state.error && state.error.message) {
        try {
          const parsed = JSON.parse(state.error.message);
          if (parsed.error) message = `Firestore Error: ${parsed.error}`;
        } catch (e) {
          message = state.error.message;
        }
      }

      return (
        <div className="min-h-screen bg-violet-50 flex items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-[32px] shadow-xl border border-red-100 max-w-sm space-y-4">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <Stethoscope size={32} />
            </div>
            <h2 className="text-xl font-serif italic font-bold text-violet-900">Oops!</h2>
            <p className="text-sm text-violet-900/60">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-violet-600 text-white rounded-2xl font-bold"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showLanding, setShowLanding] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState('');

  const [locations, setLocations] = useState<Location[]>([]);
  const [eggLogs, setEggLogs] = useState<EggLog[]>([]);
  const [hens, setHens] = useState<Hen[]>([]);
  const [feedLogs, setFeedLogs] = useState<FeedLog[]>([]);
  const [medLogs, setMedLogs] = useState<MedicationLog[]>([]);
  const [saleLogs, setSaleLogs] = useState<SaleLog[]>([]);
  const [chickBatches, setChickBatches] = useState<ChickBatch[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      
      // Check if landing page should be shown
      const hasSeenLanding = localStorage.getItem('hasSeenLanding');
      if (!hasSeenLanding && u) {
        setShowLanding(true);
      }
    });
    return unsubscribe;
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!user) return;

    const unsubLocations = onSnapshot(collection(db, `users/${user.uid}/locations`), 
      (snap) => setLocations(snap.docs.map(d => d.data() as Location)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/locations`)
    );

    const unsubEggLogs = onSnapshot(query(collection(db, `users/${user.uid}/eggLogs`), orderBy('date', 'desc')), 
      (snap) => setEggLogs(snap.docs.map(d => d.data() as EggLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/eggLogs`)
    );

    const unsubHens = onSnapshot(collection(db, `users/${user.uid}/hens`), 
      (snap) => setHens(snap.docs.map(d => d.data() as Hen)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/hens`)
    );

    const unsubFeed = onSnapshot(query(collection(db, `users/${user.uid}/feedLogs`), orderBy('date', 'desc')), 
      (snap) => setFeedLogs(snap.docs.map(d => d.data() as FeedLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/feedLogs`)
    );

    const unsubMed = onSnapshot(query(collection(db, `users/${user.uid}/medicationLogs`), orderBy('date', 'desc')), 
      (snap) => setMedLogs(snap.docs.map(d => d.data() as MedicationLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/medicationLogs`)
    );

    const unsubSales = onSnapshot(query(collection(db, `users/${user.uid}/saleLogs`), orderBy('date', 'desc')), 
      (snap) => setSaleLogs(snap.docs.map(d => d.data() as SaleLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/saleLogs`)
    );

    const unsubChicks = onSnapshot(query(collection(db, `users/${user.uid}/chickBatches`), orderBy('dateStarted', 'desc')), 
      (snap) => setChickBatches(snap.docs.map(d => d.data() as ChickBatch)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/chickBatches`)
    );

    return () => {
      unsubLocations();
      unsubEggLogs();
      unsubHens();
      unsubFeed();
      unsubMed();
      unsubSales();
      unsubChicks();
    };
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
      } else if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth failed", error);
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const bootstrapUsers = async () => {
    setBootstrapStatus('Starting bootstrap...');
    const users = [
      { email: 'russparks@me.com', pass: 'Pa55word*' },
      { email: 'Imagiraffe@hotmail.com', pass: 'Pa55word*' }
    ];

    for (const u of users) {
      try {
        setBootstrapStatus(`Creating ${u.email}...`);
        await createUserWithEmailAndPassword(auth, u.email, u.pass);
        await signOut(auth); // Sign out so we can create the next one
        setBootstrapStatus(`Created ${u.email} successfully.`);
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          setBootstrapStatus(`${u.email} already exists.`);
        } else {
          setBootstrapStatus(`Error creating ${u.email}: ${err.message}`);
          break;
        }
      }
    }
    setTimeout(() => setBootstrapStatus(''), 5000);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const addEggLog = async (count: number, locationId: string, date: string) => {
    if (!user) return;
    const id = crypto.randomUUID();
    const path = `users/${user.uid}/eggLogs/${id}`;
    const newLog: EggLog = {
      id,
      date,
      count,
      locationId
    };
    try {
      await setDoc(doc(db, path), newLog);
      setActiveTab('dashboard');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const addSaleLog = async (quantity: number, price: number) => {
    if (!user) return;
    const id = crypto.randomUUID();
    const path = `users/${user.uid}/saleLogs/${id}`;
    const newSale: SaleLog = {
      id,
      date: new Date().toISOString(),
      quantity,
      price
    };
    try {
      await setDoc(doc(db, path), newSale);
      setActiveTab('dashboard');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const generateFakeData = async () => {
    if (!user) return;
    
    let currentLocations = locations;
    if (currentLocations.length === 0) {
      // Create default locations first
      for (const loc of DEFAULT_LOCATIONS) {
        await setDoc(doc(db, `users/${user.uid}/locations/${loc.id}`), loc);
      }
      currentLocations = DEFAULT_LOCATIONS;
    }
    
    const now = new Date();
    
    // Generate 60 days of data
    for (let i = 60; i >= 0; i--) {
      const date = subDays(now, i);
      const dateStr = date.toISOString();
      
      // Egg Logs
      // Scaling: 3-7 eggs per location per day, starting slower and increasing in the last 2 weeks
      const isLastTwoWeeks = i <= 14;
      
      for (const loc of currentLocations) {
        const baseMin = isLastTwoWeeks ? 4 : 1;
        const baseMax = isLastTwoWeeks ? 7 : 4;
        const count = Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;
        
        const eggId = crypto.randomUUID();
        await setDoc(doc(db, `users/${user.uid}/eggLogs/${eggId}`), {
          id: eggId,
          date: dateStr,
          count,
          locationId: loc.id
        });
      }
      
      // Feed Logs (roughly once a week per location)
      if (i % 7 === 0) {
        for (const loc of currentLocations) {
          const feedId = crypto.randomUUID();
          await setDoc(doc(db, `users/${user.uid}/feedLogs/${feedId}`), {
            id: feedId,
            date: dateStr,
            amount: 20,
            cost: 15.50,
            locationId: loc.id
          });
        }
      }
      
      // Sales Logs (roughly every 3 days)
      if (i % 3 === 0) {
        const saleId = crypto.randomUUID();
        const quantity = Math.floor(Math.random() * 12) + 6;
        const price = (quantity / 6) * 2.50; // £2.50 per half dozen
        await setDoc(doc(db, `users/${user.uid}/saleLogs/${saleId}`), {
          id: saleId,
          date: dateStr,
          quantity,
          price
        });
      }
      
      // Med Logs (occasional)
      if (i % 20 === 0) {
        const medId = crypto.randomUUID();
        await setDoc(doc(db, `users/${user.uid}/medicationLogs/${medId}`), {
          id: medId,
          date: dateStr,
          medicationName: 'Wormer',
          dosage: '1 scoop',
          locationId: currentLocations[0].id
        });
      }
    }
    alert('Fake data generated for the last 60 days!');
  };

  // Expose to window for the dashboard button
  useEffect(() => {
    (window as any).generateFakeData = generateFakeData;
  }, [user, locations]);

  if (showLanding) {
    return (
      <LandingPage onEnter={() => {
        setShowLanding(false);
        localStorage.setItem('hasSeenLanding', 'true');
      }} />
    );
  }

  const updateLocations = async (newLocations: Location[]) => {
    if (!user) return;
    // This is a bit simplified, usually we'd add/remove individually
    // For now, let's just handle the add/remove in the components and call Firestore there
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-violet-50 flex items-center justify-center">
        <div className="animate-pulse text-violet-600 font-serif italic text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-violet-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] aspect-square bg-violet-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] aspect-square bg-violet-300/20 rounded-full blur-3xl" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-10 rounded-[48px] shadow-2xl shadow-violet-900/10 relative z-10 border border-white"
        >
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-24 h-24 bg-violet-600 rounded-[32px] flex items-center justify-center shadow-xl shadow-violet-200 rotate-3">
              <Egg size={48} className="text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-serif italic font-bold text-violet-900">The Eggcountant</h1>
              <p className="text-violet-900/40 font-medium uppercase tracking-[0.2em] text-[10px] mt-2">Flock Management & Yield Tracking</p>
            </div>

            <form onSubmit={handleAuth} className="w-full space-y-4">
              <div className="space-y-2 text-left">
                <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40 px-2">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cluck@palace.com"
                  required
                  className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600 transition-all"
                />
              </div>
              
              {!isForgotPassword && (
                <div className="space-y-2 text-left">
                  <div className="flex justify-between items-center px-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Password</label>
                    <button 
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-[10px] font-bold text-violet-600 uppercase tracking-wider hover:underline"
                    >
                      Forgot?
                    </button>
                  </div>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600 transition-all"
                  />
                </div>
              )}

              {authError && (
                <p className="text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-xl">{authError}</p>
              )}

              {resetSent && (
                <p className="text-emerald-600 text-xs font-bold bg-emerald-50 p-3 rounded-xl">
                  Reset link sent to your email!
                </p>
              )}

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full py-5 bg-violet-600 text-white rounded-3xl font-bold text-lg shadow-xl shadow-violet-200 hover:bg-violet-700 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {authLoading ? (
                  <RefreshCw size={20} className="animate-spin" />
                ) : (
                  isForgotPassword ? 'Send Reset Link' : (isSignUp ? 'Create Account' : 'Sign In')
                )}
              </button>
            </form>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setIsForgotPassword(false);
                  setResetSent(false);
                  setAuthError('');
                }}
                className="text-violet-600 font-bold text-sm hover:underline"
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
              
              {isForgotPassword && (
                <button 
                  onClick={() => {
                    setIsForgotPassword(false);
                    setResetSent(false);
                    setAuthError('');
                  }}
                  className="text-violet-400 font-bold text-xs uppercase tracking-widest hover:text-violet-600 transition-colors"
                >
                  Back to Login
                </button>
              )}

              <div className="mt-6 pt-6 border-t border-violet-50">
                <button 
                  onClick={bootstrapUsers}
                  className="text-[10px] font-bold text-violet-300 uppercase tracking-[0.2em] hover:text-violet-600 transition-colors"
                >
                  Bootstrap Test Accounts
                </button>
                {bootstrapStatus && (
                  <p className="mt-2 text-[10px] text-violet-500 font-medium italic">{bootstrapStatus}</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
        
        <p className="mt-8 text-violet-900/30 text-[10px] font-bold uppercase tracking-widest">© 2024 Cluckingham Palace Records</p>
      </div>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard eggLogs={eggLogs} saleLogs={saleLogs} feedLogs={feedLogs} locations={locations} />;
      case 'log':
        return <EggLogger locations={locations} onLog={addEggLog} />;
      case 'locations':
        return <LocationManager locations={locations} user={user} />;
      case 'hens':
        return <HenTracker hens={hens} locations={locations} user={user} chickBatches={chickBatches} />;
      case 'feed':
        return <FeedMedTracker feedLogs={feedLogs} medLogs={medLogs} locations={locations} hens={hens} user={user} />;
      case 'sales':
        return <SalesTracker saleLogs={saleLogs} onLog={addSaleLog} />;
      case 'wiki':
        return <ChickenWiki />;
      case 'calendar':
        return <CalendarView eggLogs={eggLogs} feedLogs={feedLogs} saleLogs={saleLogs} />;
      default:
        return <Dashboard eggLogs={eggLogs} saleLogs={saleLogs} feedLogs={feedLogs} locations={locations} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FF] text-violet-900 font-sans pb-20 relative overflow-x-hidden">
      {/* Background Line Art */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0">
        <div className="absolute top-20 left-10 rotate-12 text-violet-900">
          <Bird size={120} />
        </div>
        <div className="absolute top-1/3 right-[-20px] -rotate-12 text-violet-900">
          <Egg size={100} />
        </div>
        <div className="absolute bottom-1/4 left-[-30px] rotate-45 text-violet-900">
          <Bird size={150} />
        </div>
        <div className="absolute bottom-10 right-10 -rotate-6 text-violet-900">
          <Utensils size={80} />
        </div>
      </div>

      {/* Header */}
      <header className="bg-white border-b border-violet-100 p-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveTab('log')}
              className="w-10 h-10 bg-violet-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200 rotate-3 active:scale-95 transition-transform"
            >
              <Egg size={24} />
            </button>
            <div>
              <h1 className="text-xl font-serif italic font-black tracking-tight text-violet-900 leading-none">The Eggcountant</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HeaderAction icon={<Utensils size={18} />} active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
            <HeaderAction icon={<PoundSterling size={18} />} active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} />
            <button 
              onClick={() => setShowLogoutConfirm(true)} 
              className="text-violet-300 hover:text-red-500 p-2 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-violet-900/20 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-6 rounded-[32px] shadow-2xl border border-violet-100 max-w-xs w-full space-y-4"
            >
              <h3 className="text-lg font-serif italic font-bold text-center">Leaving the coop?</h3>
              <p className="text-sm text-center text-violet-900/60">Are you sure you want to log out of your account?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 bg-violet-50 text-violet-600 rounded-2xl font-bold text-sm"
                >
                  Stay
                </button>
                <button 
                  onClick={handleLogout}
                  className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold text-sm"
                >
                  Log Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="max-w-md mx-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-violet-100 px-2 py-3 z-20 shadow-[0_-4px_20px_rgba(124,58,237,0.05)]">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <NavButton icon={<LayoutDashboard size={24} />} label="Home" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavButton icon={<CalendarIcon size={24} />} label="Calendar" active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
          <NavButton icon={<Bird size={24} />} label="Hens" active={activeTab === 'hens'} onClick={() => setActiveTab('hens')} />
          <NavButton icon={<BookOpen size={24} />} label="Wiki" active={activeTab === 'wiki'} onClick={() => setActiveTab('wiki')} />
          <NavButton icon={<MapPin size={24} />} label="Coops" active={activeTab === 'locations'} onClick={() => setActiveTab('locations')} />
        </div>
      </nav>
    </div>
  );
}

function HeaderAction({ icon, active, onClick }: { icon: ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 rounded-xl transition-all ${
        active ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-400 hover:bg-violet-50'
      }`}
    >
      {icon}
    </button>
  );
}


function NavButton({ icon, label, active, onClick }: { icon: ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
        active ? 'text-violet-600' : 'text-violet-300'
      }`}
    >
      <div className={`p-1 rounded-lg transition-colors ${active ? 'bg-violet-50' : ''}`}>
        {icon}
      </div>
      <span className="text-[9px] mt-1 font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

// --- Landing Page Component ---
function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen bg-violet-600 flex flex-col items-center justify-center p-6 text-center overflow-hidden relative">
      {/* Animated background elements */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          rotate: [0, 90, 0],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute -top-20 -left-20 w-96 h-96 bg-white rounded-full blur-3xl"
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.3, 1],
          rotate: [0, -90, 0],
          opacity: [0.1, 0.15, 0.1]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute -bottom-20 -right-20 w-96 h-96 bg-violet-400 rounded-full blur-3xl"
      />

      <div className="relative z-10 space-y-12 max-w-sm">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-6"
        >
          <div className="w-32 h-32 bg-white text-violet-600 rounded-[40px] flex items-center justify-center mx-auto shadow-2xl rotate-3">
            <Egg size={64} />
          </div>
          <div className="space-y-2">
            <h1 className="text-5xl font-serif italic font-black tracking-tight text-white">The Eggcountant</h1>
            <p className="text-violet-100 text-lg font-medium opacity-80">Your flock's financial future, sorted.</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="space-y-4"
        >
          <button 
            onClick={onEnter}
            className="w-full py-5 bg-white text-violet-600 rounded-3xl font-bold text-xl shadow-2xl active:scale-[0.98] transition-all"
          >
            Enter the Coop
          </button>
          <p className="text-violet-200 text-xs uppercase tracking-[0.2em] font-bold">Est. 2026</p>
        </motion.div>
      </div>
    </div>
  );
}

// --- Dashboard Component ---
function Dashboard({ eggLogs, saleLogs, feedLogs, locations }: { eggLogs: EggLog[], saleLogs: SaleLog[], feedLogs: FeedLog[], locations: Location[] }) {
  const today = new Date().toISOString().split('T')[0];
  const todayEggs = eggLogs
    .filter(log => log.date.startsWith(today))
    .reduce((acc, log) => acc + log.count, 0);

  const totalEggs = eggLogs.reduce((acc, log) => acc + log.count, 0);
  const totalSold = saleLogs.reduce((acc, log) => acc + log.quantity, 0);
  const totalRevenue = saleLogs.reduce((acc, log) => acc + log.price, 0);
  const totalExpense = feedLogs.reduce((acc, log) => acc + log.cost, 0);
  const quidsIn = totalRevenue - totalExpense;

  // Prepare chart data (last 14 days)
  const chartData = Array.from({ length: 14 }).map((_, i) => {
    const d = subDays(new Date(), 13 - i);
    const dStr = d.toISOString().split('T')[0];
    const eggs = eggLogs
      .filter(log => log.date.startsWith(dStr))
      .reduce((acc, log) => acc + log.count, 0);
    return {
      name: format(d, 'MMM d'),
      eggs
    };
  });

  return (
    <div className="space-y-6 relative z-10">
      {/* Stat Cards - Moved to Top */}
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Today's Lay" value={todayEggs} icon={<Egg size={24} className="text-violet-500" />} />
        <StatCard label="Total Egg Count" value={totalEggs} icon={<Hash size={24} className="text-violet-400" />} />
        <StatCard label="Flogged Yokes" value={totalSold} icon={<PoundSterling size={24} className="text-violet-500" />} />
        <StatCard label="Quids In" value={`£${quidsIn.toFixed(2)}`} icon={<TrendingUp size={24} className="text-violet-600" />} />
      </section>

      {/* Chart Section - Reduced Height */}
      <section className="bg-white p-6 rounded-[32px] shadow-sm border border-violet-100">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h3 className="text-lg font-serif italic text-violet-900">Production Trend</h3>
            <p className="text-[10px] text-violet-900/40 uppercase tracking-widest font-bold">Last 14 Days</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-serif italic font-bold text-violet-600">
              {chartData.reduce((acc, d) => acc + d.eggs, 0)}
            </p>
            <p className="text-[10px] text-violet-900/40 uppercase tracking-widest font-bold">Total Eggs</p>
          </div>
        </div>
        <div className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorEggs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#7C3AED" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F3FF" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#9CA3AF' }} 
                dy={10}
              />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  fontSize: '12px'
                }} 
              />
              <Area 
                type="monotone" 
                dataKey="eggs" 
                stroke="#7C3AED" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorEggs)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Production by Location */}
      <section className="bg-white p-6 rounded-[32px] shadow-sm border border-violet-100">
        <h3 className="text-lg font-serif italic mb-4 text-violet-900">Production by Location</h3>
        <div className="space-y-4">
          {locations.map(loc => {
            const locEggs = eggLogs
              .filter(log => log.locationId === loc.id)
              .reduce((acc, log) => acc + log.count, 0);
            const percentage = totalEggs > 0 ? (locEggs / totalEggs) * 100 : 0;
            
            return (
              <div key={loc.id} className="space-y-1">
                <div className="flex justify-between text-sm font-medium text-violet-900">
                  <span>{loc.name}</span>
                  <span>{locEggs} eggs</span>
                </div>
                <div className="h-2 bg-violet-50 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    className="h-full bg-violet-600"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string | number, icon: ReactNode }) {
  return (
    <div className="bg-white p-4 rounded-[24px] shadow-sm border border-violet-100 flex flex-col justify-between h-28">
      <div className="flex justify-between items-start">
        <span className="text-[10px] uppercase tracking-widest font-bold text-violet-900/40">{label}</span>
        <div className="p-2 bg-violet-50 rounded-lg">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-serif italic font-bold text-violet-900">{value}</div>
    </div>
  );
}

// --- EggLogger Component ---
function EggLogger({ locations, onLog }: { locations: Location[], onLog: (count: number, locationId: string, date: string) => void }) {
  const [count, setCount] = useState(0);
  const [locationId, setLocationId] = useState(locations[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-8 py-4 relative z-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-serif italic font-bold text-violet-900">Log Production</h2>
        <p className="text-sm text-violet-900/50">How many eggs did you find?</p>
      </div>

      <div className="flex items-center justify-center gap-8">
        <button 
          onClick={() => setCount(Math.max(0, count - 1))}
          className="w-16 h-16 rounded-full border-2 border-violet-100 flex items-center justify-center text-2xl active:scale-95 transition-transform text-violet-400"
        >
          -
        </button>
        <div className="text-7xl font-serif italic font-bold w-24 text-center text-violet-900">{count}</div>
        <button 
          onClick={() => setCount(count + 1)}
          className="w-16 h-16 rounded-full bg-violet-600 text-white flex items-center justify-center text-2xl active:scale-95 transition-transform shadow-lg shadow-violet-200"
        >
          +
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-widest text-violet-900/40 px-2">Date</label>
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full p-4 bg-white rounded-2xl border-2 border-violet-100 focus:border-violet-600 focus:ring-0 transition-all"
          />
        </div>

        <label className="block text-xs font-bold uppercase tracking-widest text-violet-900/40 px-2">Select Location</label>
        <div className="grid grid-cols-2 gap-3">
          {locations.map(loc => (
            <button
              key={loc.id}
              onClick={() => setLocationId(loc.id)}
              className={`p-4 rounded-2xl border-2 transition-all text-sm font-medium ${
                locationId === loc.id 
                  ? 'border-violet-600 bg-violet-50 text-violet-600' 
                  : 'border-violet-100 bg-white text-violet-900/60'
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={count === 0}
        onClick={() => onLog(count, locationId, new Date(date).toISOString())}
        className="w-full py-5 bg-violet-600 text-white rounded-3xl font-bold text-lg shadow-xl shadow-violet-200 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
      >
        Save Collection
      </button>
    </div>
  );
}

// --- Helper for File Uploads ---
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
  const file = e.target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  }
};

// --- LocationManager Component ---
function LocationManager({ locations, user }: { locations: Location[], user: User }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'Garden' | 'Allotment'>('Garden');
  const [newPhoto, setNewPhoto] = useState('');

  const addLocation = async () => {
    if (!newName) return;
    const id = crypto.randomUUID();
    const path = `users/${user.uid}/locations/${id}`;
    const newLoc: Location = { id, name: newName, type: newType, photoUrl: newPhoto };
    try {
      await setDoc(doc(db, path), newLoc);
      setNewName('');
      setNewPhoto('');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const removeLocation = async (id: string) => {
    const path = `users/${user.uid}/locations/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-serif italic font-bold text-violet-900">Your Coops</h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="p-2 bg-violet-600 text-white rounded-full shadow-lg shadow-violet-200"
        >
          <Plus size={20} />
        </button>
      </div>

      {isAdding && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white p-6 rounded-[32px] border border-violet-100 space-y-4 shadow-xl shadow-violet-900/5"
        >
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Coop Name</label>
            <input 
              type="text" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Cluckingham Palace"
              className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Type</label>
            <div className="flex gap-2">
              {(['Garden', 'Allotment'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 transition-all ${
                    newType === t ? 'border-violet-600 bg-violet-50 text-violet-600' : 'border-transparent bg-violet-50/50 text-violet-900/40'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Photo</label>
            <div className="flex items-center gap-3">
              <label className="flex-1 cursor-pointer">
                <div className="w-full bg-violet-50 border-2 border-dashed border-violet-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-violet-100 transition-colors">
                  {newPhoto ? (
                    <img src={newPhoto} alt="Preview" className="w-12 h-12 object-cover rounded-lg" />
                  ) : (
                    <>
                      <Camera size={20} className="text-violet-400" />
                      <span className="text-[10px] font-bold text-violet-400 uppercase">Upload or Snap</span>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, setNewPhoto)}
                />
              </label>
              {newPhoto && (
                <button onClick={() => setNewPhoto('')} className="p-2 text-red-500 bg-red-50 rounded-xl">
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          </div>
          <button 
            onClick={addLocation}
            className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold shadow-lg shadow-violet-200"
          >
            Add Location
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {locations.map(loc => (
          <div key={loc.id} className="bg-white p-4 rounded-[24px] border border-violet-100 flex flex-col items-center text-center shadow-sm group relative">
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600 overflow-hidden mb-2">
              {loc.photoUrl ? (
                <img src={loc.photoUrl} alt={loc.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <MapPin size={28} />
              )}
            </div>
            <div>
              <p className="font-bold text-sm text-violet-900">{loc.name}</p>
              <p className="text-[10px] text-violet-900/40 font-medium uppercase tracking-widest">{loc.type}</p>
            </div>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => removeLocation(loc.id)}
                className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- HenTracker Component ---
function HenTracker({ hens, locations, user, chickBatches }: { hens: Hen[], locations: Location[], user: User, chickBatches: ChickBatch[] }) {
  const [activeTab, setActiveTab] = useState<'flock' | 'chicks'>('flock');
  const [isAdding, setIsAdding] = useState(false);
  const [editingHen, setEditingHen] = useState<Hen | null>(null);
  const [newName, setNewName] = useState('');
  const [newLoc, setNewLoc] = useState(locations[0]?.id || '');
  const [newStatus, setNewStatus] = useState<Hen['status']>('Healthy');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');

  const addHen = async () => {
    if (!newName) return;
    const id = crypto.randomUUID();
    const path = `users/${user.uid}/hens/${id}`;
    const newHen: Hen = {
      id,
      name: newName,
      locationId: newLoc,
      status: 'Healthy',
      photoUrl: newPhotoUrl
    };
    try {
      await setDoc(doc(db, path), newHen);
      setNewName('');
      setNewPhotoUrl('');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateHen = async () => {
    if (!editingHen || !newName) return;
    const path = `users/${user.uid}/hens/${editingHen.id}`;
    const updatedHen: Hen = {
      ...editingHen,
      name: newName,
      locationId: newLoc,
      status: newStatus,
      photoUrl: newPhotoUrl
    };
    try {
      await setDoc(doc(db, path), updatedHen);
      setEditingHen(null);
      setNewName('');
      setNewPhotoUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const deleteHen = async (id: string) => {
    const path = `users/${user.uid}/hens/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const startEditing = (hen: Hen) => {
    setEditingHen(hen);
    setNewName(hen.name);
    setNewLoc(hen.locationId);
    setNewStatus(hen.status);
    setNewPhotoUrl(hen.photoUrl || '');
    setIsAdding(false);
  };

  return (
    <div className="space-y-6 relative z-10">
      <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
        <button 
          onClick={() => setActiveTab('flock')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'flock' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-900/40'}`}
        >
          Flock
        </button>
        <button 
          onClick={() => setActiveTab('chicks')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'chicks' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-900/40'}`}
        >
          Chick Monitor
        </button>
      </div>

      {activeTab === 'flock' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-serif italic font-bold text-violet-900">The Flock</h2>
            <button 
              onClick={() => {
                setIsAdding(!isAdding);
                setEditingHen(null);
                setNewName('');
                setNewPhotoUrl('');
                setNewLoc(locations[0]?.id || '');
              }}
              className="p-2 bg-violet-600 text-white rounded-full shadow-lg shadow-violet-200"
            >
              <Plus size={20} />
            </button>
          </div>

          {(isAdding || editingHen) && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-white p-6 rounded-[32px] border border-violet-100 space-y-4 shadow-xl shadow-violet-900/5"
            >
              <h3 className="font-serif italic text-lg text-violet-900">{editingHen ? 'Egg-it Hen' : 'Add New Hen'}</h3>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Hen Name</label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Henrietta"
                  className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Photo</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="w-full bg-violet-50 border-2 border-dashed border-violet-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-violet-100 transition-colors">
                      {newPhotoUrl ? (
                        <img src={newPhotoUrl} alt="Preview" className="w-12 h-12 object-cover rounded-lg" />
                      ) : (
                        <>
                          <Camera size={20} className="text-violet-400" />
                          <span className="text-[10px] font-bold text-violet-400 uppercase">Upload or Snap</span>
                        </>
                      )}
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      className="hidden" 
                      onChange={(e) => handleFileUpload(e, setNewPhotoUrl)}
                    />
                  </label>
                  {newPhotoUrl && (
                    <button onClick={() => setNewPhotoUrl('')} className="p-2 text-red-500 bg-red-50 rounded-xl">
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Location</label>
                <select 
                  value={newLoc}
                  onChange={(e) => setNewLoc(e.target.value)}
                  className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600"
                >
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              {editingHen && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Status</label>
                  <select 
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as Hen['status'])}
                    className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600"
                  >
                    <option value="Healthy">Healthy</option>
                    <option value="Sick">Sick</option>
                    <option value="Recovering">Recovering</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button 
                  onClick={editingHen ? updateHen : addHen}
                  className="flex-1 py-4 bg-violet-600 text-white rounded-2xl font-bold shadow-lg shadow-violet-200"
                >
                  {editingHen ? 'Save Cluck-dates' : 'Add Hen'}
                </button>
                <button 
                  onClick={() => {
                    setIsAdding(false);
                    setEditingHen(null);
                  }}
                  className="px-6 py-4 bg-violet-50 text-violet-900/40 rounded-2xl font-bold hover:bg-violet-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {hens.map(hen => (
              <div key={hen.id} className="bg-white p-3 rounded-[24px] border border-violet-100 space-y-2 relative group shadow-sm overflow-hidden">
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button 
                    onClick={() => startEditing(hen)}
                    className="p-1.5 bg-white/80 backdrop-blur-sm text-violet-600 rounded-lg shadow-sm"
                    title="Egg-it Hen"
                  >
                    <Pencil size={12} />
                  </button>
                  <button 
                    onClick={() => deleteHen(hen.id)}
                    className="p-1.5 bg-white/80 backdrop-blur-sm text-rose-600 rounded-lg shadow-sm"
                    title="Remove Hen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                
                <div className="aspect-square -mx-3 -mt-3 mb-2 overflow-hidden bg-violet-50 flex items-center justify-center">
                  {hen.photoUrl ? (
                    <img 
                      src={hen.photoUrl} 
                      alt={hen.name} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Bird size={24} className="text-violet-200" />
                  )}
                </div>
                
                <div>
                  <p className="font-bold text-sm text-violet-900 leading-tight">{hen.name}</p>
                  <p className="text-[9px] text-violet-900/40 uppercase tracking-widest font-bold">
                    {locations.find(l => l.id === hen.locationId)?.name}
                  </p>
                </div>
                <div className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full inline-block ${
                  hen.status === 'Healthy' ? 'bg-violet-100 text-violet-700' : 
                  hen.status === 'Sick' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {hen.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ChickMonitor chickBatches={chickBatches} locations={locations} user={user} />
      )}
    </div>
  );
}

function ChickMonitor({ chickBatches, locations, user }: { chickBatches: ChickBatch[], locations: Location[], user: User }) {
  const [isAdding, setIsAdding] = useState(false);
  const [updatingBatch, setUpdatingBatch] = useState<ChickBatch | null>(null);
  const [count, setCount] = useState('');
  const [locId, setLocId] = useState(locations[0]?.id || '');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [hatched, setHatched] = useState('');
  const [perished, setPerished] = useState('');
  const [newBatchPhoto, setNewBatchPhoto] = useState('');
  const [addingChick, setAddingChick] = useState<string | null>(null);
  const [chickGender, setChickGender] = useState<'Male' | 'Female' | 'Unknown'>('Unknown');
  const [chickHatchDate, setChickHatchDate] = useState(new Date().toISOString().split('T')[0]);

  const addBatch = async () => {
    if (!count || !locId) return;
    const id = crypto.randomUUID();
    const path = `users/${user.uid}/chickBatches/${id}`;
    const start = new Date(startDate);
    const expected = new Date(start);
    expected.setDate(expected.getDate() + 21);

    const newBatch: ChickBatch = {
      id,
      dateStarted: start.toISOString(),
      expectedHatchDate: expected.toISOString(),
      count: parseInt(count),
      status: 'Incubating',
      locationId: locId,
      hatchedCount: 0,
      perishedCount: 0,
      chicks: [],
      photoUrl: newBatchPhoto
    };

    try {
      await setDoc(doc(db, path), newBatch);
      setCount('');
      setNewBatchPhoto('');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const updateBatchResults = async () => {
    if (!updatingBatch) return;
    const path = `users/${user.uid}/chickBatches/${updatingBatch.id}`;
    const hCount = parseInt(hatched) || 0;
    const pCount = parseInt(perished) || 0;
    
    const updatedBatch: ChickBatch = {
      ...updatingBatch,
      hatchedCount: hCount,
      perishedCount: pCount,
      status: hCount > 0 ? 'Hatched' : (pCount >= updatingBatch.count ? 'Failed' : 'Incubating')
    };

    try {
      await setDoc(doc(db, path), updatedBatch);
      setUpdatingBatch(null);
      setHatched('');
      setPerished('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const addChickToBatch = async (batchId: string) => {
    const batch = chickBatches.find(b => b.id === batchId);
    if (!batch) return;

    const newChick: Chick = {
      id: crypto.randomUUID(),
      hatchDate: new Date(chickHatchDate).toISOString(),
      gender: chickGender
    };

    const path = `users/${user.uid}/chickBatches/${batchId}`;
    const updatedBatch: ChickBatch = {
      ...batch,
      chicks: [...(batch.chicks || []), newChick]
    };

    try {
      await setDoc(doc(db, path), updatedBatch);
      setAddingChick(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const deleteBatch = async (id: string) => {
    const path = `users/${user.uid}/chickBatches/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-serif italic font-bold text-violet-900">Chick Monitor</h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="p-2 bg-violet-600 text-white rounded-full shadow-lg shadow-violet-200"
        >
          <Plus size={20} />
        </button>
      </div>

      {isAdding && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white p-6 rounded-[32px] border border-violet-100 space-y-4 shadow-xl shadow-violet-900/5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Egg Count</label>
              <input type="number" value={count} onChange={e => setCount(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Location</label>
            <select value={locId} onChange={e => setLocId(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600">
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Batch Photo</label>
            <div className="flex items-center gap-3">
              <label className="flex-1 cursor-pointer">
                <div className="w-full bg-violet-50 border-2 border-dashed border-violet-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-violet-100 transition-colors">
                  {newBatchPhoto ? (
                    <img src={newBatchPhoto} alt="Preview" className="w-12 h-12 object-cover rounded-lg" />
                  ) : (
                    <>
                      <Camera size={20} className="text-violet-400" />
                      <span className="text-[10px] font-bold text-violet-400 uppercase">Upload or Snap</span>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, setNewBatchPhoto)}
                />
              </label>
              {newBatchPhoto && (
                <button onClick={() => setNewBatchPhoto('')} className="p-2 text-red-500 bg-red-50 rounded-xl">
                  <Trash2 size={20} />
                </button>
              )}
            </div>
          </div>
          <button onClick={addBatch} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold shadow-lg shadow-violet-200">Start Incubation</button>
        </motion.div>
      )}

      {updatingBatch && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 rounded-[32px] border-2 border-violet-600 space-y-4 shadow-xl"
        >
          <h3 className="font-serif italic text-lg text-violet-900">Update Batch Results</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Hatched</label>
              <input type="number" value={hatched} onChange={e => setHatched(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Perished</label>
              <input type="number" value={perished} onChange={e => setPerished(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={updateBatchResults} className="flex-1 py-4 bg-violet-600 text-white rounded-2xl font-bold">Save Results</button>
            <button onClick={() => setUpdatingBatch(null)} className="px-6 py-4 bg-violet-50 text-violet-900/40 rounded-2xl font-bold">Cancel</button>
          </div>
        </motion.div>
      )}

      <div className="space-y-4">
        {chickBatches.map(batch => (
          <div key={batch.id} className="bg-white p-5 rounded-[32px] border border-violet-100 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  batch.status === 'Incubating' ? 'bg-amber-50 text-amber-600' :
                  batch.status === 'Hatched' ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {batch.status === 'Incubating' ? <Clock size={20} /> : 
                   batch.status === 'Hatched' ? <Bird size={20} /> : <Trash2 size={20} />}
                </div>
                <div>
                  <p className="font-bold text-violet-900">{batch.count} Eggs</p>
                  <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">
                    Started {format(new Date(batch.dateStarted), 'MMM d')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setUpdatingBatch(batch)} className="p-2 text-violet-400 hover:text-violet-600">
                  <RefreshCw size={16} />
                </button>
                <button onClick={() => deleteBatch(batch.id)} className="p-2 text-violet-200 hover:text-rose-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-violet-50 p-2 rounded-xl text-center">
                <p className="text-[8px] uppercase font-bold text-violet-400">Incubating</p>
                <p className="text-sm font-bold text-violet-900">{batch.count - (batch.hatchedCount || 0) - (batch.perishedCount || 0)}</p>
              </div>
              <div className="bg-green-50 p-2 rounded-xl text-center">
                <p className="text-[8px] uppercase font-bold text-green-400">Hatched</p>
                <p className="text-sm font-bold text-green-600">{batch.hatchedCount || 0}</p>
              </div>
              <div className="bg-rose-50 p-2 rounded-xl text-center">
                <p className="text-[8px] uppercase font-bold text-rose-400">Perished</p>
                <p className="text-sm font-bold text-rose-600">{batch.perishedCount || 0}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">Expected Hatch</p>
              <p className="text-sm font-serif italic font-bold text-violet-600">
                {format(new Date(batch.expectedHatchDate), 'MMMM d, yyyy')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- FeedMedTracker Component ---
function FeedMedTracker({ feedLogs, medLogs, locations, hens, user }: { 
  feedLogs: FeedLog[],
  medLogs: MedicationLog[],
  locations: Location[], hens: Hen[],
  user: User
}) {
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'med'>('feed');
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [locId, setLocId] = useState(locations[0]?.id || '');

  const addFeed = async () => {
    if (!amount || !cost) return;
    const id = crypto.randomUUID();
    const path = `users/${user.uid}/feedLogs/${id}`;
    const newLog: FeedLog = {
      id,
      date: new Date().toISOString(),
      amount: parseFloat(amount),
      cost: parseFloat(cost),
      locationId: locId
    };
    try {
      await setDoc(doc(db, path), newLog);
      setAmount('');
      setCost('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
        <button 
          onClick={() => setActiveSubTab('feed')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeSubTab === 'feed' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-900/40'}`}
        >
          Feed
        </button>
        <button 
          onClick={() => setActiveSubTab('med')}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${activeSubTab === 'med' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-900/40'}`}
        >
          Medication
        </button>
      </div>

      {activeSubTab === 'feed' ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-[32px] border border-violet-100 space-y-4 shadow-xl shadow-violet-900/5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Amount (kg)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Cost (£)</label>
                <input type="number" value={cost} onChange={e => setCost(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Location</label>
              <select value={locId} onChange={e => setLocId(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600">
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <button onClick={addFeed} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold shadow-lg shadow-violet-200">Log Feed Purchase</button>
          </div>

          <div className="space-y-3">
            {feedLogs.map(log => (
              <div key={log.id} className="bg-white p-4 rounded-2xl border border-violet-100 flex justify-between items-center shadow-sm">
                <div>
                  <p className="font-bold text-violet-900">{log.amount}kg Feed</p>
                  <p className="text-xs text-violet-900/40">{new Date(log.date).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-serif italic font-bold text-violet-900">£{log.cost.toFixed(2)}</p>
                  <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">
                    {locations.find(l => l.id === log.locationId)?.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <MedicationLogger locations={locations} hens={hens} user={user} medLogs={medLogs} />
      )}
    </div>
  );
}

function MedicationLogger({ locations, hens, user, medLogs }: { locations: Location[], hens: Hen[], user: User, medLogs: MedicationLog[] }) {
  const [medName, setMedName] = useState('');
  const [dosage, setDosage] = useState('');
  const [henId, setHenId] = useState('');
  const [locId, setLocId] = useState(locations[0]?.id || '');

  const addMed = async () => {
    if (!medName || !dosage || !locId) return;
    const id = crypto.randomUUID();
    const path = `users/${user.uid}/medicationLogs/${id}`;
    const newLog: MedicationLog = {
      id,
      date: new Date().toISOString(),
      medicationName: medName,
      dosage,
      locationId: locId
    };
    if (henId) newLog.henId = henId;

    try {
      await setDoc(doc(db, path), newLog);
      setMedName('');
      setDosage('');
      setHenId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[32px] border border-violet-100 space-y-4 shadow-xl shadow-violet-900/5">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Medication Name</label>
          <input type="text" value={medName} onChange={e => setMedName(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Dosage</label>
          <input type="text" value={dosage} onChange={e => setDosage(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Hen (Optional)</label>
            <select value={henId} onChange={e => setHenId(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600">
              <option value="">Whole Flock</option>
              {hens.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Location</label>
            <select value={locId} onChange={e => setLocId(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600">
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={addMed} className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold shadow-lg shadow-violet-200">Log Medication</button>
      </div>

      <div className="space-y-3">
        {medLogs.length === 0 ? (
          <div className="text-center py-12 text-violet-900/40">
            <Stethoscope size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">No medication logs yet.</p>
          </div>
        ) : (
          medLogs.map(log => (
            <div key={log.id} className="bg-white p-4 rounded-2xl border border-violet-100 flex justify-between items-center shadow-sm">
              <div>
                <p className="font-bold text-violet-900">{log.medicationName}</p>
                <p className="text-xs text-violet-900/40">{log.dosage} • {new Date(log.date).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">
                  {log.henId ? hens.find(h => h.id === log.henId)?.name : 'Whole Flock'}
                </p>
                <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">
                  {locations.find(l => l.id === log.locationId)?.name}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --- SalesTracker Component ---
function SalesTracker({ saleLogs, onLog }: { saleLogs: SaleLog[], onLog: (quantity: number, price: number, date: string) => void }) {
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[32px] border border-violet-100 space-y-4 shadow-xl shadow-violet-900/5">
        <h3 className="text-lg font-serif italic mb-2 text-violet-900">Record a Sale</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Quantity</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Total Price (£)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-violet-900/40">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-4 bg-violet-50 rounded-2xl border-none focus:ring-2 focus:ring-violet-600" />
        </div>
        <button 
          onClick={() => {
            if (qty && price) onLog(parseInt(qty), parseFloat(price), new Date(date).toISOString());
            setQty('');
            setPrice('');
          }}
          className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold shadow-lg shadow-violet-200"
        >
          Log Sale
        </button>
      </div>

      <div className="space-y-3">
        {saleLogs.map(log => (
          <div key={log.id} className="bg-white p-4 rounded-2xl border border-violet-100 flex justify-between items-center shadow-sm">
            <div>
              <p className="font-bold text-violet-900">{log.quantity} Eggs Sold</p>
              <p className="text-xs text-violet-900/40">{new Date(log.date).toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p className="font-serif italic font-bold text-violet-600">+£{log.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- ChickenWiki Component ---
import { CHICKEN_FACTS } from './constants';

function ChickenWiki() {
  const [factIndex, setFactIndex] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  
  useEffect(() => {
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    setFactIndex(dayOfYear % CHICKEN_FACTS.length);
  }, []);

  const shakeForFact = () => {
    setIsShaking(true);
    setTimeout(() => {
      const newIndex = Math.floor(Math.random() * CHICKEN_FACTS.length);
      setFactIndex(newIndex);
      setIsShaking(false);
    }, 500);
  };

  const dailyFact = CHICKEN_FACTS[factIndex];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-serif italic font-bold text-violet-900">Chicken Wiki</h2>
        <button 
          onClick={shakeForFact}
          className={`flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-600 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-violet-200 transition-all ${isShaking ? 'animate-bounce' : ''}`}
        >
          <RefreshCw size={14} className={isShaking ? 'animate-spin' : ''} />
          Shake for more facts
        </button>
      </div>

      {/* Fact of the Day */}
      <motion.div 
        key={factIndex}
        initial={{ scale: 0.95, opacity: 0, rotate: -2 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        className="bg-violet-600 p-6 rounded-[32px] text-white space-y-3 shadow-xl shadow-violet-200 relative overflow-hidden"
      >
        <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12">
          <Bird size={120} />
        </div>
        <div className="relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Did you know?</p>
          <p className="text-lg font-serif italic leading-relaxed">"{dailyFact}"</p>
        </div>
      </motion.div>

      <div className="space-y-4">
        {CHICKEN_WIKI.map(article => (
          <div key={article.id} className="bg-white p-6 rounded-[32px] border border-violet-100 space-y-3 shadow-sm">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-lg text-violet-900">{article.title}</h4>
              <span className="text-[10px] bg-violet-50 text-violet-600 px-2 py-1 rounded-full font-bold uppercase tracking-widest">
                {article.category}
              </span>
            </div>
            <p className="text-sm text-violet-900/70 leading-relaxed">
              {article.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- CalendarView Component ---
function CalendarView({ eggLogs, feedLogs, saleLogs }: { eggLogs: EggLog[], feedLogs: FeedLog[], saleLogs: SaleLog[] }) {
  const [view, setView] = useState<'week' | 'two-weeks' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<'all' | 'eggs' | 'feed' | 'sales'>('all');

  const next = () => {
    if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else if (view === 'two-weeks') setCurrentDate(addWeeks(currentDate, 2));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const prev = () => {
    if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else if (view === 'two-weeks') setCurrentDate(subWeeks(currentDate, 2));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(currentDate, { weekStartsOn: 1 })
  });

  const twoWeekDays = eachDayOfInterval({
    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
    end: endOfWeek(addWeeks(currentDate, 1), { weekStartsOn: 1 })
  });

  const monthDays = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  const getDayData = (date: Date) => {
    const dayEggs = eggLogs
      .filter(log => isSameDay(parseISO(log.date), date))
      .reduce((acc, log) => acc + log.count, 0);
    
    const dayFeedCost = feedLogs
      .filter(log => isSameDay(parseISO(log.date), date))
      .reduce((acc, log) => acc + log.cost, 0);

    const daySales = saleLogs
      .filter(log => isSameDay(parseISO(log.date), date))
      .reduce((acc, log) => acc + log.price, 0);

    return { eggs: dayEggs, feed: dayFeedCost, sales: daySales };
  };

  const renderDayContent = (date: Date, isToday: boolean, isCompact: boolean = false) => {
    const data = getDayData(date);
    const isSelected = isSameDay(date, selectedDate);
    
    if (isCompact) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          {(filter === 'all' || filter === 'eggs') && data.eggs > 0 && (
            <div className="flex items-center gap-1">
              <div className={`w-1 h-1 rounded-full ${isToday || isSelected ? 'bg-white' : 'bg-violet-400'}`} />
              <span className="text-[8px] font-bold">{data.eggs}</span>
            </div>
          )}
          {(filter === 'all' || filter === 'sales') && data.sales > 0 && (
            <span className={`text-[8px] font-bold ${isToday || isSelected ? 'text-white' : 'text-violet-600'}`}>£{data.sales.toFixed(0)}</span>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        {(filter === 'all' || filter === 'eggs') && data.eggs > 0 && (
          <div className="flex items-center gap-1">
            <Egg size={10} className={isToday || isSelected ? 'text-white' : 'text-violet-400'} />
            <span className="text-[10px] font-bold">{data.eggs}</span>
          </div>
        )}
        {(filter === 'all' || filter === 'sales') && data.sales > 0 && (
          <div className="flex items-center gap-1">
            <PoundSterling size={10} className={isToday || isSelected ? 'text-white' : 'text-violet-600'} />
            <span className="text-[10px] font-bold">£{data.sales.toFixed(0)}</span>
          </div>
        )}
      </div>
    );
  };

  const selectedData = getDayData(selectedDate);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-serif italic font-bold text-violet-900">
            {view === 'week' ? `Week of ${format(weekDays[0], 'MMM d')}` : 
             view === 'two-weeks' ? `${format(twoWeekDays[0], 'MMM d')} - ${format(twoWeekDays[13], 'MMM d')}` :
             format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex bg-white p-1 rounded-2xl border border-violet-100 shadow-sm">
            <button 
              onClick={() => setView('week')}
              className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'week' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-900/40'}`}
            >
              1 Week
            </button>
            <button 
              onClick={() => setView('two-weeks')}
              className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'two-weeks' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-900/40'}`}
            >
              2 Weeks
            </button>
            <button 
              onClick={() => setView('month')}
              className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${view === 'month' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-violet-900/40'}`}
            >
              Month
            </button>
          </div>
        </div>

        {/* Filters and Navigation */}
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-2 bg-white rounded-full border border-violet-100 shadow-sm text-violet-600 active:scale-90 transition-transform">
            <ChevronRight className="rotate-180" size={20} />
          </button>
          
          <div className="flex-1 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {(['all', 'eggs', 'feed', 'sales'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all whitespace-nowrap ${
                  filter === f ? 'bg-violet-100 border-violet-600 text-violet-600' : 'bg-white border-violet-100 text-violet-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button onClick={next} className="p-2 bg-white rounded-full border border-violet-100 shadow-sm text-violet-600 active:scale-90 transition-transform">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Selected Day Stats */}
      <div className="bg-white p-5 rounded-[32px] border border-violet-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-tighter leading-none">{format(selectedDate, 'EEE')}</span>
            <span className="text-lg font-bold leading-none mt-1">{format(selectedDate, 'd')}</span>
          </div>
          <div>
            <p className="font-bold text-lg text-violet-900">{selectedData.eggs} Eggs</p>
            <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">Haul for the day</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-violet-600">£{selectedData.sales.toFixed(2)}</p>
          <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">Revenue</p>
        </div>
      </div>

      {view === 'week' ? (
        <div className="space-y-3">
          {weekDays.map(day => {
            const data = getDayData(day);
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDate);
            return (
              <button 
                key={day.toString()} 
                onClick={() => setSelectedDate(day)}
                className={`w-full text-left bg-white p-5 rounded-[24px] border transition-all ${
                  isSelected ? 'border-violet-600 ring-1 ring-violet-600/20 shadow-lg shadow-violet-900/5' : 
                  isToday ? 'border-violet-200 shadow-sm' : 'border-violet-100 shadow-sm'
                } flex items-center justify-between active:scale-[0.99]`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center ${
                    isSelected ? 'bg-violet-600 text-white' : 
                    isToday ? 'bg-violet-100 text-violet-600' : 'bg-violet-50 text-violet-900/40'
                  }`}>
                    <span className="text-[10px] font-bold uppercase tracking-tighter leading-none">{format(day, 'EEE')}</span>
                    <span className="text-lg font-bold leading-none mt-1">{format(day, 'd')}</span>
                  </div>
                  <div>
                    <p className="font-bold text-lg text-violet-900">{data.eggs} Eggs</p>
                    <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">Haul</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-violet-600">£{data.sales.toFixed(2)}</p>
                  <p className="text-[10px] text-violet-900/40 font-bold uppercase tracking-widest">Revenue</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : view === 'two-weeks' ? (
        <div className="grid grid-cols-7 gap-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-violet-900/30 uppercase tracking-widest mb-2">
              {d}
            </div>
          ))}
          {twoWeekDays.map(day => {
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDate);
            return (
              <button 
                key={day.toString()} 
                onClick={() => setSelectedDate(day)}
                className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all border ${
                  isSelected ? 'bg-violet-600 text-white border-violet-600 shadow-lg' : 
                  isToday ? 'bg-violet-100 border-violet-200 text-violet-600' : 'bg-white border-violet-50 hover:bg-violet-50'
                }`}
              >
                <span className={`text-xs font-serif italic mb-1 ${isSelected ? 'text-white' : 'text-violet-900'}`}>
                  {format(day, 'd')}
                </span>
                {renderDayContent(day, isToday || isSelected, true)}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-[40px] p-6 border border-violet-100 shadow-xl relative min-h-[400px]">
          <div className="relative z-10 grid grid-cols-7 gap-1.5">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-violet-900/30 uppercase tracking-widest mb-4">
                {d}
              </div>
            ))}
            
            {Array.from({ length: (getDay(monthDays[0]) + 6) % 7 }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {monthDays.map(day => {
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, selectedDate);
              return (
                <button 
                  key={day.toString()} 
                  onClick={() => setSelectedDate(day)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center relative group transition-all border ${
                    isSelected ? 'bg-violet-600 text-white border-violet-600 shadow-lg' : 
                    isToday ? 'bg-violet-100 border-violet-200 text-violet-600' : 'bg-white border-violet-50 hover:bg-violet-50'
                  }`}
                >
                  <span className={`text-xs font-serif italic ${isSelected ? 'text-white' : 'text-violet-900'}`}>
                    {format(day, 'd')}
                  </span>
                  {renderDayContent(day, isToday || isSelected, true)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

