import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/context/AuthContext';
import { useRouter } from 'expo-router';

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  
  // Step 1 State
  const [organizationName, setOrganizationName] = useState('');
  
  // Step 2 State
  const [departments, setDepartments] = useState<string[]>(['Engineering', 'Product']);
  const [newDepartment, setNewDepartment] = useState('');
  
  // Step 3 State
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { profile, refreshProfile } = useAuth();
  const router = useRouter();

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const addDepartment = () => {
    if (newDepartment.trim() && !departments.includes(newDepartment.trim())) {
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment('');
    }
  };

  const removeDepartment = (dept: string) => {
    setDepartments(departments.filter(d => d !== dept));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const uploadAvatarAndNext = async () => {
    try {
      setUploading(true);

      // 1. Upload Avatar if selected
      if (avatarUri && profile) {
        const ext = avatarUri.substring(avatarUri.lastIndexOf('.') + 1);
        const fileName = `${profile.id}/avatar-${Date.now()}.${ext}`;

        const base64 = await FileSystem.readAsStringAsync(avatarUri, { encoding: FileSystem.EncodingType.Base64 });
        const arrayBuffer = decode(base64);

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, arrayBuffer, { upsert: true, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

          await supabase
            .from('users')
            .update({ avatar_url: urlData.publicUrl })
            .eq('id', profile.id);
        }
      }

      // 2. Create the departments
      if (departments.length > 0) {
        const departmentsToInsert = departments.map(name => ({ name }));
        const { error: deptError } = await supabase
          .from('departments')
          .insert(departmentsToInsert);

        if (deptError) {
          console.error('Error creating departments:', deptError);
        }
      }

      // 3. Complete onboarding via RPC
      const { error: rpcError } = await supabase.rpc('mock_checkout', {
        org_name: organizationName
      });

      if (rpcError) throw rpcError;

      // 4. Refresh profile and redirect to app
      await refreshProfile();
      router.replace('/(drawer)/(tabs)' as any);
      
    } catch (error: any) {
      console.error('Setup failed:', error);
      Alert.alert('Setup Failed', error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {step > 1 && (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#0f141a" />
          </TouchableOpacity>
        )}
        <View style={styles.progressContainer}>
          <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
          <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
          <View style={[styles.progressDot, step >= 3 && styles.progressDotActive]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Workspace Identity</Text>
            <Text style={styles.subtitle}>What is the name of your tech organization?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Acme Corp"
              placeholderTextColor="#999"
              value={organizationName}
              onChangeText={setOrganizationName}
              autoFocus
            />
            <TouchableOpacity 
              style={[styles.nextButton, !organizationName.trim() && styles.nextButtonDisabled]}
              onPress={handleNext}
              disabled={!organizationName.trim()}
            >
              <Text style={styles.nextButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#0f141a" />
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Department Architecture</Text>
            <Text style={styles.subtitle}>Define your initial internal departments.</Text>
            
            <View style={styles.addDeptContainer}>
              <TextInput
                style={styles.inputDept}
                placeholder="New Department"
                placeholderTextColor="#999"
                value={newDepartment}
                onChangeText={setNewDepartment}
                onSubmitEditing={addDepartment}
              />
              <TouchableOpacity style={styles.addBtn} onPress={addDepartment}>
                <Ionicons name="add" size={24} color="#0f141a" />
              </TouchableOpacity>
            </View>

            <View style={styles.chipContainer}>
              {departments.map(dept => (
                <View key={dept} style={styles.chip}>
                  <Text style={styles.chipText}>{dept}</Text>
                  <TouchableOpacity onPress={() => removeDepartment(dept)}>
                    <Ionicons name="close-circle" size={20} color="#0f141a" style={styles.chipIcon} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <TouchableOpacity 
              style={styles.nextButton}
              onPress={handleNext}
            >
              <Text style={styles.nextButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#0f141a" />
            </TouchableOpacity>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Founder Profile</Text>
            <Text style={styles.subtitle}>Upload your avatar for the team to recognize you.</Text>
            
            <View style={styles.avatarSection}>
              <TouchableOpacity style={styles.avatarPlaceholder} onPress={pickImage}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="camera" size={48} color="#999" />
                )}
              </TouchableOpacity>
              <Text style={styles.avatarHint}>Tap to select an image</Text>
            </View>

            <TouchableOpacity 
              style={styles.nextButton}
              onPress={uploadAvatarAndNext}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#0f141a" />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>Complete Setup</Text>
                  <Ionicons name="checkmark" size={20} color="#0f141a" />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    height: 60,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e5e5',
  },
  progressDotActive: {
    backgroundColor: '#e1c37a',
    width: 24,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f141a',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#ffffff',
    height: 64,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 20,
    color: '#0f141a',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    marginBottom: 40,
  },
  nextButton: {
    backgroundColor: '#e1c37a',
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 32,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    color: '#0f141a',
    fontSize: 18,
    fontWeight: '700',
  },
  addDeptContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  inputDept: {
    flex: 1,
    backgroundColor: '#ffffff',
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#0f141a',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  addBtn: {
    width: 56,
    height: 56,
    backgroundColor: '#e1c37a',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 40,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f141a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  chipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  chipIcon: {
    marginLeft: 8,
    color: '#e1c37a',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e5e5e5',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#e1c37a',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarHint: {
    marginTop: 16,
    color: '#666',
    fontSize: 14,
  }
});
