import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppStore } from '../state/store';

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <View style={s.row}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{String(v)}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

export default function AnalysisScreen({ navigation }: any) {
  const { report, site } = useAppStore();

  if (!report || !site) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>No analysis yet.</Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Map')}>
          <Text style={s.btnTxt}>Pick a site</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const r = report;
  const s2 = r.executiveSummary;
  if (!s2) {
    // A malformed report must not white-screen the app.
    return (
      <View style={s.center}>
        <Text style={s.muted}>This report is incomplete.</Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Map')}>
          <Text style={s.btnTxt}>Run the analysis again</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const recColor =
    s2.recommendation === 'Go' ? '#16a34a'
      : s2.recommendation === 'Conditional' ? '#d97706' : '#dc2626';

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.h1}>{r.metadata.siteName}</Text>
      <Text style={s.sub}>
        {r.metadata.region} · {r.metadata.coordinates.lat.toFixed(5)},{' '}
        {r.metadata.coordinates.lon.toFixed(5)}
      </Text>

      <View style={s.scoreCard}>
        <Text style={s.score}>{s2.overallScore}/10</Text>
        <View style={[s.badge, { backgroundColor: recColor }]}>
          <Text style={s.badgeTxt}>{s2.recommendation}</Text>
        </View>
      </View>

      <Section title="Key findings">
        {s2.keyFindings.map((f: string, i: number) => (
          <Text key={i} style={s.li}>• {f}</Text>
        ))}
      </Section>

      {s2.criticalIssues.length > 0 && (
        <Section title="Critical issues">
          {s2.criticalIssues.map((f: string, i: number) => (
            <Text key={i} style={[s.li, { color: '#dc2626' }]}>⚠ {f}</Text>
          ))}
        </Section>
      )}

      <Section title="1 · Population">
        {r.populationAnalysis ? (
          <>
            <Row k="Within 2 km" v={r.populationAnalysis.populationWithin2km.toLocaleString()} />
            <Row k="Within 5 km" v={r.populationAnalysis.populationWithin5km.toLocaleString()} />
            <Row k="Within 10 km" v={r.populationAnalysis.populationWithin10km.toLocaleString()} />
            <Row k="Density" v={`${r.populationAnalysis.densityPerKm2.toLocaleString()} /km²`} />
            <Row k="Class" v={r.populationAnalysis.densityClassification} />
            <Text style={s.note}>
              {r.populationAnalysis.source === 'tower-proxy'
                ? 'Estimated from tower density — no population raster in this pack.'
                : 'WorldPop 2020 (1 km), masked to state.'}
            </Text>
          </>
        ) : (
          <Text style={s.note}>Population data is not in this pack.</Text>
        )}
      </Section>

      <Section title="2 · Competitor towers">
        {r.towerAnalysis ? (
          <>
            <Row k="Within 1 km" v={r.towerAnalysis.towersWithin1km} />
            <Row k="Within 2 km" v={r.towerAnalysis.towersWithin2km} />
            <Row k="Within 5 km" v={r.towerAnalysis.towersWithin5km} />
            <Row k="Density" v={`${r.towerAnalysis.densityPerKm2} /km²`} />
            <Row k="Saturation" v={r.towerAnalysis.saturationClassification} />
            <Row k="Co-location" v={r.towerAnalysis.colocationOpportunity ? 'Yes' : 'No'} />
          </>
        ) : (
          <Text style={s.note}>Tower data is not in this pack.</Text>
        )}
      </Section>

      <Section title="3 · Resources">
        {r.resourceAnalysis?.nearestFiber ? (
          <>
            <Row
              k="Nearest fiber"
              v={r.resourceAnalysis.nearestFiber.distanceKm >= 50
                ? 'none within 50 km'
                : `${r.resourceAnalysis.nearestFiber.distanceKm} km`}
            />
            <Row k="Accessibility" v={r.resourceAnalysis.fiberAccessibility} />
            <Row k="Resource score" v={`${r.resourceAnalysis.resourceScore}/5`} />
          </>
        ) : (
          <Text style={s.note}>Fiber data is not in this pack.</Text>
        )}
      </Section>

      <Section title="4 · RoW compliance">
        {r.rowAnalysis ? (
          <>
            <Row k="Application fee" v={`₹${r.rowAnalysis.applicationFee.toLocaleString()}`} />
            <Row k="Estimated total" v={`₹${r.rowAnalysis.estimatedTotalCost.toLocaleString()}`} />
            <Row k="Approval timeline" v={`${r.rowAnalysis.approvalTimelineDays} days`} />
            <Row k="Deemed approval" v={`${r.rowAnalysis.deemedApprovalDays} days`} />
          </>
        ) : (
          <Text style={s.note}>Right-of-way rules are not in this pack.</Text>
        )}
      </Section>

      <Section title="5 · Soil">
        {r.soilAnalysis ? (
          <>
            <Row k="FAO code" v={r.soilAnalysis.faoCode ?? '—'} />
            <Row k="Soil type" v={r.soilAnalysis.soilType} />
            <Row k="Foundation" v={r.soilAnalysis.foundationSuitability} />
            <Text style={s.note}>{r.soilAnalysis.foundationNote}</Text>
          </>
        ) : (
          <Text style={s.note}>Soil data is not in this pack.</Text>
        )}
      </Section>

      <Section title="6 · Administration">
        {r.adminAnalysis ? (
          <>
            <Row k="State" v={r.adminAnalysis.state} />
            <Row k="District" v={r.adminAnalysis.district ?? '—'} />
            <Row k="Authority" v={r.adminAnalysis.governingAuthority} />
          </>
        ) : (
          <Text style={s.note}>Administrative data is not in this pack.</Text>
        )}
      </Section>

      <Section title="7 · Line of sight">
        {r.losAnalysis ? (
          <>
            <Row k="Status" v={r.losAnalysis.losStatus} />
            <Row k="Distance" v={`${r.losAnalysis.distanceKm} km`} />
            <Row k="Recommended height" v={`${r.losAnalysis.recommendedTowerHeight} m`} />
          </>
        ) : (
          <Text style={s.note}>
            Elevation data is not in this pack — LoS analysis unavailable.
          </Text>
        )}
      </Section>

      <TouchableOpacity style={s.btnLg} onPress={() => navigation.navigate('Report')}>
        <Text style={s.btnTxt}>View / export PDF report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#64748b' },
  h1: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  scoreCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#fff',
    padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  score: { fontSize: 36, fontWeight: '800', color: '#1e40af' },
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  badgeTxt: { color: '#fff', fontWeight: '800' },
  section: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  h2: { fontWeight: '800', color: '#1e40af', marginBottom: 8, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  k: { color: '#64748b', fontSize: 12, flex: 1 },
  v: { fontWeight: '700', color: '#0f172a', fontSize: 12, flex: 1, textAlign: 'right' },
  li: { color: '#334155', fontSize: 12, marginVertical: 2, lineHeight: 17 },
  note: { color: '#94a3b8', fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  btn: { backgroundColor: '#1e40af', padding: 12, borderRadius: 8 },
  btnLg: {
    backgroundColor: '#0f172a', padding: 16, borderRadius: 10, marginTop: 20,
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '700' },
});
