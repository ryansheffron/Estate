// Estate Standard - Home Screen
// Calm dashboard showing home status

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero Section */}
      <View style={styles.hero}>
        <Text style={styles.greeting}>Good morning</Text>
        <Text style={styles.homeTitle}>1234 Oak Ridge Drive</Text>
        <Text style={styles.subtitle}>Northlake, TX</Text>
      </View>

      {/* Status Card */}
      <View style={styles.statusCard}>
        <View style={styles.statusIcon}>
          <Ionicons name="checkmark-circle" size={32} color={theme.colors.success} />
        </View>
        <Text style={styles.statusTitle}>Everything is handled</Text>
        <Text style={styles.statusSubtitle}>
          Your home is in perfect harmony. All systems are maintained.
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name="add-circle-outline" size={24} color={theme.colors.mutedNavy} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Request Service</Text>
            <Text style={styles.actionSubtitle}>Get help with an issue</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name="calendar-outline" size={24} color={theme.colors.mutedNavy} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Schedule Maintenance</Text>
            <Text style={styles.actionSubtitle}>Book a recurring service</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Upcoming */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming</Text>

        <View style={styles.upcomingCard}>
          <View style={styles.upcomingDate}>
            <Text style={styles.upcomingMonth}>JAN</Text>
            <Text style={styles.upcomingDay}>20</Text>
          </View>
          <View style={styles.upcomingContent}>
            <Text style={styles.upcomingTitle}>Landscaping</Text>
            <Text style={styles.upcomingSubtitle}>Green Horizon · Monthly service</Text>
          </View>
        </View>

        <View style={styles.upcomingCard}>
          <View style={styles.upcomingDate}>
            <Text style={styles.upcomingMonth}>MAR</Text>
            <Text style={styles.upcomingDay}>15</Text>
          </View>
          <View style={styles.upcomingContent}>
            <Text style={styles.upcomingTitle}>HVAC Maintenance</Text>
            <Text style={styles.upcomingSubtitle}>Cool Breeze HVAC · Quarterly service</Text>
          </View>
        </View>
      </View>

      {/* Bottom Spacing */}
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
    paddingHorizontal: theme.spacing.md,
  },
  hero: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  greeting: {
    ...theme.typography.labelLarge,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  homeTitle: {
    ...theme.typography.headlineSmall,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textSecondary,
  },

  // Status Card
  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  statusIcon: {
    marginBottom: theme.spacing.md,
  },
  statusTitle: {
    ...theme.typography.titleMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  statusSubtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },

  // Section
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    ...theme.typography.titleSmall,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Action Cards
  actionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    ...theme.typography.bodyLarge,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  actionSubtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },

  // Upcoming Cards
  upcomingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  upcomingDate: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  upcomingMonth: {
    ...theme.typography.labelSmall,
    color: theme.colors.textTertiary,
    fontSize: 10,
  },
  upcomingDay: {
    ...theme.typography.titleLarge,
    color: theme.colors.textPrimary,
  },
  upcomingContent: {
    flex: 1,
  },
  upcomingTitle: {
    ...theme.typography.bodyLarge,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  upcomingSubtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
});
