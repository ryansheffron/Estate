// Estate Standard - Customer Care Screen
// Service requests, appointments, and concierge

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

type Tab = 'requests' | 'appointments';

export default function CustomerCareScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('requests');

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
          onPress={() => setActiveTab('requests')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'requests' && styles.tabTextActive,
            ]}
          >
            Requests
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'appointments' && styles.tabActive]}
          onPress={() => setActiveTab('appointments')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'appointments' && styles.tabTextActive,
            ]}
          >
            Appointments
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        {activeTab === 'requests' ? (
          <>
            {/* New Request Button */}
            <TouchableOpacity style={styles.newRequestButton}>
              <Ionicons
                name="add-circle"
                size={24}
                color={theme.colors.surface}
              />
              <Text style={styles.newRequestText}>New Service Request</Text>
            </TouchableOpacity>

            {/* Sample Request */}
            <View style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={styles.requestBadge}>
                  <Text style={styles.requestBadgeText}>SCHEDULED</Text>
                </View>
                <Text style={styles.requestDate}>2 days ago</Text>
              </View>
              <Text style={styles.requestTitle}>HVAC not cooling properly</Text>
              <Text style={styles.requestDescription}>
                AC unit running but not reaching set temperature. Filters were
                changed last month.
              </Text>
              <View style={styles.requestFooter}>
                <View style={styles.vendorInfo}>
                  <Ionicons
                    name="person-circle-outline"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.vendorName}>Cool Breeze HVAC</Text>
                </View>
                <Text style={styles.appointmentTime}>Jan 10, 12-5 PM</Text>
              </View>
            </View>

            {/* Empty State */}
            <View style={styles.emptyState}>
              <Ionicons
                name="checkmark-circle-outline"
                size={48}
                color={theme.colors.textTertiary}
              />
              <Text style={styles.emptyText}>Everything is running smoothly</Text>
            </View>
          </>
        ) : (
          <>
            {/* Upcoming Appointment */}
            <View style={styles.appointmentCard}>
              <View style={styles.appointmentDateBadge}>
                <Text style={styles.appointmentMonth}>JAN</Text>
                <Text style={styles.appointmentDay}>20</Text>
              </View>
              <View style={styles.appointmentContent}>
                <Text style={styles.appointmentTitle}>
                  Landscaping - Monthly Service
                </Text>
                <Text style={styles.appointmentVendor}>
                  Green Horizon Landscaping
                </Text>
                <View style={styles.appointmentTime}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.appointmentTimeText}>8-12 AM</Text>
                </View>
              </View>
              <View style={styles.appointmentActions}>
                <TouchableOpacity style={styles.appointmentAction}>
                  <Ionicons
                    name="call-outline"
                    size={20}
                    color={theme.colors.mutedNavy}
                  />
                </TouchableOpacity>
                <TouchableOpacity style={styles.appointmentAction}>
                  <Ionicons
                    name="chatbubble-outline"
                    size={20}
                    color={theme.colors.mutedNavy}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Past Appointment */}
            <View style={[styles.appointmentCard, styles.appointmentPast]}>
              <View style={styles.appointmentDateBadge}>
                <Text style={styles.appointmentMonth}>DEC</Text>
                <Text style={styles.appointmentDay}>15</Text>
              </View>
              <View style={styles.appointmentContent}>
                <Text style={styles.appointmentTitle}>HVAC - Quarterly Service</Text>
                <Text style={styles.appointmentVendor}>Cool Breeze HVAC</Text>
                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={theme.colors.success}
                  />
                  <Text style={styles.completedText}>Completed</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.colors.ink,
  },
  tabText: {
    ...theme.typography.labelLarge,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },

  // New Request Button
  newRequestButton: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  newRequestText: {
    ...theme.typography.labelLarge,
    color: theme.colors.surface,
    marginLeft: theme.spacing.sm,
  },

  // Request Card
  requestCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  requestBadge: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  requestBadgeText: {
    ...theme.typography.labelSmall,
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  requestDate: {
    ...theme.typography.bodySmall,
    color: theme.colors.textTertiary,
  },
  requestTitle: {
    ...theme.typography.bodyLarge,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  requestDescription: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: theme.spacing.md,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  vendorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vendorName: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  appointmentTime: {
    ...theme.typography.labelSmall,
    color: theme.colors.mutedNavy,
  },

  // Appointment Card
  appointmentCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  appointmentPast: {
    opacity: 0.7,
  },
  appointmentDateBadge: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  appointmentMonth: {
    ...theme.typography.labelSmall,
    color: theme.colors.textTertiary,
    fontSize: 10,
  },
  appointmentDay: {
    ...theme.typography.titleLarge,
    color: theme.colors.textPrimary,
  },
  appointmentContent: {
    flex: 1,
  },
  appointmentTitle: {
    ...theme.typography.bodyLarge,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  appointmentVendor: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  appointmentTimeText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  appointmentActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appointmentAction: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing.xs,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completedText: {
    ...theme.typography.bodySmall,
    color: theme.colors.success,
    marginLeft: 4,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  emptyText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.md,
  },
});
