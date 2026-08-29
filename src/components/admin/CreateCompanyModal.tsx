import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { SuperAdminService } from '../../services/admin/SuperAdminService';

interface CreateCompanyModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateCompanyModal: React.FC<CreateCompanyModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [founderName, setFounderName] = useState('');
  const [founderEmail, setFounderEmail] = useState('');
  const [founderPhone, setFounderPhone] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Success State
  const [createdResult, setCreatedResult] = useState<{
    companyId: string;
    companyName: string;
    founderName: string;
    founderEmail: string;
  } | null>(null);

  const resetForm = () => {
    setCompanyName('');
    setFounderName('');
    setFounderEmail('');
    setFounderPhone('');
    setInitialPassword('');
    setShowPassword(false);
    setCreatedResult(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = async () => {
    if (!companyName.trim()) {
      Alert.alert('Validation Error', 'Please enter a company name.');
      return;
    }
    if (!founderName.trim()) {
      Alert.alert('Validation Error', 'Please enter the founder\'s full name.');
      return;
    }
    if (!founderEmail.trim() || !founderEmail.includes('@')) {
      Alert.alert('Validation Error', 'Please enter a valid founder email address.');
      return;
    }
    if (!initialPassword || initialPassword.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      const res = await SuperAdminService.createCompanyAndFounder({
        companyName: companyName.trim(),
        founderName: founderName.trim(),
        founderEmail: founderEmail.trim(),
        founderPhone: founderPhone.trim() || undefined,
        initialPassword: initialPassword.trim(),
      });

      setCreatedResult({
        companyId: res.companyId,
        companyName: res.companyName || companyName.trim(),
        founderName: res.founderName || founderName.trim(),
        founderEmail: res.founderEmail || founderEmail.trim(),
      });

      onSuccess();
    } catch (err: any) {
      Alert.alert('Creation Failed', err.message || 'An error occurred while creating the company.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewCompany = () => {
    if (createdResult?.companyId) {
      const targetId = createdResult.companyId;
      handleClose();
      router.push(`/(drawer)/(superadmin)/company/${targetId}` as any);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {createdResult ? (
            /* ── Success Screen ── */
            <View style={styles.successContainer}>
              <View style={styles.successIconBox}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              </View>
              <Text style={styles.successTitle}>Company Created Successfully</Text>
              <Text style={styles.successSubtitle}>
                The company and initial Founder account have been initialized. You remain authenticated as Super Admin.
              </Text>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Company:</Text>
                  <Text style={styles.summaryValueBold}>{createdResult.companyName}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Founder:</Text>
                  <Text style={styles.summaryValue}>{createdResult.founderName}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Email:</Text>
                  <Text style={styles.summaryValue}>{createdResult.founderEmail}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Status:</Text>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                </View>
              </View>

              <View style={styles.successActions}>
                <TouchableOpacity
                  style={styles.viewCompanyBtn}
                  onPress={handleViewCompany}
                >
                  <Ionicons name="business-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.viewCompanyBtnText}>View Company</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.createAnotherBtn}
                  onPress={resetForm}
                >
                  <Text style={styles.createAnotherBtnText}>Create Another Company</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={handleClose}
                >
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* ── Form Screen ── */
            <>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerIconWrapper}>
                  <Ionicons name="business" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Create New Company</Text>
                  <Text style={styles.subtitle}>Initialize company & Founder account</Text>
                </View>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Form Content */}
              <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
                {/* Section 1: Company Details */}
                <View style={styles.section}>
                  <Text style={styles.sectionHeader}>COMPANY DETAILS</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Company Name <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Acme Corporation"
                      placeholderTextColor={Colors.textMuted}
                      value={companyName}
                      onChangeText={setCompanyName}
                      editable={!loading}
                    />
                  </View>
                </View>

                {/* Section 2: Founder Details */}
                <View style={styles.section}>
                  <Text style={styles.sectionHeader}>FOUNDER DETAILS</Text>
                  
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Founder Full Name <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Rahul Sharma"
                      placeholderTextColor={Colors.textMuted}
                      value={founderName}
                      onChangeText={setFounderName}
                      editable={!loading}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Founder Email <Text style={styles.required}>*</Text></Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. rahul@acme.com"
                      placeholderTextColor={Colors.textMuted}
                      value={founderEmail}
                      onChangeText={setFounderEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!loading}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Phone Number (Optional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. +91 9876543210"
                      placeholderTextColor={Colors.textMuted}
                      value={founderPhone}
                      onChangeText={setFounderPhone}
                      keyboardType="phone-pad"
                      editable={!loading}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Initial Password <Text style={styles.required}>*</Text></Text>
                    <View style={styles.passwordInputWrapper}>
                      <TextInput
                        style={styles.passwordInput}
                        value={initialPassword}
                        onChangeText={setInitialPassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!loading}
                      />
                      <TouchableOpacity
                        style={styles.eyeBtn}
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={Colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.helperText}>Founder will use this password to sign in</Text>
                  </View>
                </View>
              </ScrollView>

              {/* Footer Actions */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleClose}
                  disabled={loading}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleCreate}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.submitBtnText}>Create Company</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Layout.radius.xl,
    borderTopRightRadius: Layout.radius.xl,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
    gap: Layout.spacing.md,
  },
  headerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  closeButton: {
    padding: 4,
  },
  formContent: {
    padding: Layout.spacing.lg,
    gap: Layout.spacing.lg,
  },
  section: {
    gap: Layout.spacing.md,
  },
  sectionHeader: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    letterSpacing: 0.8,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  required: {
    color: Colors.danger,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.md,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 10,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceSubtle,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.surfaceSubtle,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 10,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  eyeBtn: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 10,
  },
  helperText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderDefault,
    gap: Layout.spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 10,
  },
  cancelBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Layout.spacing.xl,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: '#FFFFFF',
  },
  /* Success Screen Styles */
  successContainer: {
    padding: Layout.spacing.xl,
    alignItems: 'center',
    gap: Layout.spacing.md,
  },
  successIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Layout.spacing.sm,
  },
  successTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    padding: Layout.spacing.lg,
    gap: Layout.spacing.sm,
    marginVertical: Layout.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  summaryValueBold: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  activeBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: 2,
    borderRadius: Layout.radius.full,
  },
  activeBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    color: Colors.successText,
  },
  successActions: {
    width: '100%',
    gap: Layout.spacing.sm,
    marginTop: Layout.spacing.sm,
  },
  viewCompanyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    gap: 6,
  },
  viewCompanyBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: '#FFFFFF',
  },
  createAnotherBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    paddingVertical: 11,
    borderRadius: Layout.radius.md,
  },
  createAnotherBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  doneBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  doneBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
});
