import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAppStore } from '../state/store';
import {
  listInstalledPacks, deletePack, storageUsedBytes,
} from '../data/DataPackManager';
import type { PackManifest } from '../data/DataPackManager';
import { loadPack } from '../data/PackLoader';

export default function DataPackScreen({ navigation }: any) {
  const { packs, setPacks, setActivePack, setPackData, setLoadingPack } = useAppStore();
  const [used, setUsed] = React.useState<number>(0);

  const refresh = React.useCallback(async () => {
    const p = await listInstalledPacks();
    setPacks(p);
    setUsed(await storageUsedBytes());
  }, [setPacks]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const activate = async (region: string) => {
    setLoadingPack(true);
    try {
      const data = await loadPack(region);
      const manifest = packs.find((p) => p.region === region) ?? null;
      setActivePack(manifest);
      setPackData(data);
      navigation.navigate('Map');
    } catch (e: any) {
      Alert.alert('Failed to load pack', String(e?.message ?? e));
    } finally {
      setLoadingPack(false);
    }
  };

  const remove = (region: string) => {
    Alert.alert('Delete pack?', `Remove data-pack-${region} from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await deletePack(region); refresh(); },
      },
    ]);
  };

  /** Which capabilities this pack supports. */
  const capabilities = (m: PackManifest): string => {
    const paths = (m.files ?? []).map((f) => f.path).join(' ');
    const hasMap = paths.includes('base-map');
    const hasElev = paths.includes('elevation');
    const parts = ['towers', 'fiber', 'soil', 'population'];
    if (hasMap) parts.push('map');
    if (hasElev) parts.push('terrain/LoS');
    return parts.join(' · ');
  };

  return (
    <View style={s.wrap}>
      <Text style={s.h1}>Data Packs</Text>
      <Text style={s.sub}>
        {packs.length} installed · {(used / 1e6).toFixed(1)} MB used
      </Text>

      {packs.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No data packs installed</Text>
          <Text style={s.emptyBody}>
            Install a regional pack to run offline analysis.{'\n'}
            Bundled packs appear here automatically.
          </Text>
        </View>
      )}

      <FlatList
        data={packs}
        keyExtractor={(p) => p.region}
        renderItem={({ item }: { item: PackManifest }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{item.region_name}</Text>
              <Text style={s.cardMeta}>
                v{item.version} · {(item.files.reduce((a: number, f: { size: number }) => a + f.size, 0) / 1e6).toFixed(1)} MB
              </Text>
              <Text style={s.cardMeta}>
                bounds {item.bounds.min_lat.toFixed(1)}–{item.bounds.max_lat.toFixed(1)}°N,{' '}
                {item.bounds.min_lon.toFixed(1)}–{item.bounds.max_lon.toFixed(1)}°E
              </Text>
              <Text style={s.cardMeta}>{capabilities(item)}</Text>
            </View>
            <View style={s.actions}>
              <TouchableOpacity style={s.btn} onPress={() => activate(item.region)}>
                <Text style={s.btnTxt}>Open</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={() => remove(item.region)}>
                <Text style={s.btnTxt}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  h1: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  sub: { color: '#64748b', marginBottom: 12, fontSize: 13 },
  empty: { padding: 24, alignItems: 'center' },
  emptyTitle: { fontWeight: '700', color: '#334155', marginBottom: 4 },
  emptyBody: { color: '#94a3b8', textAlign: 'center', lineHeight: 18, fontSize: 12 },
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0',
  },
  cardTitle: { fontWeight: '700', fontSize: 16, color: '#0f172a' },
  cardMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
  actions: { justifyContent: 'center', gap: 6 },
  btn: {
    backgroundColor: '#1e40af', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 6, marginBottom: 6, minWidth: 74, alignItems: 'center',
  },
  btnDanger: { backgroundColor: '#dc2626' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
