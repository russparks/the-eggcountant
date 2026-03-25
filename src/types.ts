export type Location = {
  id: string;
  name: string;
  type: 'Garden' | 'Allotment' | 'Other';
  photoUrl?: string;
};

export type EggLogMode = 'produce' | 'breed';

export type EggLog = {
  id: string;
  date: string;
  count: number;
  locationId: string;
  notes?: string;
  mode?: EggLogMode;
  coopTemperature?: number;
};

export type HenAppearance = 'Healthy' | 'Broody' | 'Fluffy' | 'Moulting' | 'Speckled' | 'Scruffy';

export type Hen = {
  id: string;
  name: string;
  breed?: string;
  locationId: string;
  status: HenAppearance;
  photoUrl?: string;
  notes?: string;
};

export type FeedLog = {
  id: string;
  date: string;
  amount: number;
  cost?: number;
  weight?: number;
  feedType?: string;
  locationId: string;
  notes?: string;
};

export type MedicationLog = {
  id: string;
  date: string;
  henId?: string;
  locationId: string;
  medicationName: string;
  dosage: string;
  notes?: string;
};

export type SaleLog = {
  id: string;
  date: string;
  quantity: number;
  price: number;
  notes?: string;
};

export type WikiArticle = {
  id: string;
  title: string;
  category: 'Harvesting' | 'Hatching' | 'Raising' | 'Wellbeing';
  content: string;
  href: string;
  source: string;
};

export type Chick = {
  id: string;
  hatchDate: string;
  gender?: 'Male' | 'Female' | 'Unknown';
  photoUrl?: string;
};

export type ChickBatch = {
  id: string;
  dateStarted: string;
  expectedHatchDate: string;
  hatchDate?: string;
  count: number;
  status: 'Incubating' | 'Hatched' | 'Failed';
  locationId: string;
  notes?: string;
  hatchedCount?: number;
  perishedCount?: number;
  chicks?: Chick[];
  photoUrl?: string;
};
