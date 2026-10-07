/**
 * Global app state (Zustand).
 */
import { create } from 'zustand';
import type { FeasibilityReport, Site } from '../models';
import type { PackData } from '../data/PackLoader';
import type { PackManifest } from '../data/DataPackManager';

interface AppState {
  // data packs
  packs: PackManifest[];
  activePack: PackManifest | null;
  packData: PackData | null;
  loadingPack: boolean;

  // site + results
  site: Site | null;
  report: FeasibilityReport | null;
  analyzing: boolean;
  error: string | null;

  setPacks: (p: PackManifest[]) => void;
  setActivePack: (p: PackManifest | null) => void;
  setPackData: (d: PackData | null) => void;
  setLoadingPack: (b: boolean) => void;
  setSite: (s: Site | null) => void;
  setReport: (r: FeasibilityReport | null) => void;
  setAnalyzing: (b: boolean) => void;
  setError: (e: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  packs: [],
  activePack: null,
  packData: null,
  loadingPack: false,
  site: null,
  report: null,
  analyzing: false,
  error: null,

  setPacks: (packs) => set({ packs }),
  setActivePack: (activePack) => set({ activePack }),
  setPackData: (packData) => set({ packData }),
  setLoadingPack: (loadingPack) => set({ loadingPack }),
  setSite: (site) => set({ site }),
  setReport: (report) => set({ report }),
  setAnalyzing: (analyzing) => set({ analyzing }),
  setError: (error) => set({ error }),
}));
