import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { UserRole } from '../../src/types';
import { Colors, Typography, Layout } from '../../src/theme/tokens';

const ROLES: { id: UserRole; title: string; description: string }[] = [
  { id: 'Department Head', title: 'Department Head', description: 'Manage managers & teams' },
  { id: 'Manager', title: 'Manager', description: 'Manage employee tasks' },
  { id: 'Employee', title: 'Employee', description: 'Standard task execution' },
];

export default function RegisterScreen() {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [loadingDepts, setLoadingDepts] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  
  const router = useRouter();

  useEffect(() => {
    if (step === 2) {
      fetchDepartments();
    }
  }, [step]);

  const fetchDepartments = async () => {
    setLoadingDepts(true);
    const { data } = await supabase.from('departments').select('id, name').order('name');
    if (data) {
      setDepartments(data);
    }
    setLoadingDepts(false);
  };

  const handleNextRole = () => {
    if (!selectedRole) {
      Alert.alert('Role Required', 'Please select a role to continue.');
      return;
    }
    setStep(2);
  };

  const handleNextDepartment = () => {
    if (!selectedDepartment) {
      Alert.alert('Department Required', 'Please select a department to continue.');
      return;
    }
    setStep(3);
  };

  const handleRegister = async () => {
    if (!email || !password || !fullName || !phoneNumber) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(phoneNumber.replace(/[\s-]/g, ''))) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid international phone number (e.g. +971 50...).');
      return;
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{7,}$/;
    if (!passwordRegex.test(password)) {
      Alert.alert(
        'Weak Password', 
        'Password must contain more than 6 characters, at least 1 uppercase letter, 1 number, and 1 symbol (e.g. @).'
      );
      return;
    }

    setLoading(true);
    try {
      // Pre-check for strict 1 Manager / 1 Dept Head per department enforcement
      if ((selectedRole === 'Manager' || selectedRole === 'Department Head') && selectedDepartment) {
        const { data: isAvailable, error: rpcError } = await supabase.rpc('check_role_availability', {
          p_role: selectedRole,
          p_department_id: selectedDepartment
        });
        
        if (rpcError) {
          console.warn("Availability check failed, proceeding anyway", rpcError);
        } else if (isAvailable === false) {
          Alert.alert(
            'Role Unavailable',
            `A ${selectedRole} already exists for this department. Only one ${selectedRole} is allowed per department.`
          );
          setLoading(false);
          return;
        }
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: selectedRole,
            department_id: selectedDepartment,
            phone_number: phoneNumber,
          }
        }
      });

      if (error) {
        throw error;
      }
      
      Alert.alert(
        'Request Submitted',
        `Your registration request for ${selectedRole} has been sent for management review. You will receive an email with setup instructions once approved.`,
        [
          { 
            text: 'Continue', 
            onPress: () => router.replace('/(auth)/pending' as any) 
          }
        ]
      );

    } catch (error: any) {
      if (error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('already exists')) {
        setShowDuplicateModal(true);
      } else if (error.status === 500 || error.message === '{}') {
        Alert.alert(
          'Registration Failed',
          `A server error occurred. If you are registering as a Manager or Department Head, a user with this role might already exist for this department.`
        );
      } else {
        Alert.alert('Registration Failed', error.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => step > 1 ? setStep(step - 1) : router.back()} 
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              {step === 1 ? "Select your role within the organization." : step === 2 ? "Select your department." : "Enter your credentials."}
            </Text>
          </View>

          {step === 1 && (
            <View style={{ flex: 1 }}>
              <View style={styles.roleContainer}>
                {ROLES.map((role) => {
                  const isSelected = selectedRole === role.id;
                  return (
                    <TouchableOpacity
                      key={role.id}
                      onPress={() => setSelectedRole(role.id)}
                      style={[
                        styles.roleCard,
                        isSelected && styles.roleCardActive
                      ]}
                      activeOpacity={0.8}
                    >
                      <View style={styles.roleHeader}>
                        <Text style={[styles.roleTitle, isSelected && styles.roleTitleActive]}>
                          {role.title}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                      </View>
                      <Text style={styles.roleDesc}>{role.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.footer}>
                <Button 
                  title="Continue" 
                  onPress={handleNextRole} 
                />
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={{ flex: 1 }}>
              <View style={styles.roleContainer}>
                {loadingDepts ? (
                  <Text style={styles.loadingText}>Loading departments...</Text>
                ) : departments.length === 0 ? (
                  <Text style={styles.loadingText}>No departments found. The Founder must complete onboarding first.</Text>
                ) : (
                  departments.map((dept) => {
                    const isSelected = selectedDepartment === dept.id;
                    return (
                      <TouchableOpacity
                        key={dept.id}
                        onPress={() => setSelectedDepartment(dept.id)}
                        style={[
                          styles.roleCard,
                          styles.deptCard,
                          isSelected && styles.roleCardActive
                        ]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.roleTitle, isSelected && styles.roleTitleActive]}>
                          {dept.name}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              <View style={styles.footer}>
                <Button 
                  title="Continue" 
                  onPress={handleNextDepartment} 
                />
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={{ flex: 1 }}>
              <Input
                label="Full Name"
                placeholder="John Doe"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />

              <Input
                label="Phone Number"
                placeholder="+971 50 123 4567"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
              />

              <Input
                label="Email Address"
                placeholder="Enter your professional email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Input
                label="Password"
                placeholder="Create a strong password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <View style={styles.footer}>
                <Button 
                  title="Complete Sign Up" 
                  onPress={handleRegister} 
                  loading={loading} 
                />
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showDuplicateModal}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={44} color={Colors.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.modalText}>
              This email is already associated with an enterprise workspace. Please log in or use a different email.
            </Text>
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => {
                setShowDuplicateModal(false);
                router.replace('/(auth)');
              }}
            >
              <Text style={styles.modalButtonText}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, { backgroundColor: Colors.surfaceSecondary, marginTop: 12 }]}
              onPress={() => setShowDuplicateModal(false)}
            >
              <Text style={[styles.modalButtonText, { color: Colors.textPrimary }]}>Use Different Email</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Layout.spacing.xl,
    paddingTop: 40,
  },
  header: {
    marginBottom: 32,
  },
  backBtn: {
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
  },
  roleContainer: {
    flex: 1,
    marginBottom: 24,
  },
  roleCard: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.lg,
    borderRadius: Layout.radius.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...Layout.shadow.card,
  },
  deptCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Layout.spacing.lg,
  },
  roleCardActive: {
    borderColor: Colors.borderStrong,
  },
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  roleTitleActive: {
    color: Colors.textPrimary,
  },
  roleDesc: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  loadingText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
    marginTop: 40,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: Layout.radius.xl,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    ...Layout.shadow.modal,
  },
  modalText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: Colors.primary,
    width: '100%',
    height: 48,
    borderRadius: Layout.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonText: {
    color: Colors.textInverse,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
  }
});
