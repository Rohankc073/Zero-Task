import { TaskDraftService, TaskDraft } from '../../src/services/tasks/TaskDraftService';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('TaskDraftService - Production Draft Lifecycle & Isolation', () => {
  const userA = 'user-uuid-1111-aaaa';
  const userB = 'user-uuid-2222-bbbb';
  const companyA = 'company-uuid-alpha';
  const companyB = 'company-uuid-beta';

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('1. Opening Create Task with no draft gives null / blank draft', async () => {
    const draft = await TaskDraftService.loadDraft(userA, 'create_tab');
    expect(draft).toBeNull();
    const hasDraft = await TaskDraftService.hasDraft(userA, 'create_tab');
    expect(hasDraft).toBe(false);
  });

  test('2. Typing task data persists draft to persistent storage', async () => {
    const draftPayload: Partial<TaskDraft> = {
      title: 'Quarterly Audit Review',
      description: 'Review compliance documents for Q3',
      priority: 'High',
      deadline: '2026-10-15T09:00:00.000Z',
      assigneeIds: ['user-assignee-1'],
      taskMode: 'Delegated',
      companyId: companyA,
    };

    await TaskDraftService.saveDraft(userA, draftPayload, 'create_tab');

    const loaded = await TaskDraftService.loadDraft(userA, 'create_tab', companyA);
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Quarterly Audit Review');
    expect(loaded?.description).toBe('Review compliance documents for Q3');
    expect(loaded?.priority).toBe('High');
    expect(loaded?.assigneeIds).toEqual(['user-assignee-1']);
    expect(loaded?.userId).toBe(userA);
    expect(loaded?.companyId).toBe(companyA);
  });

  test('3. Successful self-assigned task deletes draft permanently from storage', async () => {
    // User enters self-assigned draft
    await TaskDraftService.saveDraft(
      userA,
      {
        title: 'Complete Personal Training Module',
        description: 'Self-assigned compliance training',
        priority: 'Low',
        taskMode: 'Self-Assigned',
        assigneeIds: [userA],
        companyId: companyA,
      },
      'create_tab'
    );

    expect(await TaskDraftService.hasDraft(userA, 'create_tab')).toBe(true);

    // Simulate backend successful commit
    const taskCreationSuccess = true;
    if (taskCreationSuccess) {
      await TaskDraftService.clearDraft(userA, 'create_tab');
    }

    const postDraft = await TaskDraftService.loadDraft(userA, 'create_tab', companyA);
    expect(postDraft).toBeNull();
    expect(await TaskDraftService.hasDraft(userA, 'create_tab')).toBe(false);
  });

  test('4. Successful delegated task deletes draft permanently from storage', async () => {
    await TaskDraftService.saveDraft(
      userA,
      {
        title: 'Review Engineering PR',
        description: 'Review PR #452 for authentication refactoring',
        priority: 'High',
        taskMode: 'Delegated',
        assigneeIds: ['dev-user-2'],
        companyId: companyA,
      },
      'create_tab'
    );

    expect(await TaskDraftService.hasDraft(userA, 'create_tab')).toBe(true);

    // After backend authoritative success
    await TaskDraftService.clearDraft(userA, 'create_tab');

    expect(await TaskDraftService.loadDraft(userA, 'create_tab', companyA)).toBeNull();
  });

  test('5. Reopening Create Task after successful creation yields completely blank draft', async () => {
    // Save draft, then create, then clear
    await TaskDraftService.saveDraft(userA, { title: 'Old Done Task' }, 'create_tab');
    await TaskDraftService.clearDraft(userA, 'create_tab');

    // Simulate reopening modal / tab
    const reopenedDraft = await TaskDraftService.loadDraft(userA, 'create_tab');
    expect(reopenedDraft).toBeNull();
  });

  test('6. Terminating and restarting app after successful creation remains blank', async () => {
    await TaskDraftService.saveDraft(userA, { title: 'Task to finish' }, 'create_tab');
    await TaskDraftService.clearDraft(userA, 'create_tab');

    // AsyncStorage persists state across "app restarts" in our mock.
    // Querying fresh on restart:
    const restartedDraft = await TaskDraftService.loadDraft(userA, 'create_tab');
    expect(restartedDraft).toBeNull();
  });

  test('7. Failed task creation preserves unfinished draft for retry', async () => {
    const draftPayload: Partial<TaskDraft> = {
      title: 'Critical Deployment Checklist',
      description: 'Step 1: check environment variables',
      priority: 'High',
    };
    await TaskDraftService.saveDraft(userA, draftPayload, 'create_tab');

    // Simulate backend network error / 500 error
    const createSucceeded = false;
    if (!createSucceeded) {
      // DO NOT clear draft on failure
    }

    // Draft must be preserved
    const preservedDraft = await TaskDraftService.loadDraft(userA, 'create_tab');
    expect(preservedDraft).not.toBeNull();
    expect(preservedDraft?.title).toBe('Critical Deployment Checklist');
  });

  test('8. Draft cleanup is strictly idempotent', async () => {
    // Calling clearDraft when no draft exists must not throw
    await expect(TaskDraftService.clearDraft(userA, 'create_tab')).resolves.not.toThrow();

    // Calling multiple times in sequence must be completely safe
    await TaskDraftService.saveDraft(userA, { title: 'Test' }, 'create_tab');
    await TaskDraftService.clearDraft(userA, 'create_tab');
    await expect(TaskDraftService.clearDraft(userA, 'create_tab')).resolves.not.toThrow();
    await expect(TaskDraftService.clearDraft(userA, 'create_tab')).resolves.not.toThrow();
  });

  test('9. User isolation: User B NEVER sees User A draft', async () => {
    await TaskDraftService.saveDraft(
      userA,
      {
        title: 'Confidential Strategy Notes',
        description: 'User A confidential data',
        companyId: companyA,
      },
      'create_tab'
    );

    // User B opens Create Task
    const userBDraft = await TaskDraftService.loadDraft(userB, 'create_tab', companyA);
    expect(userBDraft).toBeNull();

    // User A opens Create Task and still sees their own draft
    const userADraft = await TaskDraftService.loadDraft(userA, 'create_tab', companyA);
    expect(userADraft?.title).toBe('Confidential Strategy Notes');
  });

  test('10. Company isolation: Draft belonging to Company B is rejected for Company A', async () => {
    // Directly inject a draft with companyB
    const key = TaskDraftService.getStorageKey(userA, 'create_tab');
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        title: 'Cross-company leak attempt',
        description: 'Should never load under Company A',
        userId: userA,
        companyId: companyB,
        assigneeIds: [],
        updatedAt: Date.now(),
      })
    );

    // Try loading under companyA
    const loaded = await TaskDraftService.loadDraft(userA, 'create_tab', companyA);
    expect(loaded).toBeNull();

    // Verify it was purged from storage
    const purged = await AsyncStorage.getItem(key);
    expect(purged).toBeNull();
  });

  test('11. Attachments draft lifecycle: draft reference cleared without breaking final task', async () => {
    const mockDocument = {
      uri: 'file:///cache/document_123.pdf',
      name: 'document_123.pdf',
      size: 1024,
      mimeType: 'application/pdf',
    };

    await TaskDraftService.saveDraft(
      userA,
      {
        title: 'Task with document',
        documents: [mockDocument as any],
        companyId: companyA,
      },
      'create_tab'
    );

    const draftWithDoc = await TaskDraftService.loadDraft(userA, 'create_tab', companyA);
    expect(draftWithDoc?.documents?.length).toBe(1);
    expect(draftWithDoc?.documents?.[0].name).toBe('document_123.pdf');

    // On authoritative creation success, clear draft
    await TaskDraftService.clearDraft(userA, 'create_tab');

    // Verify draft reference is gone
    const clearedDraft = await TaskDraftService.loadDraft(userA, 'create_tab', companyA);
    expect(clearedDraft).toBeNull();
  });

  test('12. Voice note draft lifecycle: draft reference cleared upon success', async () => {
    const mockVoiceNote = {
      uri: 'file:///cache/voice_recording_1.m4a',
      localUri: 'file:///cache/voice_recording_1.m4a',
      durationSeconds: 15,
      displayName: 'Voice Note 1',
      noteNumber: 1,
      fileSize: 45000,
      mimeType: 'audio/m4a',
      metering: [-20, -15, -10],
    };

    await TaskDraftService.saveDraft(
      userA,
      {
        title: 'Task with voice note',
        pendingVoiceNotes: [mockVoiceNote],
        companyId: companyA,
      },
      'create_tab'
    );

    const draftWithVoice = await TaskDraftService.loadDraft(userA, 'create_tab', companyA);
    expect(draftWithVoice?.pendingVoiceNotes?.length).toBe(1);

    // Authoritative success -> clear draft
    await TaskDraftService.clearDraft(userA, 'create_tab');
    expect(await TaskDraftService.loadDraft(userA, 'create_tab', companyA)).toBeNull();
  });

  test('13. Subtask creation modal draft isolation from main task tab draft', async () => {
    const parentTaskId = 'parent-task-9999';
    const subtaskContext = `subtask_${parentTaskId}`;

    // User starts a tab draft
    await TaskDraftService.saveDraft(userA, { title: 'Main Tab Task' }, 'create_tab');

    // User opens subtask modal for parent task
    await TaskDraftService.saveDraft(
      userA,
      {
        title: 'Subtask 1 for Parent',
        parentTaskId,
      },
      subtaskContext
    );

    // Verify both drafts exist independently
    const tabDraft = await TaskDraftService.loadDraft(userA, 'create_tab');
    const subtaskDraft = await TaskDraftService.loadDraft(userA, subtaskContext);

    expect(tabDraft?.title).toBe('Main Tab Task');
    expect(subtaskDraft?.title).toBe('Subtask 1 for Parent');

    // Create subtask -> clear subtask draft only
    await TaskDraftService.clearDraft(userA, subtaskContext);

    expect(await TaskDraftService.loadDraft(userA, subtaskContext)).toBeNull();
    // Tab draft still preserved
    expect((await TaskDraftService.loadDraft(userA, 'create_tab'))?.title).toBe('Main Tab Task');
  });

  test('14. Saving an empty draft removes the key instead of bloating storage', async () => {
    // Save draft with content
    await TaskDraftService.saveDraft(userA, { title: 'Temporary Title' }, 'create_tab');
    expect(await TaskDraftService.hasDraft(userA, 'create_tab')).toBe(true);

    // User backspaces all text
    await TaskDraftService.saveDraft(userA, { title: '', description: '' }, 'create_tab');
    expect(await TaskDraftService.hasDraft(userA, 'create_tab')).toBe(false);
  });
});
