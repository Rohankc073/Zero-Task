import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ViewStyle,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, DateData } from 'react-native-calendars';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Typography, Layout } from '../../theme/tokens';

export type Period =
  | 'All Time'
  | 'Last 7 Days'
  | 'Last 14 Days'
  | 'Last 1 Month'
  | 'Last 3 Months'
  | 'Last 6 Months'
  | 'Last 9 Months'
  | 'Last 1 Year'
  | 'This Week'
  | 'This Month'
  | 'Last 30 Days'
  | string;

const PERIODS: Period[] = [
  'All Time',
  'Last 7 Days',
  'Last 14 Days',
  'Last 1 Month',
  'Last 3 Months',
  'Last 6 Months',
  'Last 9 Months',
  'Last 1 Year',
];

interface PeriodSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
  style?: ViewStyle;
}

export function formatPeriodLabel(period: string): string {
  if (!period || period === 'All Time') return 'All Time';
  if (period.startsWith('Custom:')) {
    const rangeStr = period.replace('Custom:', '').trim();
    const parts = rangeStr.split(' to ');
    if (parts.length === 2 && parts[0] && parts[1]) {
      try {
        const d1 = new Date(parts[0].trim() + 'T00:00:00');
        const d2 = new Date(parts[1].trim() + 'T00:00:00');
        const f1 = d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const f2 = d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${f1} - ${f2}`;
      } catch {
        return rangeStr;
      }
    }
  }
  return period;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  value,
  onChange,
  style,
}) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');

  // Custom date selection state (YYYY-MM-DD)
  const todayStr = new Date().toISOString().split('T')[0];
  const [fromDateStr, setFromDateStr] = useState<string>(todayStr);
  const [toDateStr, setToDateStr] = useState<string>(todayStr);

  // Native picker state
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  // Sync state when modal opens or value changes
  useEffect(() => {
    if (typeof value === 'string' && value.startsWith('Custom:')) {
      const parts = value.replace('Custom:', '').trim().split(' to ');
      if (parts.length === 2 && parts[0] && parts[1]) {
        setFromDateStr(parts[0].trim());
        setToDateStr(parts[1].trim());
        setActiveTab('custom');
      }
    }
  }, [value, open]);

  // Calendar Day Press handler
  const handleDayPress = (day: DateData) => {
    const clickedStr = day.dateString;
    if (!fromDateStr || (fromDateStr && toDateStr && fromDateStr !== toDateStr)) {
      // First click or reset: set From date
      setFromDateStr(clickedStr);
      setToDateStr(clickedStr);
    } else if (fromDateStr && (!toDateStr || toDateStr === fromDateStr)) {
      if (clickedStr >= fromDateStr) {
        // Second click after From date: set To date
        setToDateStr(clickedStr);
      } else {
        // Earlier date clicked: reset From date to this new date
        setFromDateStr(clickedStr);
        setToDateStr(clickedStr);
      }
    }
  };

  // Generate markedDates object for react-native-calendars
  const getMarkedDates = () => {
    if (!fromDateStr) return {};
    const marked: any = {};

    if (fromDateStr === toDateStr || !toDateStr) {
      marked[fromDateStr] = {
        selected: true,
        startingDay: true,
        endingDay: true,
        color: Colors.primary,
        textColor: '#FFFFFF',
      };
      return marked;
    }

    marked[fromDateStr] = {
      selected: true,
      startingDay: true,
      color: Colors.primary,
      textColor: '#FFFFFF',
    };

    marked[toDateStr] = {
      selected: true,
      endingDay: true,
      color: Colors.primary,
      textColor: '#FFFFFF',
    };

    let curr = new Date(fromDateStr + 'T00:00:00');
    const end = new Date(toDateStr + 'T00:00:00');
    curr.setDate(curr.getDate() + 1);

    while (curr < end) {
      const dateString = curr.toISOString().split('T')[0];
      marked[dateString] = {
        selected: true,
        color: Colors.primaryLight,
        textColor: Colors.primary,
      };
      curr.setDate(curr.getDate() + 1);
    }

    return marked;
  };

  const handleApplyCustom = () => {
    if (!fromDateStr || !toDateStr) return;
    const finalFrom = fromDateStr <= toDateStr ? fromDateStr : toDateStr;
    const finalTo = fromDateStr <= toDateStr ? toDateStr : fromDateStr;
    onChange(`Custom: ${finalFrom} to ${finalTo}`);
    setOpen(false);
  };

  const handleClearAllTime = () => {
    onChange('All Time');
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
        <Text style={styles.label}>{formatPeriodLabel(value)}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={e => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Mode Switcher Tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'presets' && styles.tabActive]}
                onPress={() => setActiveTab('presets')}
              >
                <Text style={[styles.tabText, activeTab === 'presets' && styles.tabTextActive]}>
                  Presets
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'custom' && styles.tabActive]}
                onPress={() => setActiveTab('custom')}
              >
                <Text style={[styles.tabText, activeTab === 'custom' && styles.tabTextActive]}>
                  Custom Range (From - To)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab 1: Quick Presets */}
            {activeTab === 'presets' && (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {PERIODS.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.menuItem, value === p && styles.menuItemActive]}
                    onPress={() => {
                      onChange(p);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.menuItemText, value === p && styles.menuItemTextActive]}>
                      {p}
                    </Text>
                    {value === p && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Tab 2: Custom Range with Calendar & Inputs */}
            {activeTab === 'custom' && (
              <View>
                {/* From / To Date Selection Cards */}
                <View style={styles.dateCardsRow}>
                  <TouchableOpacity
                    style={[styles.dateCard, styles.dateCardActive]}
                    onPress={() => setShowFromPicker(true)}
                  >
                    <Text style={styles.dateCardLabel}>FROM DATE</Text>
                    <View style={styles.dateCardValueRow}>
                      <Text style={styles.dateCardValue}>{fromDateStr || 'Select'}</Text>
                      <Ionicons name="calendar" size={14} color={Colors.primary} />
                    </View>
                  </TouchableOpacity>

                  <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} style={{ marginHorizontal: 4 }} />

                  <TouchableOpacity
                    style={[styles.dateCard, styles.dateCardActive]}
                    onPress={() => setShowToPicker(true)}
                  >
                    <Text style={styles.dateCardLabel}>TO DATE</Text>
                    <View style={styles.dateCardValueRow}>
                      <Text style={styles.dateCardValue}>{toDateStr || 'Select'}</Text>
                      <Ionicons name="calendar" size={14} color={Colors.primary} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Native Date Picker Triggers */}
                {showFromPicker && (
                  <DateTimePicker
                    value={fromDateStr ? new Date(fromDateStr + 'T00:00:00') : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={(event, selectedDate) => {
                      setShowFromPicker(Platform.OS === 'ios');
                      if (selectedDate) {
                        const str = selectedDate.toISOString().split('T')[0];
                        setFromDateStr(str);
                        if (!toDateStr || str > toDateStr) {
                          setToDateStr(str);
                        }
                      }
                    }}
                    onDismiss={() => setShowFromPicker(false)}
                  />
                )}

                {showToPicker && (
                  <DateTimePicker
                    value={toDateStr ? new Date(toDateStr + 'T00:00:00') : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={(event, selectedDate) => {
                      setShowToPicker(Platform.OS === 'ios');
                      if (selectedDate) {
                        const str = selectedDate.toISOString().split('T')[0];
                        setToDateStr(str);
                        if (!fromDateStr || str < fromDateStr) {
                          setFromDateStr(str);
                        }
                      }
                    }}
                    onDismiss={() => setShowToPicker(false)}
                  />
                )}

                {/* Calendar Day Picker */}
                <View style={styles.calendarContainer}>
                  <Calendar
                    enableSwipeMonths={true}
                    markingType={'period'}
                    markedDates={getMarkedDates()}
                    onDayPress={handleDayPress}
                    theme={{
                      todayTextColor: Colors.primary,
                      arrowColor: Colors.primary,
                      monthTextColor: Colors.textPrimary,
                      textMonthFontFamily: Typography.fontFamily.bold,
                      textDayHeaderFontFamily: Typography.fontFamily.medium,
                      textDayFontFamily: Typography.fontFamily.regular,
                      textMonthFontSize: 13,
                      textDayFontSize: 12,
                      textDayHeaderFontSize: 10,
                      'stylesheet.calendar.header': {
                        header: {
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          paddingLeft: 6,
                          paddingRight: 6,
                          marginTop: 0,
                          alignItems: 'center',
                        },
                        monthText: {
                          fontSize: 13,
                          fontFamily: Typography.fontFamily.bold,
                          color: Colors.textPrimary,
                          margin: 2,
                        },
                      },
                      'stylesheet.day.basic': {
                        base: {
                          width: 26,
                          height: 24,
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                        text: {
                          marginTop: 2,
                          fontSize: 11,
                          fontFamily: Typography.fontFamily.regular,
                          color: Colors.textPrimary,
                        },
                      },
                    } as any}
                  />
                </View>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.clearBtn} onPress={handleClearAllTime}>
                    <Text style={styles.clearBtnText}>All Time</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.applyBtn} onPress={handleApplyCustom}>
                    <Text style={styles.applyBtnText}>Apply Date Range</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs + 2,
    ...Layout.shadow.card,
  },
  label: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: Layout.spacing.xs,
  },
  menu: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    width: '100%',
    maxWidth: 360,
    ...Layout.shadow.modal,
    overflow: 'hidden',
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    marginBottom: 8,
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.md,
    padding: 2,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Layout.radius.sm,
  },
  tabActive: {
    backgroundColor: Colors.surface,
    ...Layout.shadow.card,
  },
  tabText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.md,
    borderRadius: Layout.radius.md,
  },
  menuItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  menuItemText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  menuItemTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },

  // Custom Range Styles
  dateCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateCard: {
    flex: 1,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  dateCardActive: {
    borderColor: Colors.primary + '60',
    backgroundColor: Colors.primaryLight + '50',
  },
  dateCardLabel: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  dateCardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateCardValue: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  calendarContainer: {
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Layout.spacing.sm,
    marginTop: 2,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSubtle,
  },
  clearBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.primary,
  },
  applyBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textInverse,
  },
});
