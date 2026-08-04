import React, { useState, useEffect } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { ZeroInput } from '../../src/components/ZeroInput';
import { ZeroButton } from '../../src/components/ZeroButton';
import { UserRole } from '../../src/types';

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
    if (!email || !password || !fullName) {
      Alert.alert('Error', 'Please fill in all fields');
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
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: selectedRole,
            department_id: selectedDepartment,
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
      } else {
        Alert.alert('Registration Failed', error.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f7f6f2]">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 40 }}>
          <View className="mb-8">
            <TouchableOpacity 
              onPress={() => step > 1 ? setStep(step - 1) : router.back()} 
              className="mb-4"
            >
              <Ionicons name="arrow-back" size={24} color="#0f141a" />
            </TouchableOpacity>
            <Text className="text-3xl font-bold text-[#0f141a] tracking-tight mb-2">Create Account</Text>
            <Text className="text-gray-500 text-base">
              {step === 1 ? "Select your role within the organization." : step === 2 ? "Select your department." : "Enter your credentials."}
            </Text>
          </View>

          {step === 1 && (
            <View className="flex-1">
              <View className="flex-col justify-between mb-8">
                {ROLES.map((role) => {
                  const isSelected = selectedRole === role.id;
                  return (
                    <TouchableOpacity
                      key={role.id}
                      onPress={() => setSelectedRole(role.id)}
                      className={`w-full bg-white p-6 rounded-xl mb-4 border-2 ${
                        isSelected ? 'border-[#0f141a]' : 'border-transparent shadow-sm'
                      }`}
                    >
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className={`font-bold text-lg ${isSelected ? 'text-[#0f141a]' : 'text-gray-700'}`}>
                          {role.title}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={24} color="#e1c37a" />}
                      </View>
                      <Text className="text-sm text-gray-500 leading-tight">{role.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View className="mt-auto pt-6">
                <ZeroButton 
                  title="Continue" 
                  onPress={handleNextRole} 
                />
              </View>
            </View>
          )}

          {step === 2 && (
            <View className="flex-1">
              <View className="flex-col mb-8">
                {loadingDepts ? (
                  <Text className="text-center text-gray-500 mt-10">Loading departments...</Text>
                ) : departments.length === 0 ? (
                  <Text className="text-center text-gray-500 mt-10">No departments found. The Founder must complete onboarding first.</Text>
                ) : (
                  departments.map((dept) => {
                    const isSelected = selectedDepartment === dept.id;
                    return (
                      <TouchableOpacity
                        key={dept.id}
                        onPress={() => setSelectedDepartment(dept.id)}
                        className={`w-full bg-white p-5 rounded-xl mb-3 border-2 flex-row justify-between items-center ${
                          isSelected ? 'border-[#0f141a]' : 'border-transparent shadow-sm'
                        }`}
                      >
                        <Text className={`font-bold text-lg ${isSelected ? 'text-[#0f141a]' : 'text-gray-700'}`}>
                          {dept.name}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={24} color="#e1c37a" />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              <View className="mt-auto pt-6">
                <ZeroButton 
                  title="Continue" 
                  onPress={handleNextDepartment} 
                />
              </View>
            </View>
          )}

          {step === 3 && (
            <View className="flex-1">
              <ZeroInput
                label="Full Name"
                placeholder="John Doe"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />

              <ZeroInput
                label="Email Address"
                placeholder="Enter your professional email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <ZeroInput
                label="Password"
                placeholder="Create a strong password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <View className="mt-auto pt-6">
                <ZeroButton 
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
            <Ionicons name="warning" size={48} color="#e1c37a" style={{ marginBottom: 16 }} />
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
              style={[styles.modalButton, { backgroundColor: '#f7f6f2', marginTop: 12 }]}
              onPress={() => setShowDuplicateModal(false)}
            >
              <Text style={[styles.modalButtonText, { color: '#0f141a' }]}>Use Different Email</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 20, 26, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#f7f6f2',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalText: {
    fontSize: 18,
    color: '#0f141a',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 32,
    fontWeight: '500',
  },
  modalButton: {
    backgroundColor: '#e1c37a',
    width: '100%',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#0f141a',
    fontSize: 18,
    fontWeight: '800',
  }
});
