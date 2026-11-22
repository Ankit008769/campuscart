import { listDropPoints } from '@campuscart/core';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

export type DropPoint = Awaited<ReturnType<typeof listDropPoints>>[number];

type Location = {
  dropPoints: DropPoint[];
  /** Where the student wants this order delivered: chosen in the header, or their usual drop point. */
  dropPointId: string | null;
  setDropPointId: (id: string | null) => void;
  current: DropPoint | null;
};

const KEY = 'campuscart:web-drop-point';
const LocationContext = createContext<Location | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [dropPoints, setDropPoints] = useState<DropPoint[]>([]);
  const [chosen, setChosen] = useState<string | null>(() => localStorage.getItem(KEY));

  useEffect(() => {
    if (!session) return;
    listDropPoints(supabase).then(setDropPoints, () => setDropPoints([]));
  }, [session]);

  const dropPointId = chosen ?? profile?.default_drop_point_id ?? null;
  const value = useMemo<Location>(
    () => ({
      dropPoints,
      dropPointId,
      current: dropPoints.find((p) => p.id === dropPointId) ?? null,
      setDropPointId: (id) => {
        setChosen(id);
        if (id) localStorage.setItem(KEY, id);
        else localStorage.removeItem(KEY);
      },
    }),
    [dropPoints, dropPointId],
  );
  return <LocationContext value={value}>{children}</LocationContext>;
}

export function useDropPoint(): Location {
  const location = use(LocationContext);
  if (!location) throw new Error('useDropPoint must be used inside LocationProvider');
  return location;
}

const KIND_LABEL: Record<string, string> = {
  hostel: 'Hostels',
  department: 'Academic buildings',
  other: 'Gates and campus spots',
};

/** Drop points grouped for a <select>, hostels first. */
export function groupedDropPoints(points: DropPoint[]) {
  const groups = new Map<string, DropPoint[]>(Object.values(KIND_LABEL).map((label) => [label, []]));
  for (const p of points) {
    const label = KIND_LABEL[p.kind] ?? 'Gates and campus spots';
    groups.set(label, [...(groups.get(label) ?? []), p]);
  }
  return [...groups.entries()].filter(([, list]) => list.length > 0);
}
