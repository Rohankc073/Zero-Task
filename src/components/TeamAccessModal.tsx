import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../theme/tokens';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { User, UserRole, Department, Designation } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { isFounder, isSuperAdmin } from '../utils/permissions';

interface TeamAccessModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userToEdit?: User | null;
  companyId?: string;
}

const DISPLAY_ROLES: Record<string, string> = {
  'Department Head': 'Department Head',
  'Manager': 'Manager',
  'Employee': 'Employee',
};

const ALL_BASE_ROLES: UserRole[] = ['Department Head', 'Manager', 'Employee'];

export function TeamAccessModal({ visible, onClose, onSuccess, userToEdit, companyId }: TeamAccessModalProps) {
  const isEditing = !!userToEdit;
  const { profile } = useAuth();
  const actorIsFounder = isFounder(profile);

  // Available roles are strictly limited to Department Head, Manager, and Employee
  const availableBaseRoles: UserRole[] = ALL_BASE_ROLES;

  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  // We repurpose designations as custom system roles
  const [customRoles, setCustomRoles] = useState<Designation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  
  const [departmentId, setDepartmentId] = useState<string>('');
  
  // We use this single state to track the selected UI role.
  // It can be a Base Role (e.g., 'Founder') or a custom role ID (e.g. designation UUID).
  const [selectedRoleValue, setSelectedRoleValue] = useState<string>('Employee');
  
  const [isActive, setIsActive] = useState<boolean>(true);

  // Dropdown states
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  // Inline Create States
  const [showAddDept, setShowAddDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleBase, setNewRoleBase] = useState<UserRole>('Employee');
  const [showNewRoleBaseDropdown, setShowNewRoleBaseDropdown] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchData();
      if (userToEdit) {
        setFullName(userToEdit.full_name || '');
        setEmail(userToEdit.email || '');
        setPhone(userToEdit.phone_number || '');
        
        // If they have a custom role (designation_id), set that as selected. Otherwise use base role.
        if (userToEdit.designation_id) {
          setSelectedRoleValue(userToEdit.designation_id);
        } else {
          setSelectedRoleValue(userToEdit.role || 'Employee');
        }
        
        setDepartmentId(userToEdit.department_id || '');
        setIsActive(userToEdit.is_active ?? true);
        setPassword('');
      } else {
        resetForm();
      }
    }
  }, [visible, userToEdit]);

  const fetchData = async () => {
    try {
      let deptQuery = supabase.from('departments').select('id, name').order('name');
      let desigQuery = supabase.from('designations').select('id, name, base_role').order('name');
      
      const targetCompId = companyId || profile?.company_id;
      if (targetCompId && isSuperAdmin(profile)) {
        deptQuery = deptQuery.eq('company_id', targetCompId);
        desigQuery = desigQuery.eq('company_id', targetCompId);
      }

      const [deptRes, desigRes] = await Promise.all([
        deptQuery,
        desigQuery
      ]);
      
      if (deptRes.error) throw deptRes.error;
      if (desigRes.error) throw desigRes.error;

      const loadedDepts = (deptRes.data as unknown as Department[]) || [];
      setDepartments(loadedDepts);
      setCustomRoles((desigRes.data as unknown as Designation[]) || []);

      if (!isEditing) {
        if (loadedDepts.length > 0 && !departmentId) {
          setDepartmentId(loadedDepts[0].id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching dynamic data:', err);
    }
  };

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setSelectedRoleValue('Employee');
    setDepartmentId(departments.length > 0 ? departments[0].id : '');
    setIsActive(true);
    setError(null);
    setShowAddDept(false);
    setShowAddRole(false);
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const targetCompanyId = companyId || profile?.company_id;
      const { data, error } = await supabase.from('departments')
        .insert({ 
          name: newDeptName.trim(),
          ...(targetCompanyId ? { company_id: targetCompanyId } : {})
        })
        .select('id, name').single();
      if (error) throw error;
      
      const newDepts = [...departments, data as unknown as Department].sort((a,b) => a.name.localeCompare(b.name));
      setDepartments(newDepts);
      setDepartmentId(data.id);
      setShowAddDept(false);
      setNewDeptName('');
      setShowDeptDropdown(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create department');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const targetCompanyId = companyId || profile?.company_id;
      const { data, error } = await supabase.from('designations')
        .insert({ 
          name: newRoleName.trim(),
          base_role: newRoleBase,
          ...(targetCompanyId ? { company_id: targetCompanyId } : {})
        })
        .select('id, name, base_role').single();
      if (error) throw error;
      
      const updatedRoles = [...customRoles, data as unknown as Designation].sort((a,b) => a.name.localeCompare(b.name));
      setCustomRoles(updatedRoles);
      setSelectedRoleValue(data.id);
      setShowAddRole(false);
      setNewRoleName('');
      setNewRoleBase('Employee');
      setShowRoleDropdown(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create custom role');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!fullName || !email || !phone || !selectedRoleValue || !departmentId) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!isEditing && !password) {
      setError('Initial password is required for new users.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Founder Protection checks
      if (userToEdit?.role === 'Founder' && !actorIsFounder) {
        setError('Super Admins are not permitted to modify Founder accounts.');
        setLoading(false);
        return;
      }

      // Determine the actual DB values
      let finalRole: UserRole = 'Employee';
      let finalDesignationId: string | null = null;

      if (availableBaseRoles.includes(selectedRoleValue as UserRole)) {
        finalRole = selectedRoleValue as UserRole;
        finalDesignationId = null;
      } else {
        // It's a custom role ID
        const customRole = customRoles.find(r => r.id === selectedRoleValue);
        if (customRole) {
          finalRole = customRole.base_role || 'Employee';
          finalDesignationId = customRole.id;
        }
      }

      if (isEditing) {
        // Update user
        const { error } = await supabase.rpc('admin_update_user', {
          p_target_user_id: userToEdit!.id,
          p_email: email,
          p_full_name: fullName,
          p_role: finalRole,
          p_department_id: departmentId,
          p_phone: phone,
          p_is_active: isActive,
          p_designation_id: finalDesignationId
        });
        if (error) throw error;

        // Optionally update password if provided during edit
        if (password) {
          const { error: pwError } = await supabase.rpc('admin_reset_password', {
            p_target_user_id: userToEdit!.id,
            p_new_password: password
          });
          if (pwError) throw pwError;
        }

      } else {
        // Create user
        const { error } = await supabase.rpc('admin_create_user', {
          p_email: email,
          p_password: password,
          p_full_name: fullName,
          p_role: finalRole,
          p_department_id: departmentId,
          p_phone: phone,
          p_designation_id: finalDesignationId
        });
        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving user:', err);
      setError(err.message || 'Failed to save user.');
    } finally {
      setLoading(false);
    }
  };

  const selectedDeptName = departments.find(d => d.id === departmentId)?.name || 'Select Department';
  
  // Resolve the display name for the selected role
  let selectedRoleDisplayName = 'Select System Role';
  if (ALL_BASE_ROLES.includes(selectedRoleValue as UserRole)) {
    selectedRoleDisplayName = DISPLAY_ROLES[selectedRoleValue as string] || selectedRoleValue;
  } else {
    const custom = customRoles.find(r => r.id === selectedRoleValue);
    if (custom) {
      selectedRoleDisplayName = custom.name;
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{isEditing ? 'Edit User' : 'Add New User'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="warning" size={16} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Input
              label="Full Name *"
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Jane Doe"
            />

            <Input
              label="Email Address *"
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. jane@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Input
              label="Phone Number *"
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. +1234567890"
              keyboardType="phone-pad"
            />

            {/* Department Dynamic Dropdown */}
            <View style={styles.dropdownContainer}>
              <Text style={styles.label}>Department *</Text>
              <TouchableOpacity 
                style={styles.dropdownButton} 
                onPress={() => { setShowDeptDropdown(!showDeptDropdown); setShowRoleDropdown(false); }}
              >
                <Text style={styles.dropdownButtonText}>{selectedDeptName}</Text>
                <Ionicons name={showDeptDropdown ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              {showDeptDropdown && (
                <View style={styles.dropdownList}>
                  {departments.map(d => (
                    <TouchableOpacity 
                      key={d.id} 
                      style={styles.dropdownItem}
                      onPress={() => { setDepartmentId(d.id); setShowDeptDropdown(false); setShowAddDept(false); }}
                    >
                      <Text style={[styles.dropdownItemText, departmentId === d.id && styles.dropdownItemTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                  
                  {showAddDept ? (
                    <View style={styles.inlineCreateContainer}>
                      <TextInput 
                        style={styles.inlineInput} 
                        placeholder="New Department Name" 
                        value={newDeptName}
                        onChangeText={setNewDeptName}
                        autoFocus
                      />
                      <TouchableOpacity style={styles.inlineSaveBtn} onPress={handleCreateDepartment}>
                        {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.inlineSaveBtnText}>Save</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.inlineCancelBtn} 
                        onPress={() => { setShowAddDept(false); setNewDeptName(''); setError(null); }}
                      >
                        <Ionicons name="close" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      style={styles.createItemBtn}
                      onPress={() => setShowAddDept(true)}
                    >
                      <Ionicons name="add" size={16} color={Colors.primary} />
                      <Text style={styles.createItemText}>Create New Department</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* Dynamic System Role Dropdown (Merged Roles & Designations) */}
            <View style={styles.dropdownContainer}>
              <Text style={styles.label}>System Role *</Text>
              <Text style={[styles.toggleHelpText, {marginBottom: 8}]}>
                Defines the user's title and permissions within ZeroTask.
              </Text>
              <TouchableOpacity 
                style={styles.dropdownButton} 
                onPress={() => { setShowRoleDropdown(!showRoleDropdown); setShowDeptDropdown(false); }}
              >
                <Text style={styles.dropdownButtonText}>{selectedRoleDisplayName}</Text>
                <Ionicons name={showRoleDropdown ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
              
              {showRoleDropdown && (
                <View style={styles.dropdownList}>
                  <Text style={styles.dropdownGroupLabel}>Base System Roles</Text>
                  {availableBaseRoles.map(r => (
                    <TouchableOpacity 
                      key={r} 
                      style={styles.dropdownItem}
                      onPress={() => { setSelectedRoleValue(r); setShowRoleDropdown(false); setShowAddRole(false); }}
                    >
                      <Text style={[styles.dropdownItemText, selectedRoleValue === r && styles.dropdownItemTextActive]}>
                        {DISPLAY_ROLES[r as string] || r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  {customRoles.length > 0 && (
                    <>
                      <View style={styles.dropdownSeparator} />
                      <Text style={styles.dropdownGroupLabel}>Custom Roles</Text>
                      {customRoles.map(cr => (
                        <TouchableOpacity 
                          key={cr.id} 
                          style={styles.dropdownItem}
                          onPress={() => { setSelectedRoleValue(cr.id); setShowRoleDropdown(false); setShowAddRole(false); }}
                        >
                          <Text style={[styles.dropdownItemText, selectedRoleValue === cr.id && styles.dropdownItemTextActive]}>
                            {cr.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                  
                  <View style={styles.dropdownSeparator} />
                  
                  {showAddRole ? (
                    <View style={styles.newRoleContainer}>
                      <TextInput 
                        style={[styles.inlineInput, { marginBottom: 8 }]} 
                        placeholder="Role Name (e.g. VP of Sales)" 
                        value={newRoleName}
                        onChangeText={setNewRoleName}
                        autoFocus
                      />
                      
                      <Text style={[styles.label, { fontSize: 12 }]}>Inherits Permissions From:</Text>
                      <TouchableOpacity 
                        style={[styles.dropdownButton, { height: 36, marginBottom: 8 }]} 
                        onPress={() => setShowNewRoleBaseDropdown(!showNewRoleBaseDropdown)}
                      >
                        <Text style={[styles.dropdownButtonText, { fontSize: 13 }]}>{DISPLAY_ROLES[newRoleBase as string] || newRoleBase}</Text>
                        <Ionicons name={showNewRoleBaseDropdown ? "chevron-up" : "chevron-down"} size={14} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      
                      {showNewRoleBaseDropdown && (
                        <View style={[styles.dropdownList, { marginTop: -4, marginBottom: 8 }]}>
                          {availableBaseRoles.map(r => (
                            <TouchableOpacity 
                              key={`base-${r}`} 
                              style={styles.dropdownItem}
                              onPress={() => { setNewRoleBase(r); setShowNewRoleBaseDropdown(false); }}
                            >
                              <Text style={styles.dropdownItemText}>{DISPLAY_ROLES[r as string] || r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={[styles.inlineSaveBtn, { flex: 1 }]} onPress={handleCreateCustomRole}>
                          {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.inlineSaveBtnText}>Create System Role</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.inlineCancelBtn} 
                          onPress={() => { setShowAddRole(false); setNewRoleName(''); setError(null); }}
                        >
                          <Ionicons name="close" size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity 
                      style={styles.createItemBtn}
                      onPress={() => setShowAddRole(true)}
                    >
                      <Ionicons name="add" size={16} color={Colors.primary} />
                      <Text style={styles.createItemText}>Create New System Role</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            <Input
              label={isEditing ? "Reset Password (Optional)" : "Initial Password *"}
              value={password}
              onChangeText={setPassword}
              placeholder={isEditing ? "Leave blank to keep unchanged" : "Secure password"}
              secureTextEntry
            />

            {isEditing && (
              <View style={styles.toggleContainer}>
                <Text style={styles.label}>Account Status</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, isActive && styles.toggleBtnActive]}
                    onPress={() => setIsActive(true)}
                  >
                    <Text style={[styles.toggleBtnText, isActive && styles.toggleBtnTextActive]}>Active</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, !isActive && styles.toggleBtnInactiveActive]}
                    onPress={() => setIsActive(false)}
                  >
                    <Text style={[styles.toggleBtnText, !isActive && styles.toggleBtnTextActive]}>Inactive</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.toggleHelpText}>
                  Inactive users cannot log into ZeroTask, but their historical data is preserved.
                </Text>
              </View>
            )}
            
            <View style={{ height: 40 }} />
          </ScrollView>

          <View style={styles.footer}>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={onClose}
              style={{ flex: 1 }}
              disabled={loading}
            />
            <Button
              title={isEditing ? "Save Changes" : "Create User"}
              onPress={handleSubmit}
              style={{ flex: 2 }}
              loading={loading}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Layout.radius.xl,
    borderTopRightRadius: Layout.radius.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Layout.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  form: {
    padding: Layout.spacing.lg,
  },
  formContent: {
    paddingBottom: Layout.spacing.xxl,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.md,
    marginBottom: Layout.spacing.lg,
    gap: 8,
  },
  errorText: {
    color: Colors.danger,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    flex: 1,
  },
  label: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Layout.spacing.xs,
  },
  dropdownContainer: {
    marginBottom: Layout.spacing.lg,
    position: 'relative',
    zIndex: 10,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.md,
    paddingHorizontal: Layout.spacing.md,
    height: 48,
  },
  dropdownButtonText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  dropdownList: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.md,
    marginTop: 4,
    ...Layout.shadow.card,
  },
  dropdownItem: {
    paddingVertical: Layout.spacing.sm + 2,
    paddingHorizontal: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  dropdownItemText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  dropdownItemTextActive: {
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  dropdownGroupLabel: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    paddingHorizontal: Layout.spacing.md,
    paddingTop: Layout.spacing.sm,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
  dropdownSeparator: {
    height: 1,
    backgroundColor: Colors.borderDefault,
    marginVertical: 4,
  },
  createItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Layout.spacing.sm + 2,
    paddingHorizontal: Layout.spacing.md,
    gap: 8,
  },
  createItemText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  inlineCreateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.sm,
    gap: Layout.spacing.sm,
  },
  newRoleContainer: {
    padding: Layout.spacing.sm,
    backgroundColor: Colors.background,
    borderBottomLeftRadius: Layout.radius.md,
    borderBottomRightRadius: Layout.radius.md,
  },
  inlineInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.sm,
    paddingHorizontal: Layout.spacing.md,
    height: 40,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  inlineSaveBtn: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Layout.spacing.md,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Layout.radius.sm,
  },
  inlineSaveBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  inlineCancelBtn: {
    paddingHorizontal: Layout.spacing.sm,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleContainer: {
    marginTop: Layout.spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Layout.spacing.md,
    marginTop: Layout.spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: Layout.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.surface,
  },
  toggleBtnActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  toggleBtnInactiveActive: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  toggleBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
  },
  toggleHelpText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: Layout.spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    padding: Layout.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderDefault,
    gap: Layout.spacing.md,
    backgroundColor: Colors.background,
  },
});
