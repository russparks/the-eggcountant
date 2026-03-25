export type Location = {
  id: string;
  name: string;
  type: 'Garden' | 'Allotment';
  photoUrl?: string;
};

export type EggLog = {
  id: string;
  date: string; // ISO string
  count: number;
  locationId: string;
  notes?: string;
};

export type Hen = {
  id: string;
  name: string;
  breed?: string;
  locationId: string;
  status: 'Healthy' | 'Sick' | 'Recovering';
  photoUrl?: string;
  notes?: string;
};

export type FeedLog = {
  id: string;
  date: string;
  amount: number; // in kg
  cost: number;
  locationId: string;
};

export type MedicationLog = {
  id: string;
  date: string;
  henId?: string; // Optional if it's for the whole flock
  locationId: string;
  medicationName: string;
  dosage: string;
  notes?: string;
};

export type SaleLog = {
  id: string;
  date: string;
  quantity: number; // dozen or individual? Let's say individual for now
  price: number;
  notes?: string;
};

export type WikiArticle = {
  id: string;
  title: string;
  category: 'Harvesting' | 'Hatching' | 'Raising' | 'Wellbeing';
  content: string;
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
  count: number;
  status: 'Incubating' | 'Hatched' | 'Failed';
  locationId: string;
  notes?: string;
  hatchedCount?: number;
  perishedCount?: number;
  chicks?: Chick[];
  photoUrl?: string;
};
