/**
 * Layer toggle component for the map.
 *
 * Lets users switch overlay layers on/off: towers, fiber, soil, admin.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface LayerToggleProps {
  layers: { key: string; label: string; enabled: boolean; color: string }[];
  onToggle: (key: string) => void;
}

export default function LayerToggle({ layers, onToggle }: LayerToggleProps) {
  return (
    <View style={s.container}>
      {layers.map((l) => (
        <TouchableOpacity
          key={l.key}
          style={[s.chip, l.enabled && { backgroundColor: l.color, borderColor: l.color }]}
          onPress={() => onToggle(l.key)}
        >
          <View style={[s.dot, { backgroundColor: l.enabled ? '#fff' : l.color }]} />
          <Text style={[s.label, l.enabled && { color: '#fff' }]}>{l.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  label: { fontSize: 11, fontWeight: '600', color: '#334155' },
});
