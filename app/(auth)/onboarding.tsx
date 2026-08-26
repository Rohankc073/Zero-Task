import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/context/AuthContext';
import { useRouter } from 'expo-router';
import { processAndUploadAttachment } from '../../src/utils/attachmentPipeline';
import { Colors, Typography, Layout } from '../../src/theme/tokens';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';

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
        
        try {
          const result = await processAndUploadAttachment(
            avatarUri,
            `avatar.${ext}`,
            `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            'avatars',
            profile.id
          );
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ avatar_url: result.url })
            .eq('id', profile.id);
            
          if (updateError) {
            console.error('Failed to update user avatar_url', updateError);
          }
        } catch (err: any) {
          console.error('Failed to upload avatar', err.message);
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
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.progressContainer}>
          <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
          <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
          <View style={[styles.progressDot, step >= 3 && styles.progressDotActive]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Workspace Identity</Text>
            <Text style={styles.subtitle}>What is the name of your tech organization?</Text>
            
            <Input
              placeholder="e.g. Acme Corp"
              value={organizationName}
              onChangeText={setOrganizationName}
              autoFocus
            />
            
            <Button 
              title="Continue"
              onPress={handleNext}
              disabled={!organizationName.trim()}
              style={styles.nextButton}
            />
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Department Architecture</Text>
            <Text style={styles.subtitle}>Define your initial internal departments.</Text>
            
            <View style={styles.addDeptContainer}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="New Department"
                  value={newDepartment}
                  onChangeText={setNewDepartment}
                  onSubmitEditing={addDepartment}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={addDepartment}>
                <Ionicons name="add" size={24} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>

            <View style={styles.chipContainer}>
              {departments.map(dept => (
                <View key={dept} style={styles.chip}>
                  <Text style={styles.chipText}>{dept}</Text>
                  <TouchableOpacity onPress={() => removeDepartment(dept)}>
                    <Ionicons name="close-circle" size={18} color={Colors.primary} style={styles.chipIcon} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <Button 
              title="Continue"
              onPress={handleNext}
              style={styles.nextButton}
            />
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
                  <Ionicons name="camera" size={40} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>
              <Text style={styles.avatarHint}>Tap to select an image</Text>
            </View>

            <Button 
              title="Complete Setup"
              onPress={uploadAvatarAndNext}
              loading={uploading}
              style={styles.nextButton}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: 12,
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
    backgroundColor: Colors.borderSubtle,
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
    width: 24,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Layout.spacing.xl,
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontFamily: Typography.fontFamily.serif,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: 40,
    lineHeight: 24,
  },
  nextButton: {
    marginTop: Layout.spacing.lg,
    alignSelf: 'stretch',
  },
  addDeptContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  addBtn: {
    width: 48,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: Layout.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 40,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Layout.radius.full,
  },
  chipText: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  chipIcon: {
    marginLeft: 6,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.primary,
    ...Layout.shadow.card,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarHint: {
    marginTop: 16,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  }
});
