// Estate Standard - Vendor Active Job Screen
// Update job status, ETA, quotes, and complete work

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../theme';

export default function VendorActiveJobScreen() {
  const [eta, setEta] = useState('15');
  const [notes, setNotes] = useState('');
  const [finalCost, setFinalCost] = useState('285.00');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status Banner */}
      <View style={styles.statusBanner}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Job In Progress</Text>
        <Text style={styles.statusTime}>Started 45 min ago</Text>
      </View>

      {/* Job Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>HVAC Repair - Grinding Noise</Text>
        <Text style={styles.cardAddress}>1234 Oak Ridge Drive, Northlake, TX</Text>
        <Text style={styles.cardCustomer}>Customer: Sarah Mitchell</Text>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Scheduled</Text>
            <Text style={styles.infoValue}>12:00 PM - 5:00 PM</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Check-in</Text>
            <Text style={styles.infoValue}>12:15 PM</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Est. Cost</Text>
            <Text style={styles.infoValue}>$170 - $250</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Rate</Text>
            <Text style={styles.infoValue}>$85/hour</Text>
          </View>
        </View>
      </View>

      {/* Customer Issue */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer's Issue</Text>
        <View style={styles.card}>
          <Text style={styles.issueText}>
            "My HVAC system is making a loud grinding noise and it's not cooling the house below 75°F. It's 95°F outside and we have young kids. Please help!"
          </Text>
          <View style={styles.photoRow}>
            <View style={styles.photoBox}>
              <Ionicons name="thermometer" size={32} color={theme.colors.textSecondary} />
            </View>
            <View style={styles.photoBox}>
              <Ionicons name="image" size={32} color={theme.colors.textSecondary} />
            </View>
          </View>
        </View>
      </View>

      {/* Update ETA */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Update ETA</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Estimated completion time</Text>
          <View style={styles.etaButtons}>
            <TouchableOpacity
              style={[styles.etaButton, eta === '15' && styles.etaButtonActive]}
              onPress={() => setEta('15')}
            >
              <Text style={[styles.etaButtonText, eta === '15' && styles.etaButtonTextActive]}>
                15 min
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.etaButton, eta === '30' && styles.etaButtonActive]}
              onPress={() => setEta('30')}
            >
              <Text style={[styles.etaButtonText, eta === '30' && styles.etaButtonTextActive]}>
                30 min
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.etaButton, eta === '60' && styles.etaButtonActive]}
              onPress={() => setEta('60')}
            >
              <Text style={[styles.etaButtonText, eta === '60' && styles.etaButtonTextActive]}>
                1 hour
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.etaButton, eta === '120' && styles.etaButtonActive]}
              onPress={() => setEta('120')}
            >
              <Text style={[styles.etaButtonText, eta === '120' && styles.etaButtonTextActive]}>
                2 hours
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.updateButton}>
            <Text style={styles.updateButtonText}>Update Customer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Update Quote */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Update Quote</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Final cost</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputPrefix}>$</Text>
            <TextInput
              style={styles.input}
              value={finalCost}
              onChangeText={setFinalCost}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
          <Text style={styles.helpText}>
            Labor: $170 (2 hrs) + Parts: $115 (Compressor fan motor)
          </Text>
        </View>
      </View>

      {/* Work Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Work Performed</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="Describe work performed, parts replaced, recommendations..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{notes.length} characters</Text>
        </View>
      </View>

      {/* Upload Photos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Before & After Photos</Text>
        <View style={styles.card}>
          <View style={styles.photoGrid}>
            <View style={styles.uploadBox}>
              <Ionicons name="camera" size={32} color={theme.colors.textSecondary} />
              <Text style={styles.uploadText}>Before</Text>
            </View>
            <View style={styles.uploadBox}>
              <Ionicons name="camera" size={32} color={theme.colors.textSecondary} />
              <Text style={styles.uploadText}>After</Text>
            </View>
            <View style={styles.uploadBox}>
              <Ionicons name="add" size={32} color={theme.colors.textSecondary} />
              <Text style={styles.uploadText}>Add More</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Upload Invoice */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Invoice (Optional)</Text>
        <TouchableOpacity style={styles.card}>
          <View style={styles.uploadArea}>
            <Ionicons name="document-text-outline" size={32} color={theme.colors.mutedNavy} />
            <Text style={styles.uploadAreaText}>Upload PDF or Photo</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Complete Job Button */}
      <TouchableOpacity style={styles.completeButton}>
        <Ionicons name="checkmark-circle" size={24} color="white" />
        <Text style={styles.completeButtonText}>Complete Job</Text>
      </TouchableOpacity>

      {/* Emergency Contact */}
      <View style={styles.emergencyCard}>
        <Ionicons name="warning-outline" size={20} color={theme.colors.error} />
        <View style={styles.emergencyContent}>
          <Text style={styles.emergencyTitle}>Need Support?</Text>
          <Text style={styles.emergencyText}>Call Estate Standard: (469) 555-0100</Text>
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
  statusBanner: {
    backgroundColor: theme.colors.success,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'white',
  },
  statusText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  statusTime: {
    color: 'white',
    fontSize: 13,
    opacity: 0.9,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardAddress: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  cardCustomer: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    marginBottom: 12,
  },
  issueText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoBox: {
    width: 80,
    height: 80,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    fontWeight: '500',
  },
  etaButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  etaButton: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  etaButtonActive: {
    backgroundColor: theme.colors.mutedNavy,
    borderColor: theme.colors.mutedNavy,
  },
  etaButtonText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  etaButtonTextActive: {
    color: 'white',
  },
  updateButton: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  inputPrefix: {
    fontSize: 20,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 20,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    paddingVertical: 14,
  },
  helpText: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  textArea: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 16,
    fontSize: 15,
    color: theme.colors.textPrimary,
    minHeight: 120,
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'right',
  },
  photoGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadBox: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  uploadArea: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    borderRadius: 12,
  },
  uploadAreaText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  completeButton: {
    backgroundColor: theme.colors.success,
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  completeButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  emergencyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
  },
  emergencyContent: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    marginBottom: 2,
  },
  emergencyText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
