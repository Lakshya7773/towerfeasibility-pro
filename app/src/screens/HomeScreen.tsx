import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAppStore } from '../state/store';
import { listInstalledPacks } from '../data/DataPackManager';

export default function HomeScreen({ navigation }: any) {
  const { packs, setPacks, activePack } = useAppStore();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setPacks(await listInstalledPacks());
      } catch (e) {
        // Non-fatal: the Data packs screen can still be opened.
        console.warn('could not list packs', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [setPacks]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1e40af" />
        <Text style={s.cardMeta}>Loading data packs…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 20 }}>
      <Text style={s.title}>Tower Feasibility</Text>
      <Text style={s.tag}>Offline telecom tower site analysis</Text>

      <View style={s.card}>
        <Text style={s.cardH}>Status</Text>
        <Text style={s.cardB}>
          {activePack
            ? `Active pack: ${activePack.region_name}`
            : 'No active data pack'}
        </Text>
        <Text style={s.cardMeta}>{packs.length} pack(s) installed on device</Text>
      </View>

      <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Packs')}>
        <Text style={s.btnTxt}>Data packs</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btn, s.btnAlt, !activePack && s.btnDisabled]}
        disabled={!activePack}
        onPress={() => navigation.navigate('Map')}
      >
        <Text style={s.btnTxt}>Start site analysis</Text>
      </TouchableOpacity>

      <View style={s.features}>
        <Text style={s.cardH}>7 analysis dimensions</Text>
        {[
          'Population density',
          'Competitor tower density',
          'Nearby fiber / resources',
          'RoW compliance',
          'Line-of-sight / terrain',
          'Soil & foundation',
          'Administration & authority',
        ].map((f) => <Text key={f} style={s.feat}>• {f}</Text>)}
        <Text style={s.cardMeta}>Plus a professional PDF report</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#f8fafc' },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  tag: { color: '#64748b', marginBottom: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  cardH: { fontWeight: '800', color: '#1e40af', marginBottom: 6 },
  cardB: { color: '#0f172a', fontWeight: '600' },
  cardMeta: { color: '#94a3b8', fontSize: 11, marginTop: 6 },
  btn: {
    backgroundColor: '#1e40af', padding: 16, borderRadius: 10, alignItems: 'center',
    marginBottom: 10,
  },
  btnAlt: { backgroundColor: '#0f172a' },
  btnDisabled: { backgroundColor: '#cbd5e1' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  features: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  feat: { color: '#334155', fontSize: 13, marginVertical: 2 },
});
