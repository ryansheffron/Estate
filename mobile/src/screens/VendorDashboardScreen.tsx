// Estate Standard - Vendor Dashboard Screen
// Overview of pending and active jobs for vendors

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

export default function VendorDashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    // Fetch latest jobs
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning</Text>
          <Text style={styles.vendorName}>Cool Breeze HVAC</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="notifications-outline" size={24} color={theme.colors.mutedNavy} />
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationCount}>3</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.colors.success }]}>
          <Text style={styles.statValue}>$2,450</Text>
          <Text style={styles.statLabel}>This Week</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.colors.info }]}>
          <Text style={styles.statValue}>4.9</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.colors.warning }]}>
          <Text style={styles.statValue}>127</Text>
          <Text style={styles.statLabel}>Reviews</Text>
        </View>
      </View>

      {/* Pending Confirmations */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pending Confirmations</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>2</Text>
          </View>
        </View>

        {/* Job 1 - Needs Confirmation */}
        <TouchableOpacity style={styles.jobCard}>
          <View style={styles.jobHeader}>
            <View style={styles.urgencyBadge}>
              <Text style={styles.urgencyText}>HIGH</Text>
            </View>
            <Text style={styles.jobTime}>Requested 15 min ago</Text>
          </View>

          <Text style={styles.jobTitle}>HVAC Repair - Grinding Noise</Text>
          <Text style={styles.jobAddress}>1234 Oak Ridge Drive, Northlake</Text>

          <View style={styles.jobDetails}>
            <View style={styles.jobDetail}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.jobDetailText}>Today, 2:00 PM - 4:00 PM</Text>
            </View>
            <View style={styles.jobDetail}>
              <Ionicons name="cash-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.jobDetailText}>$85/hour est. 1-2 hrs</Text>
            </View>
          </View>

          <View style={styles.jobActions}>
            <TouchableOpacity style={styles.declineButton}>
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton}>
              <Text style={styles.acceptButtonText}>Accept Job</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Job 2 - Needs Confirmation */}
        <TouchableOpacity style={styles.jobCard}>
          <View style={styles.jobHeader}>
            <View style={[styles.urgencyBadge, { backgroundColor: theme.colors.warning }]}>
              <Text style={styles.urgencyText}>NORMAL</Text>
            </View>
            <Text style={styles.jobTime}>Requested 2 hours ago</Text>
          </View>

          <Text style={styles.jobTitle}>Annual HVAC Maintenance</Text>
          <Text style={styles.jobAddress}>5678 Maple Street, Fort Worth</Text>

          <View style={styles.jobDetails}>
            <View style={styles.jobDetail}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.jobDetailText}>Tomorrow, 10:00 AM - 12:00 PM</Text>
            </View>
            <View style={styles.jobDetail}>
              <Ionicons name="cash-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.jobDetailText}>$85/hour est. 1 hr</Text>
            </View>
          </View>

          <View style={styles.jobActions}>
            <TouchableOpacity style={styles.declineButton}>
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptButton}>
              <Text style={styles.acceptButtonText}>Accept Job</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>

      {/* Today's Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Schedule</Text>

        {/* Active Job */}
        <TouchableOpacity style={[styles.jobCard, styles.activeJobCard]}>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>En Route</Text>
          </View>

          <Text style={styles.jobTitle}>HVAC Not Cooling Properly</Text>
          <Text style={styles.jobAddress}>9012 Lakeview Parkway, Northlake</Text>
          <Text style={styles.customerName}>Customer: Sarah Mitchell</Text>

          <View style={styles.jobDetails}>
            <View style={styles.jobDetail}>
              <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.jobDetailText}>2:00 PM - 4:00 PM (30 min away)</Text>
            </View>
            <View style={styles.jobDetail}>
              <Ionicons name="navigate-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.jobDetailText}>2.3 miles</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Check In & Start Job</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Upcoming Job */}
        <View style={styles.jobCard}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Scheduled</Text>
          </View>

          <Text style={styles.jobTitle}>Filter Replacement</Text>
          <Text style={styles.jobAddress}>3456 Park Avenue, Fort Worth</Text>
          <Text style={styles.customerName}>Customer: John Davis</Text>

          <View style={styles.jobDetails}>
            <View style={styles.jobDetail}>
              <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.jobDetailText}>4:00 PM - 6:00 PM</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>View Details</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.quickActionsGrid}>
          <TouchableOpacity style={styles.quickAction}>
            <Ionicons name="calendar" size={24} color={theme.colors.mutedNavy} />
            <Text style={styles.quickActionText}>Set Availability</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}>
            <Ionicons name="time" size={24} color={theme.colors.mutedNavy} />
            <Text style={styles.quickActionText}>Time Off</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}>
            <Ionicons name="cash" size={24} color={theme.colors.mutedNavy} />
            <Text style={styles.quickActionText}>Earnings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction}>
            <Ionicons name="star" size={24} color={theme.colors.mutedNavy} />
            <Text style={styles.quickActionText}>Reviews</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  vendorName: {
    fontSize: 28,
    color: theme.colors.textPrimary,
    fontWeight: '400',
    letterSpacing: -0.5,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: theme.colors.error,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationCount: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    color: 'white',
    fontWeight: '600',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'white',
    opacity: 0.9,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  jobCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  activeJobCard: {
    borderWidth: 2,
    borderColor: theme.colors.success,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  urgencyBadge: {
    backgroundColor: theme.colors.error,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  urgencyText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  jobTime: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  jobTitle: {
    fontSize: 18,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    marginBottom: 4,
  },
  jobAddress: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  customerName: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  jobDetails: {
    gap: 8,
    marginBottom: 16,
  },
  jobDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  jobDetailText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  jobActions: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  declineButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 2,
    backgroundColor: theme.colors.success,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  statusText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: theme.colors.mutedNavy,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAction: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  quickActionText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
});
