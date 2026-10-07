import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator, StyleSheet, TouchableOpacity,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import DataPackScreen from '../screens/DataPackScreen';
import MapScreen from '../screens/MapScreen';
import AnalysisScreen from '../screens/AnalysisScreen';
import ReportScreen from '../screens/ReportScreen';
import { installBundledPacks, retryInstall } from '../data/bootstrap';
import { listInstalledPacks, verifyInstalledPack } from '../data/DataPackManager';
import { useAppStore } from '../state/store';

export type RootStackParamList = {
  Home: undefined;
  Packs: undefined;
  Map: undefined;
  Analysis: undefined;
  Report: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * First run: install the data pack(s) shipped inside the APK so the app is
 * usable offline immediately. Runs once; subsequent launches see the packs
 * already installed and skip the copy.
 *
 * On later launches, installed packs are re-verified against the manifest
 * (size + MD5) so a file truncated after install is detected rather than
 * silently producing wrong analysis.
 */
function useBootstrap() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Preparing offline data…');
  const [warning, setWarning] = useState<string | null>(null);
  const [failedRegion, setFailedRegion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setPacks, setActivePack } = useAppStore();

  const loadPacks = useCallback(async () => {
    const packs = await listInstalledPacks();
    setPacks(packs);
    if (packs.length && !useAppStore.getState().activePack) {
      setActivePack(packs[0]);
    }
    return packs;
  }, [setPacks, setActivePack]);

  /** Verify each installed pack; warn on the first that fails. */
  const checkIntegrity = useCallback(async (regions: string[]) => {
    for (const region of regions) {
      const issues = await verifyInstalledPack(region);
      if (issues.length) {
        setWarning(
          `Data pack "${region}" failed its integrity check ` +
            `(${issues[0].file}: ${issues[0].detail}). Tap Retry to reinstall it.`,
        );
        setFailedRegion(region);
        return;
      }
    }
    setWarning(null);
    setFailedRegion(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setStatus('Installing offline data pack…');
        const res = await installBundledPacks();
        if (res.failed.length) {
          // Surface it: otherwise the app just looks empty with no reason why.
          setWarning(
            `Data pack failed to install (${res.failed[0].region}): ${res.failed[0].error}. ` +
              'Tap Retry to try again.',
          );
          setFailedRegion(res.failed[0].region === '*' ? null : res.failed[0].region);
        } else if (res.corrupt.length) {
          setWarning(
            `Data pack "${res.corrupt[0].region}" failed its integrity check ` +
              `(${res.corrupt[0].file}: ${res.corrupt[0].detail}). Tap Retry to reinstall it.`,
          );
          setFailedRegion(res.corrupt[0].region);
        } else {
          setWarning(null);
        }
        const packs = await loadPacks();
        // Re-verify packs that were already installed (bootstrap skips those).
        if (packs.length) {
          await checkIntegrity(packs.map((p) => p.region));
        }
      } catch (e) {
        // non-fatal: user can still open the Data Packs screen
        setWarning(`Startup problem: ${e instanceof Error ? e.message : String(e)}`);
        console.warn('bootstrap failed', e);
      } finally {
        setReady(true);
      }
    })();
  }, [loadPacks, checkIntegrity]);

  /** User-initiated retry: reinstall the failed pack, or force-reinstall all. */
  const retry = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStatus('Reinstalling offline data pack…');
    try {
      if (failedRegion) {
        const res = await retryInstall(failedRegion);
        if (res.failed.length) {
          setWarning(
            `Retry failed (${res.failed[0].region}): ${res.failed[0].error}`,
          );
          return;
        }
      } else {
        // No specific region: force a clean reinstall of everything bundled.
        const res = await installBundledPacks({ force: true });
        if (res.failed.length) {
          setWarning(`Retry failed: ${res.failed[0].error}`);
          return;
        }
      }
      setWarning(null);
      setFailedRegion(null);
      await loadPacks();
    } catch (e) {
      setWarning(`Retry failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, failedRegion, loadPacks]);

  return { ready, status, warning, retry, busy };
}

export default function App() {
  const { ready, status, warning, retry, busy } = useBootstrap();

  if (!ready) {
    return (
      <View style={s.splash}>
        <Text style={s.splashTitle}>TowerFeasibility Pro</Text>
        <ActivityIndicator size="large" color="#1e40af" style={{ marginTop: 16 }} />
        <Text style={s.splashText}>{status}</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {warning ? (
        <View style={s.warnBar}>
          <Text style={s.warnText}>{warning}</Text>
          <TouchableOpacity
            style={[s.retryBtn, busy && s.retryBtnDisabled]}
            onPress={retry}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Retry data pack installation"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.retryText}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#1e40af' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'TowerFeasibility Pro' }} />
        <Stack.Screen name="Packs" component={DataPackScreen} options={{ title: 'Data Packs' }} />
        <Stack.Screen name="Map" component={MapScreen} options={{ title: 'Site' }} />
        <Stack.Screen name="Analysis" component={AnalysisScreen} options={{ title: 'Analysis' }} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Report' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  splash: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f8fafc', padding: 24,
  },
  splashTitle: { fontSize: 22, fontWeight: '800', color: '#1e40af' },
  splashText: { marginTop: 12, color: '#64748b' },
  warnBar: {
    backgroundColor: '#fef3c7', paddingVertical: 8, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  warnText: { color: '#92400e', fontSize: 12, flex: 1 },
  retryBtn: {
    backgroundColor: '#b45309', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 6, minWidth: 64, alignItems: 'center',
  },
  retryBtnDisabled: { opacity: 0.6 },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
