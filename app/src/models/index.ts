/**
 * Domain models for TowerFeasibility Pro.
 */

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  createdAt: string;
}

export type DensityClass = 'Rural' | 'Semi-urban' | 'Urban' | 'Dense urban';
export type SaturationClass = 'Low' | 'Medium' | 'High' | 'Saturated';
export type Accessibility = 'Excellent' | 'Good' | 'Fair' | 'Poor';
export type LosStatus = 'Clear' | 'Obstructed' | 'Marginal';
export type Recommendation = 'Go' | 'No-Go' | 'Conditional';

export interface PopulationResult {
  populationWithin2km: number;
  populationWithin5km: number;
  populationWithin10km: number;
  densityPerKm2: number;
  densityClassification: DensityClass;
  serviceablePopulation: number;
  /** 'worldpop' = measured raster, 'tower-proxy' = estimate */
  source?: 'worldpop' | 'tower-proxy';
}

export interface NearbyTower {
  id: number;
  lat: number;
  lon: number;
  installationType: string | null;
  distanceKm: number;
}

export interface TowerResult {
  towersWithin1km: number;
  towersWithin2km: number;
  towersWithin5km: number;
  densityPerKm2: number;
  saturationClassification: SaturationClass;
  nearbyTowers: NearbyTower[];
  colocationOpportunity: boolean;
}

export interface NearestResource {
  distanceKm: number;
  name: string | null;
  detail: string | null;
}

export interface ResourceResult {
  nearestFiber: NearestResource;
  nearestRoad: NearestResource | null;
  resourceScore: number; // 1-5
  fiberAccessibility: Accessibility;
}

export interface RowResult {
  state: string;
  applicationFee: number;
  estimatedTotalCost: number;
  approvalTimelineDays: number;
  deemedApprovalDays: number;
  requiredDocuments: string[];
}

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
  losLineM: number;
  fresnelRadiusM: number;
  obstructed: boolean;
}

export interface LosResult {
  losStatus: LosStatus;
  terrainProfile: ElevationPoint[];
  fresnelClearance: boolean;
  recommendedTowerHeight: number;
  pathLossDb: number;
  estimatedRsrpDbm: number;
  distanceKm: number;
}

export interface SoilResult {
  faoCode: string | null;
  soilType: string;
  foundationSuitability: string;
  foundationNote: string;
}

export interface AdminResult {
  state: string;
  district: string | null;
  governingAuthority: string;
  complianceRequirements: string[];
}

export interface FeasibilityReport {
  metadata: {
    projectName: string;
    siteName: string;
    date: string;
    preparedBy: string;
    coordinates: { lat: number; lon: number };
    region: string;
  };
  executiveSummary: {
    overallScore: number; // 1-10
    recommendation: Recommendation;
    keyFindings: string[];
    criticalIssues: string[];
  };
  populationAnalysis: PopulationResult;
  towerAnalysis: TowerResult;
  resourceAnalysis: ResourceResult;
  rowAnalysis: RowResult;
  losAnalysis: LosResult | null;
  soilAnalysis: SoilResult;
  adminAnalysis: AdminResult;
}

/** Shape accepted by the scoring/report builder. */
export interface AnalysisBundleLike {
  population: PopulationResult;
  towers: TowerResult;
  resources: ResourceResult;
  row: RowResult;
  los: LosResult | null;
  soil: SoilResult;
  admin: AdminResult;
}
