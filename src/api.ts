import { ChickBatch, EggLog, FeedLog, Hen, Location, MedicationLog, SaleLog } from './types';

export type CollectionName = 'locations' | 'eggLogs' | 'hens' | 'feedLogs' | 'medicationLogs' | 'saleLogs' | 'chickBatches';
export type AppRecordMap = {
  locations: Location;
  eggLogs: EggLog;
  hens: Hen;
  feedLogs: FeedLog;
  medicationLogs: MedicationLog;
  saleLogs: SaleLog;
  chickBatches: ChickBatch;
};

export type SessionUser = {
  id: string;
  email: string;
  nickname?: string;
  createdAt?: string | null;
};

const API_BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : './api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: isFormData ? (init?.headers || {}) : {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data as T;
}

export const authApi = {
  session: async () => request<{ user: SessionUser | null }>('/session.php'),
  register: async (email: string, password: string, nickname: string) => request<{ user: SessionUser }>('/register.php', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  }),
  login: async (email: string, password: string) => request<{ user: SessionUser }>('/login.php', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  logout: async () => request<{ ok: boolean }>('/logout.php', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
};

export const uploadApi = {
  image: async (file: Blob, filename = 'photo.jpg'): Promise<string> => {
    const form = new FormData();
    form.append('file', file, filename);
    const data = await request<{ url: string }>('/upload.php', {
      method: 'POST',
      body: form,
    });
    return data.url;
  },
};

export const dataApi = {
  list: async <K extends CollectionName>(collection: K): Promise<AppRecordMap[K][]> => {
    const data = await request<{ items: AppRecordMap[K][] }>(`/data.php?collection=${collection}`);
    return data.items;
  },
  upsert: async <K extends CollectionName>(collection: K, item: AppRecordMap[K]): Promise<AppRecordMap[K]> => {
    const data = await request<{ item: AppRecordMap[K] }>(`/data.php?collection=${collection}`, {
      method: 'POST',
      body: JSON.stringify({ item }),
    });
    return data.item;
  },
  remove: async (collection: CollectionName, id: string): Promise<void> => {
    await request(`/data.php?collection=${collection}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
