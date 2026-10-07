import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { useAppStore } from '../state/store';
import { generateReportPdf, buildReportHtml } from '../report/ReportRenderer';

type Tab = 'preview' | 'export';

export default function ReportScreen({ navigation }: any) {
  const { report } = useAppStore();
  const [busy, setBusy] = React.useState(false);
  const [uri, setUri] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>('preview');

  if (!report) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>No report available.</Text>
        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Map')}>
          <Text style={s.btnTxt}>Back to map</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render the report exactly as it will appear in the PDF, so the user can
  // read it on device before exporting.
  const html = React.useMemo(() => {
    try {
      return buildReportHtml(report);
    } catch (e) {
      console.warn('report html failed', e);
      return null;
    }
  }, [report]);

  const generate = async () => {
    setBusy(true);
    try {
      const path = await generateReportPdf(report);
      setUri(path);
      Alert.alert('Report ready', `Saved to:\n${path}`);
    } catch (e: any) {
      Alert.alert('Generation failed', String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!uri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Feasibility report — ${report.metadata.siteName}`,
      });
    } catch (e: any) {
      Alert.alert('Share failed', String(e?.message ?? e));
    }
  };

  const r = report;
  return (
    <View style={s.wrap}>
      <Text style={s.h1}>Report</Text>
      <Text style={s.sub}>{r.metadata.siteName} · {r.metadata.date}</Text>

      <View style={s.tabs}>
        {(['preview', 'export'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabOn]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
              {t === 'preview' ? 'Preview' : 'Export'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'preview' ? (
        html ? (
          <WebView
            style={s.web}
            originWhitelist={['*']}
            source={{ html }}
            scalesPageToFit
          />
        ) : (
          <View style={s.center}>
            <Text style={s.muted}>Could not render the report preview.</Text>
          </View>
        )
      ) : (
        <View>
          <View style={s.preview}>
            <Text style={s.previewTitle}>Tower Feasibility Report</Text>
            <Text style={s.previewScore}>
              Technical screening score {r.executiveSummary.overallScore}/10
            </Text>
            <Text style={s.previewMeta}>20 sections · evidence &amp; provenance · confidence · limitations
              · commercial feasibility NOT assessed</Text>
          </View>

          <TouchableOpacity style={s.btnLg} onPress={generate} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Generate PDF</Text>}
          </TouchableOpacity>

          {uri && (
            <>
              <Text style={s.path} numberOfLines={3}>{uri}</Text>
              <TouchableOpacity style={[s.btnLg, s.btnShare]} onPress={share}>
                <Text style={s.btnTxt}>Share / Save</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#64748b' },
  h1: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  sub: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  tabs: {
    flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 8,
    padding: 3, marginBottom: 12,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabTxt: { color: '#64748b', fontWeight: '700', fontSize: 12 },
  tabTxtOn: { color: '#1e40af' },
  web: { flex: 1, backgroundColor: '#fff', borderRadius: 8 },
  preview: {
    backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20,
  },
  previewTitle: { fontWeight: '800', fontSize: 16, color: '#0f172a' },
  previewScore: { color: '#1e40af', fontWeight: '700', marginTop: 8 },
  previewMeta: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  btn: { backgroundColor: '#1e40af', padding: 12, borderRadius: 8 },
  btnLg: {
    backgroundColor: '#1e40af', padding: 16, borderRadius: 10, alignItems: 'center',
  },
  btnShare: { backgroundColor: '#16a34a', marginTop: 10 },
  btnTxt: { color: '#fff', fontWeight: '700' },
  path: { color: '#64748b', fontSize: 10, marginTop: 10 },
});
