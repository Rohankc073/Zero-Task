import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { ProjectService } from '../../../src/services/projects/ProjectService';
import { Project, ProjectMilestone, Task } from '../../../src/types';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import TaskPreviewModal from '../../../src/components/TaskPreviewModal';

export default function ProjectsScreen() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  const [projectDetails, setProjectDetails] = useState<{ milestones: ProjectMilestone[], tasks: Task[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectDetails(selectedProjectId);
    } else {
      setProjectDetails(null);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    setLoading(true);
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
    
    // RLS will handle visibility, but let's just fetch all we have access to
    const { data, error } = await query;
    if (data && data.length > 0) {
      setProjects(data as Project[]);
      setSelectedProjectId(data[0].id);
    }
    setLoading(false);
  };

  const fetchProjectDetails = async (projectId: string) => {
    setDetailsLoading(true);
    const details = await ProjectService.getProjectDetails(projectId);
    setProjectDetails(details);
    setDetailsLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Done': return Colors.semanticSage;
      case 'In Progress': return Colors.semanticYellow;
      default: return Colors.textMuted;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />
      <View style={styles.header}>
        <Ionicons name="folder-open" size={24} color={Colors.primary} />
        <Text style={styles.headerTitle}>Projects</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No active projects found.</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Project Selector */}
          <View style={styles.pickerContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectList}>
              {projects.map(proj => (
                <TouchableOpacity 
                  key={proj.id} 
                  style={[styles.projectChip, selectedProjectId === proj.id && styles.projectChipSelected]}
                  onPress={() => setSelectedProjectId(proj.id)}
                >
                  <Text style={[styles.projectChipText, selectedProjectId === proj.id && styles.projectChipTextSelected]}>
                    {proj.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Project Details */}
          {detailsLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : projectDetails ? (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              
              {/* Milestones Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Project Milestones</Text>
                {projectDetails.milestones.length === 0 ? (
                  <Text style={styles.emptyText}>No milestones defined.</Text>
                ) : (
                  projectDetails.milestones.map(m => (
                    <View key={m.id} style={styles.milestoneCard}>
                      <View style={styles.milestoneHeader}>
                        <Text style={styles.milestoneTitle}>{m.title}</Text>
                        <View style={[styles.statusBadge, { borderColor: getStatusColor(m.status) }]}>
                          <Text style={[styles.statusText, { color: getStatusColor(m.status) }]}>{m.status}</Text>
                        </View>
                      </View>
                      {m.due_date && (
                        <Text style={styles.milestoneDate}>Due: {new Date(m.due_date).toLocaleDateString()}</Text>
                      )}
                      {m.description && (
                        <Text style={styles.milestoneDesc}>{m.description}</Text>
                      )}
                      {m.progress !== undefined && (
                        <View style={{ marginTop: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: Typography.fontFamily.semiBold }}>Progress</Text>
                            <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: Typography.fontFamily.semiBold }}>{m.progress}%</Text>
                          </View>
                          <View style={{ height: 6, backgroundColor: Colors.borderSubtle, borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${m.progress}%`, backgroundColor: m.progress === 100 ? Colors.semanticSage : Colors.primary }} />
                          </View>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>

              {/* Tasks Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Execution Tree (Tasks)</Text>
                {projectDetails.tasks.length === 0 ? (
                  <Text style={styles.emptyText}>No tasks in this project.</Text>
                ) : (
                  projectDetails.tasks.filter(t => !t.parent_task_id).map(t => (
                    <View key={t.id} style={styles.taskCard}>
                      <TouchableOpacity onPress={() => setSelectedTaskId(t.id)}>
                        <View style={styles.taskHeader}>
                          <Text style={styles.taskTitle}>{t.title}</Text>
                          <Text style={{ fontSize: 12, color: getStatusColor(t.status), fontFamily: Typography.fontFamily.semiBold }}>{t.status}</Text>
                        </View>
                        <Text style={styles.taskAssignee}>
                          {t.assignee?.full_name ? `Assigned to: ${t.assignee.full_name}` : 'Unassigned'}
                        </Text>
                      </TouchableOpacity>

                      {/* Subtasks (1 level deep visualization) */}
                      {projectDetails.tasks.filter(st => st.parent_task_id === t.id).map(st => (
                        <TouchableOpacity key={st.id} style={styles.subtaskCard} onPress={() => setSelectedTaskId(st.id)}>
                          <Ionicons name="return-down-forward" size={16} color={Colors.borderStrong} style={{ marginRight: 8 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subtaskTitle}>{st.title}</Text>
                            <Text style={styles.taskAssignee}>{st.assignee?.full_name || 'Unassigned'}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: getStatusColor(st.status) }}>{st.status}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          ) : null}
        </View>
      )}

      {selectedTaskId && (
        <TaskPreviewModal 
          taskId={selectedTaskId}
          visible={true}
          onClose={() => {
            setSelectedTaskId(null);
            if (selectedProjectId) fetchProjectDetails(selectedProjectId); // Refresh on close
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginLeft: Layout.spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  projectList: {
    flexDirection: 'row',
  },
  projectChip: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.sm,
    borderRadius: Layout.radius.full,
    marginRight: Layout.spacing.sm,
  },
  projectChipSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  projectChipText: {
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  },
  projectChipTextSelected: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  scrollContent: {
    padding: Layout.spacing.lg,
    paddingBottom: 40,
  },
  section: {
    marginBottom: Layout.spacing.section,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.regular,
    fontStyle: 'italic',
  },
  milestoneCard: {
    backgroundColor: Colors.surfaceRaised,
    padding: Layout.spacing.lg,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.md,
  },
  milestoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  milestoneTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  milestoneDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: 8,
  },
  milestoneDesc: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    textTransform: 'uppercase',
  },
  taskCard: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: Layout.spacing.md,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    flex: 1,
  },
  taskAssignee: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  subtaskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceRaised,
    padding: Layout.spacing.sm,
    marginTop: Layout.spacing.sm,
    borderRadius: Layout.radius.sm,
    marginLeft: Layout.spacing.lg,
  },
  subtaskTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  }
});
