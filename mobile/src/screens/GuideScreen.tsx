// Estate Standard - Maintenance Guide Screen
// The Standard: all 38 maintenance categories

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

// Sample categories (first 12 of 38)
const CATEGORIES = [
  { id: '1', name: 'HVAC', icon: 'wind-outline', cadence: 'Quarterly', nextDue: '15 days' },
  { id: '2', name: 'Plumbing', icon: 'water-outline', cadence: 'Semi-annual', nextDue: '89 days' },
  { id: '3', name: 'Landscaping', icon: 'leaf-outline', cadence: 'Monthly', nextDue: '5 days' },
  { id: '4', name: 'Electrical', icon: 'flash-outline', cadence: 'Yearly', nextDue: '234 days' },
  { id: '5', name: 'Roof', icon: 'home-outline', cadence: 'Yearly', nextDue: '178 days' },
  { id: '6', name: 'Gutters & Downspouts', icon: 'filter-outline', cadence: 'Semi-annual', nextDue: '45 days' },
  { id: '7', name: 'Water Heater', icon: 'thermometer-outline', cadence: 'Yearly', nextDue: '312 days' },
  { id: '8', name: 'Appliances', icon: 'cube-outline', cadence: 'Quarterly', nextDue: '67 days' },
  { id: '9', name: 'Garage Door', icon: 'car-outline', cadence: 'Semi-annual', nextDue: '123 days' },
  { id: '10', name: 'Smoke Detectors', icon: 'alert-circle-outline', cadence: 'Semi-annual', nextDue: '12 days' },
  { id: '11', name: 'Fireplace', icon: 'flame-outline', cadence: 'Yearly', nextDue: '267 days' },
  { id: '12', name: 'Foundation', icon: 'layers-outline', cadence: 'Yearly', nextDue: '189 days' },
];

export default function GuideScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>The Standard</Text>
        <Text style={styles.headerSubtitle}>
          Comprehensive home maintenance tracking
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {CATEGORIES.map((category) => (
          <TouchableOpacity key={category.id} style={styles.categoryCard}>
            <View style={styles.categoryIcon}>
              <Ionicons
                name={category.icon as any}
                size={24}
                color={theme.colors.mutedNavy}
              />
            </View>
            <View style={styles.categoryContent}>
              <Text style={styles.categoryName}>{category.name}</Text>
              <Text style={styles.categoryCadence}>{category.cadence}</Text>
            </View>
            <View style={styles.categoryStatus}>
              <Text style={styles.categoryDue}>{category.nextDue}</Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.colors.textTertiary}
              />
            </View>
          </TouchableOpacity>
        ))}

        {/* All 38 categories available */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            + 26 more categories including Insulation, Smart Home, Drainage,
            and more
          </Text>
        </View>

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
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    ...theme.typography.titleLarge,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },

  // Category Card
  categoryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    ...theme.typography.bodyLarge,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  categoryCadence: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  categoryStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDue: {
    ...theme.typography.labelSmall,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.xs,
  },

  // Footer
  footer: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  footerText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
