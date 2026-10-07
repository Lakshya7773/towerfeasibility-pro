import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
  TextInput,
} from 'react-native';
import { useAppStore } from '../state/store';
import { runAnalysis } from '../analysis/runAnalysis';
import type { Site } from '../models';
import MapView from '../components/map/MapView';

const RADII = [1, 2, 5, 10];

/**
 * Map screen — the offline vector map plus site picking.
 *
 * The map is a MapLibre GL JS WebView fed by the pack's PMTiles basemap, so it
 * renders with no network. Tapping the map moves the site; the coverage radius
 * and nearby competitor towers are drawn as overlays.
 */
export default function MapScreen({ navigation }: any) {
  const { activePack, packData, setSite, setReport, analyzing, setAnalyzing, setError } =
    useAppStore();

  const [lat, setLat] = useState(26.9124);
  const [lon, setLon] = useState(75.7873);
  const [latText, setLatText] = useState('26.9124');
  const [lonText, setLonText] = useState('75.7873');
  const [radiusKm, setRadiusKm] = useState(5);
  const [towers, setTowers] = useState<{ lat: number; lon: number; operator?: string }[]>([]);
  const [loadingTowers, setLoadingTowers] = useState(false);

  // Load competitor towers near the site from the pack's SQLite index.
  const loadTowers = useCallback(async () => {
    if (!packData?.towersDb) {
      setTowers([]);
      return;
    }
    setLoadingTowers(true);
    try {
      const d = radiusKm / 111.0;
      const dLon = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));
      const rows = await packData.towersDb.getAllAsync<{
        lat: number; lon: number; operator: string | null;
      }>(
        `SELECT lat, lon, operator FROM towers
         WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
         LIMIT 800`,
        [lat - d, lat + d, lon - dLon, lon + dLon],
      );
      setTowers(rows.map((r) => ({ lat: r.lat, lon: r.lon, operator: r.operator ?? '' })));
    } catch (e) {
      // overlay is best-effort; analysis still works
      setTowers([]);
    } finally {
      setLoadingTowers(false);
    }
  }, [packData, lat, lon, radiusKm]);

  useEffect(() => {
    if (activePack && packData) loadTowers();
  }, [activePack, packData, loadTowers]);

  const onMapPress = useCallback((newLat: number, newLon: number) => {
    setLat(newLat);
    setLon(newLon);
    setLatText(newLat.toFixed(6));
    setLonText(newLon.toFixed(6));
  }, []);

  const applyTyped = useCallback(() => {
    const a = parseFloat(latText);
    const o = parseFloat(lonText);
    if (Number.isFinite(a) && Number.isFinite(o)) {
      setLat(a);
      setLon(o);
    } else {
      Alert.alert('Invalid coordinates', 'Enter numeric latitude and longitude.');
    }
  }, [latText, lonText]);

  const analyze = async () => {
    if (!activePack) return;
    const site: Site = {
      id: `${Date.now()}`,
      name: `${activePack.region_name} site`,
      lat,
      lon,
      createdAt: new Date().toISOString(),
    };
    setAnalyzing(true);
    setError(null);
    try {
      setSite(site);
      const report = await runAnalysis({
        site, region: activePack.region, state: activePack.state, pack: packData!,
      });
      setReport(report);
      navigation.navigate('Analysis');
    } catch (e: any) {
      setError(String(e?.message ?? e));
      Alert.alert('Analysis failed', String(e?.message ?? e));
    } finally {
      setAnalyzing(false);
    }
  };

  if (!activePack || !packData) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>No active data pack.</Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Packs')}>
          <Text style={s.btnTxt}>Go to Data Packs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <View style={s.mapBox}>
        <MapView
          region={activePack.region}
          siteLat={lat}
          siteLon={lon}
          radiusKm={radiusKm}
          towers={towers}
          onMapPress={onMapPress}
        />
        <View style={s.mapBadge} pointerEvents="none">
          <Text style={s.mapBadgeTxt}>
            {activePack.region_name} · {towers.length} towers in view
            {loadingTowers ? ' …' : ''}
          </Text>
        </View>
      </View>

      <ScrollView style={s.panel} contentContainerStyle={{ padding: 14 }}>
        <Text style={s.row}>
          <Text style={s.k}>Lat </Text>{lat.toFixed(5)}   <Text style={s.k}>Lon </Text>{lon.toFixed(5)}
        </Text>

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={latText}
            onChangeText={setLatText}
            keyboardType="numeric"
            placeholder="lat"
          />
          <TextInput
            style={s.input}
            value={lonText}
            onChangeText={setLonText}
            keyboardType="numeric"
            placeholder="lon"
          />
          <TouchableOpacity style={s.applyBtn} onPress={applyTyped}>
            <Text style={s.applyTxt}>Go</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.label}>Coverage radius</Text>
        <View style={s.chips}>
          {RADII.map((r) => (
            <TouchableOpacity
              key={r}
              style={[s.chip, radiusKm === r && s.chipOn]}
              onPress={() => setRadiusKm(r)}
            >
              <Text style={[s.chipTxt, radiusKm === r && s.chipTxtOn]}>{r} km</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.btnLg} onPress={analyze} disabled={analyzing}>
          {analyzing
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>Run feasibility analysis</Text>}
        </TouchableOpacity>
        <Text style={s.hint}>Tap the map to move the site, then run the analysis.</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#64748b' },
  mapBox: { height: '52%', position: 'relative' },
  mapBadge: {
    position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  mapBadgeTxt: { fontSize: 11, color: '#334155', fontWeight: '600' },
  panel: { flex: 1 },
  row: { fontSize: 15, color: '#0f172a', fontWeight: '700' },
  k: { color: '#64748b', fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, padding: 10, fontSize: 14, color: '#0f172a',
  },
  applyBtn: { backgroundColor: '#1e40af', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 8 },
  applyTxt: { color: '#fff', fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 14 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 6 },
  chip: {
    backgroundColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14,
  },
  chipOn: { backgroundColor: '#1e40af' },
  chipTxt: { color: '#334155', fontWeight: '600', fontSize: 12 },
  chipTxtOn: { color: '#fff' },
  btn: { backgroundColor: '#1e40af', padding: 12, borderRadius: 8 },
  btnLg: {
    backgroundColor: '#1e40af', padding: 16, borderRadius: 10, marginTop: 18,
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 8 },
});
