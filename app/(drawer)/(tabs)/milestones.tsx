import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { ROIWidget } from '../../../src/components/ROIWidget';

export default function MilestonesHubScreen() {
  const { profile } = useAuth();
  const isFounder = profile?.role === 'Founder';
  
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isFounder);

  useEffect(() => {
    if (isFounder) {
      fetchDepartments();
    }
  }, [isFounder]);

  const fetchDepartments = async () => {
    setLoading(true);
    const { data } = await supabase.from('departments').select('id, name').order('name');
    if (data && data.length > 0) {
      setDepartments(data);
      setSelectedDeptId(data[0].id);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="trophy" size={28} color="#e1c37a" />
        <Text style={styles.headerTitle}>Milestones Hub</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e1c37a" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {isFounder && departments.length > 0 && (
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Select Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptList}>
                {departments.map(dept => (
                  <TouchableOpacity 
                    key={dept.id} 
                    style={[styles.deptChip, selectedDeptId === dept.id && styles.deptChipSelected]}
                    onPress={() => setSelectedDeptId(dept.id)}
                  >
                    <Text style={[styles.deptChipText, selectedDeptId === dept.id && styles.deptChipTextSelected]}>
                      {dept.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {(!isFounder || selectedDeptId) && (
            <ROIWidget overrideDepartmentId={isFounder ? (selectedDeptId || undefined) : undefined} />
          )}

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#0f141a" style={{marginRight: 10}} />
            <Text style={styles.infoText}>
              Milestones track department performance against set targets. Complete tasks to drive these metrics automatically.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f141a',
    marginLeft: 12,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 1,
  },
  deptList: {
    flexDirection: 'row',
  },
  deptChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
  },
  deptChipSelected: {
    backgroundColor: '#0f141a',
    borderColor: '#0f141a',
  },
  deptChipText: {
    color: '#0f141a',
    fontWeight: '600',
  },
  deptChipTextSelected: {
    color: '#e1c37a',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#e1c37a',
    padding: 20,
    marginHorizontal: 20,
    marginTop: 30,
    borderRadius: 16,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    color: '#0f141a',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
});
