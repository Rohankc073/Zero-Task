import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFounderData } from '../../hooks/useDashboards';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useCallback } from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { ROIWidget } from '../ROIWidget';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

export function FounderDashboard() {
  const router = useRouter();
  const { 
    systemVelocity, pendingApprovals, loading,
    mrr, activeWorkspaces, profitMargin, clientRoi, recentActivity, refetch
  } = useFounderData();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );
  
  const [searchQuery, setSearchQuery] = useState('');



  // Toggleable state for testing Op Margin
  const [testMargin, setTestMargin] = useState(70);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  // Format currency
  const formattedMrr = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(mrr);

  return (
    <View style={styles.container}>
      {pendingApprovals > 0 && (
        <TouchableOpacity 
          style={styles.alertBanner} 
          onPress={() => router.push('/approvals')}
        >
          <Ionicons name="warning-outline" size={24} color="#f7f6f2" />
          <Text style={styles.alertText}>Action Required: {pendingApprovals} Pending Department Head Registrations</Text>
          <Ionicons name="chevron-forward" size={20} color="#f7f6f2" />
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Global search projects or tasks..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Phase 1: Financial & Growth Command Center */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Command Center</Text>
          
          {/* Target Tracker & Margin Row */}
          <View style={styles.dashboardRow}>
            {/* The 365-Day Target Tracker (SVG Ring) */}
            <View style={[styles.targetCard, { flex: 1.5, marginRight: 15 }]}>
              <Text style={styles.targetTitle}>Annual Target ($1M)</Text>
              <View style={styles.ringContainer}>
                <Svg height="140" width="140" viewBox="0 0 140 140">
                  <G rotation="-90" origin="70, 70">
                    <Circle
                      cx="70"
                      cy="70"
                      r="60"
                      stroke="#f3f4f6"
                      strokeWidth="12"
                      fill="transparent"
                    />
                    <Circle
                      cx="70"
                      cy="70"
                      r="60"
                      stroke="#e1c37a"
                      strokeWidth="12"
                      fill="transparent"
                      strokeDasharray={2 * Math.PI * 60}
                      strokeDashoffset={(2 * Math.PI * 60) - ((2 * Math.PI * 60) * Math.min(mrr / 1000000, 1))}
                      strokeLinecap="round"
                    />
                  </G>
                </Svg>
                <View style={styles.ringTextContainer}>
                  <Text style={styles.ringPercent}>{Math.round((mrr / 1000000) * 100)}%</Text>
                </View>
              </View>
              <Text style={styles.deltaText}>
                Delta: <Text style={{color: '#ef4444'}}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(1000000 - mrr)}</Text>
              </Text>
            </View>

            {/* Margin Health Indicator */}
            <TouchableOpacity 
              style={[
                styles.targetCard, 
                { flex: 1 }, 
                testMargin < 70 && { borderColor: '#ef4444', borderWidth: 2 }
              ]}
              onPress={() => setTestMargin(prev => prev === 70 ? 65 : 70)}
              activeOpacity={0.8}
            >
              <Text style={styles.targetTitle}>Op. Margin</Text>
              <View style={styles.marginContainer}>
                <Ionicons 
                  name={testMargin >= 70 ? "trending-up" : "warning"} 
                  size={36} 
                  color={testMargin >= 70 ? "#e1c37a" : "#ef4444"} 
                />
                <Text style={[styles.marginValue, testMargin < 70 && { color: '#ef4444' }]}>
                  {testMargin}%
                </Text>
                <Text style={styles.marginSubtitle}>Target: 70%</Text>
                <Text style={{fontSize: 10, color: '#aaa', marginTop: 4}}>(Tap to test)</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Value-Based ROI Widget */}
          <View style={styles.roiWidget}>
            <View style={styles.roiHeader}>
              <Ionicons name="flash" size={24} color="#e1c37a" />
              <Text style={styles.roiTitle}>System Velocity & Client ROI</Text>
            </View>
            <View style={styles.roiMetrics}>
              <View style={styles.roiMetricBox}>
                <Text style={styles.roiLabel}>Time Saved</Text>
                <Text style={styles.roiValue}>{clientRoi} Hrs</Text>
              </View>
              <View style={styles.roiDivider} />
              <View style={styles.roiMetricBox}>
                <Text style={styles.roiLabel}>Est. Value Generated</Text>
                <Text style={styles.roiValueGold}>${(clientRoi * 150).toLocaleString()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Phase 2: Client/Workspace Health Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Client Activity</Text>
          {recentActivity.length === 0 ? (
            <Text style={styles.emptyText}>No recent client activity.</Text>
          ) : (
            recentActivity.map((project: any) => (
              <View key={project.id} style={styles.clientCard}>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{project.name}</Text>
                  <View style={styles.managerRow}>
                    <View style={styles.managerAvatar}>
                      <Text style={styles.managerAvatarText}>
                        {project.owner?.full_name ? project.owner.full_name.substring(0,1).toUpperCase() : 'U'}
                      </Text>
                    </View>
                    <Text style={styles.managerName}>{project.owner?.full_name || 'Unknown'}</Text>
                  </View>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {project.status === 'Active' ? 'Healthy' : project.status}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>



      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  alertBanner: {
    flexDirection: 'row',
    backgroundColor: '#0f141a',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertText: {
    color: '#f7f6f2',
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    height: 50,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#e1c37a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#0f141a',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 15,
  },
  dashboardRow: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  targetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  targetTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 10,
    textAlign: 'center',
  },
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 140,
    width: 140,
  },
  ringTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0f141a',
  },
  deltaText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  marginContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marginValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0f141a',
    marginVertical: 8,
  },
  marginSubtitle: {
    fontSize: 12,
    color: '#666',
    fontWeight: 'bold',
  },
  roiWidget: {
    backgroundColor: '#0f141a',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  roiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  roiTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f7f6f2',
    marginLeft: 8,
  },
  roiMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roiMetricBox: {
    flex: 1,
  },
  roiDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
    marginHorizontal: 15,
  },
  roiLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  roiValue: {
    color: '#f7f6f2',
    fontSize: 24,
    fontWeight: 'bold',
  },
  roiValueGold: {
    color: '#e1c37a',
    fontSize: 24,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  clientCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#e1c37a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 6,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  managerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e1c37a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  managerAvatarText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f141a',
  },
  managerName: {
    fontSize: 13,
    color: '#666',
  },
  statusBadge: {
    backgroundColor: '#e6ffe6',
    borderColor: '#33cc33',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#33cc33',
  },
  accordionHeader: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 10,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f141a',
    marginLeft: 10,
  },
  accordionContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  configForm: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 14,
    color: '#0f141a',
  },
  secureInputContainer: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center',
  },
  secureInput: {
    flex: 1,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 14,
    color: '#0f141a',
  },
  eyeIcon: {
    padding: 12,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#e1c37a',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f141a',
    marginLeft: 8,
  }
});
