import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Calendar, DateData } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { MeetingScheduler } from '../../../src/components/MeetingScheduler';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Avatar } from '../../../src/components/ui/Avatar';
import { AnimatedPressable } from '../../../src/components/ui/AnimatedPressable';

type MeetingFilterTab = 'All' | 'Upcoming' | 'Today' | 'Pending' | 'Completed' | 'Cancelled';

export default function CalendarScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<MeetingFilterTab>('All');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showScheduler, setShowScheduler] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);

      // Fetch meetings
      // Founder sees all, others see meetings they organize or participate in
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select(`
          *,
          organizer:users!organizer_id(id, full_name, role, avatar_url),
          meeting_participants(user_id, users:users(id, full_name, role)),
          meeting_approvals(id, approver_id, sequence_order, status)
        `)
        .order('start_time', { ascending: true });

      if (meetingError) throw meetingError;

      const allMeetings = meetingData || [];
      setMeetings(allMeetings);

      // Count pending approvals for current user
      const pendingCount = allMeetings.filter(m => 
        m.status === 'Pending_Approval' && 
        m.meeting_approvals?.some((a: any) => a.status === 'Pending' && (a.approver_id === profile.id || profile.role === 'Founder'))
      ).length;
      setPendingApprovalsCount(pendingCount);

    } catch (error) {
      console.error('Error fetching meetings data:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    const channel = supabase
      .channel('meetings_realtime_center')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Filter meetings by active tab
  const filteredMeetings = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return meetings.filter(m => {
      const mDate = m.start_time ? m.start_time.split('T')[0] : '';
      const mEndDate = m.end_time ? new Date(m.end_time) : new Date(m.start_time);
      const isPast = mEndDate < now;

      switch (activeTab) {
        case 'Today':
          return mDate === todayStr;
        case 'Upcoming':
          return !isPast && m.status === 'Scheduled';
        case 'Pending':
          return m.status === 'Pending_Approval';
        case 'Completed':
          return m.status === 'Completed' || (isPast && m.status === 'Scheduled');
        case 'Cancelled':
          return m.status === 'Cancelled' || m.status === 'Rejected';
        case 'All':
        default:
          return true;
      }
    });
  }, [meetings, activeTab]);

  // Calendar marked dates (Meetings Only)
  const markedDates = useMemo(() => {
    const marked: any = {};
    marked[selectedDate] = { selected: true, selectedColor: Colors.primary, selectedTextColor: Colors.textInverse };

    meetings.forEach(m => {
      if (m.start_time) {
        const date = m.start_time.split('T')[0];
        if (!marked[date]) marked[date] = { dots: [] };
        if (!marked[date].dots) marked[date].dots = [];
        marked[date].dots.push({
          color: m.status === 'Pending_Approval' ? '#d97706' : Colors.primary,
          key: `meeting-${m.id}`,
        });
      }
    });

    return marked;
  }, [selectedDate, meetings]);

  const selectedDayMeetings = filteredMeetings.filter(m => m.start_time && m.start_time.startsWith(selectedDate));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      {/* Top Header Row */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Meetings & Calendar</Text>
          <Text style={styles.subtitle}>Coordinate and schedule meetings</Text>
        </View>

        <AnimatedPressable
          style={styles.newMeetingBtn}
          onPress={() => setShowScheduler(true)}
          scaleTo={0.96}
        >
          <Ionicons name="add" size={18} color={Colors.textInverse} />
          <Text style={styles.newMeetingBtnText}>
            {profile?.role === 'Employee' ? 'Request Meeting' : 'New Meeting'}
          </Text>
        </AnimatedPressable>
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {(['All', 'Upcoming', 'Today', 'Pending', 'Completed', 'Cancelled'] as MeetingFilterTab[]).map(tab => (
          <AnimatedPressable
            key={tab}
            style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
            onPress={() => setActiveTab(tab)}
            scaleTo={0.94}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'Pending' ? `Pending (${pendingApprovalsCount})` : tab}
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.mainScroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={Colors.primary} />}
      >
        {/* Calendar Widget */}
        <View style={styles.calendarCard}>
          <Calendar
            onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            markingType="multi-dot"
            theme={{
              backgroundColor: Colors.surface,
              calendarBackground: Colors.surface,
              textSectionTitleColor: Colors.textSecondary,
              selectedDayBackgroundColor: Colors.primary,
              selectedDayTextColor: Colors.textInverse,
              todayTextColor: Colors.primary,
              dayTextColor: Colors.textPrimary,
              textDisabledColor: Colors.textMuted,
              arrowColor: Colors.primary,
              monthTextColor: Colors.textPrimary,
              textMonthFontWeight: 'bold',
              textDayFontWeight: '500',
              textDayHeaderFontWeight: 'bold',
            }}
          />
        </View>

        {/* Selected Day / Filtered Meetings Section */}
        <View style={styles.agendaSection}>
          <View style={styles.agendaHeader}>
            <Text style={styles.agendaTitle}>
              {activeTab === 'All' ? `Meetings on ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : `${activeTab} Meetings`}
            </Text>
            <Text style={styles.agendaBadge}>
              {activeTab === 'All' ? selectedDayMeetings.length : filteredMeetings.length} meetings
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <>
              {(activeTab === 'All' ? selectedDayMeetings : filteredMeetings).length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="calendar-outline" size={36} color={Colors.borderStrong} />
                  <Text style={styles.emptyText}>No meetings scheduled for this filter.</Text>
                </View>
              ) : (
                (activeTab === 'All' ? selectedDayMeetings : filteredMeetings).map((m, idx) => {
                  const isConfirmed = m.status === 'Scheduled';
                  const isPending = m.status === 'Pending_Approval';
                  const isRejected = m.status === 'Rejected';
                  const isCancelled = m.status === 'Cancelled';
                  const sDate = new Date(m.start_time);
                  const eDate = new Date(m.end_time);

                  return (
                    <Animated.View
                      key={m.id}
                      entering={FadeInDown.duration(260).delay(Math.min(idx * 35, 280))}
                    >
                      <AnimatedPressable
                        style={[styles.meetingCard, isPending && styles.meetingCardPending]}
                        onPress={() => router.push(`/meeting/${m.id}` as any)}
                        scaleTo={0.98}
                      >
                        <View style={styles.cardTopRow}>
                          <View style={styles.platformBadge}>
                            <Ionicons name="videocam" size={12} color={Colors.primary} />
                            <Text style={styles.platformText}>{m.meeting_platform || 'Online'}</Text>
                          </View>
                          <View
                            style={[
                              styles.statusBadge,
                              isConfirmed && styles.statusConfirmed,
                              isPending && styles.statusPending,
                              (isRejected || isCancelled) && styles.statusDanger,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isConfirmed && { color: Colors.success },
                                isPending && { color: '#d97706' },
                                (isRejected || isCancelled) && { color: Colors.danger },
                              ]}
                            >
                              {m.status?.replace('_', ' ')}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.meetingCardTitle}>{m.title}</Text>
                        {m.description && <Text style={styles.meetingCardDesc} numberOfLines={2}>{m.description}</Text>}

                        <View style={styles.meetingFooterRow}>
                          <View style={styles.timeTag}>
                            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                            <Text style={styles.timeTagText}>
                              {sDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                              {eDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>

                          <View style={styles.organizerTag}>
                            <Avatar name={m.organizer?.full_name} size={20} />
                            <Text style={styles.organizerText}>{m.organizer?.full_name || 'Organizer'}</Text>
                          </View>
                        </View>
                      </AnimatedPressable>
                    </Animated.View>
                  );
                })
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Scheduler Modal */}
      <MeetingScheduler
        visible={showScheduler}
        onClose={() => setShowScheduler(false)}
        onSuccess={fetchData}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
    paddingBottom: Layout.spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },
  newMeetingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
    gap: 4,
  },
  newMeetingBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
    fontSize: 12,
  },
  tabsScroll: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    maxHeight: 50,
  },
  tabsContent: {
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 8,
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tabChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  mainScroll: {
    flex: 1,
  },
  calendarCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: Layout.spacing.lg,
    marginTop: Layout.spacing.md,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  agendaSection: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
    paddingBottom: 40,
  },
  agendaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  agendaTitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  agendaBadge: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    padding: 32,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
  },
  meetingCard: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 10,
  },
  meetingCardPending: {
    borderColor: '#fde68a',
    backgroundColor: '#fffdf5',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  platformText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
  },
  statusConfirmed: {
    backgroundColor: '#dcfce7',
  },
  statusPending: {
    backgroundColor: '#fef3c7',
  },
  statusDanger: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
  },
  meetingCardTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  meetingCardDesc: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  meetingFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeTagText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  organizerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  organizerText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.semiBold,
  },
});
