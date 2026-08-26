import React from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SettingsItem {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  type: 'link' | 'toggle';
  value?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
}

export interface SettingsSection {
  title: string;
  items: SettingsItem[];
}

export const SettingsList = ({ sections }: { sections: SettingsSection[] }) => {
  return (
    <View style={styles.container}>
      {sections.map((section, index) => (
        <View key={index} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCard}>
            {section.items.map((item, itemIndex) => (
              <View key={item.id}>
                {item.type === 'link' ? (
                  <TouchableOpacity style={styles.item} onPress={item.onPress}>
                    <View style={styles.itemLeft}>
                      <Ionicons name={item.icon} size={20} color="#222222" style={styles.icon} />
                      <Text style={styles.itemTitle}>{item.title}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6B665F" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.item}>
                    <View style={styles.itemLeft}>
                      <Ionicons name={item.icon} size={20} color="#222222" style={styles.icon} />
                      <Text style={styles.itemTitle}>{item.title}</Text>
                    </View>
                    <Switch
                      value={item.value || false}
                      onValueChange={item.onToggle}
                      trackColor={{ false: '#E6DED1', true: '#222222' }}
                      thumbColor={'#FFF9F0'}
                      ios_backgroundColor="#E6DED1"
                    />
                  </View>
                )}
                {itemIndex < section.items.length - 1 && <View style={styles.separator} />}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B665F',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 16,
  },
  sectionCard: {
    backgroundColor: '#FFF9F0',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6DED1',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 16,
    color: '#222222',
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: '#E6DED1',
    marginLeft: 48,
  },
});
