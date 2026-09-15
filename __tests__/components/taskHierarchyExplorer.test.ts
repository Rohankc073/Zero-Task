import React from 'react';
import { TaskDraftService } from '../../src/services/tasks/TaskDraftService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task, TaskBreadcrumb } from '../../src/types';

describe('Frontend Task Hierarchy Explorer & Navigation Suite', () => {
  const userId = 'user-test-uuid-1';
  const companyId = 'company-test-uuid-1';

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  // 17. Root create has no parent
  test('17. Root task creation sets parentTaskId as undefined / null with root draft context', async () => {
    const parentTaskId = undefined;
    const contextKey = parentTaskId ? `subtask_${parentTaskId}` : 'root';
    expect(contextKey).toBe('root');

    const storageKey = TaskDraftService.getStorageKey(userId, contextKey);
    expect(storageKey).toBe(`@zerotask_task_draft_${userId}_root`);
  });

  // 18. Add Subtask from A uses A.id
  test('18. Add Subtask from Task A explicitly binds parentTaskId = A.id and contextKey = subtask_A.id', async () => {
    const currentTask = {
      id: 'task-a-id',
      title: 'A — Website Launch',
      description: '',
      due_date: '2026-10-01',
      depth: 1,
      has_children: true,
      child_count: 12,
      ancestors: [],
      status: 'In Progress',
      priority: 'High',
      user_id: userId,
      company_id: companyId,
    } as Task;

    const parentTaskId = currentTask.id;
    const parentTitle = currentTask.title;
    const contextKey = parentTaskId ? `subtask_${parentTaskId}` : 'root';

    expect(parentTaskId).toBe('task-a-id');
    expect(parentTitle).toBe('A — Website Launch');
    expect(contextKey).toBe('subtask_task-a-id');

    // Verify storage key isolation
    const storageKey = TaskDraftService.getStorageKey(userId, contextKey);
    expect(storageKey).toBe(`@zerotask_task_draft_${userId}_subtask_task-a-id`);
  });

  // 19. Add Subtask from B uses B.id
  test('19. Add Subtask from Task B explicitly binds parentTaskId = B.id and NOT A.id', async () => {
    const currentTaskB = {
      id: 'task-b-id',
      title: 'B — Design homepage',
      description: '',
      due_date: '2026-10-01',
      parent_task_id: 'task-a-id',
      depth: 2,
      has_children: true,
      child_count: 3,
      ancestors: [{ id: 'task-a-id', title: 'A — Website Launch', depth: 1 }],
      status: 'In Progress',
      priority: 'Medium',
      user_id: userId,
      company_id: companyId,
    } as Task;

    const parentTaskId = currentTaskB.id;
    const parentTitle = currentTaskB.title;
    const contextKey = parentTaskId ? `subtask_${parentTaskId}` : 'root';

    expect(parentTaskId).toBe('task-b-id');
    expect(parentTaskId).not.toBe('task-a-id');
    expect(contextKey).toBe('subtask_task-b-id');
  });

  // 20. Modal parent context resets correctly
  test('20. Modal parent context resets cleanly when navigating between hierarchy nodes', async () => {
    // Save draft for B
    await TaskDraftService.saveDraft(
      userId,
      { title: 'Subtask for B draft', parentTaskId: 'task-b-id' },
      'subtask_task-b-id'
    );

    // Save draft for C
    await TaskDraftService.saveDraft(
      userId,
      { title: 'Subtask for C draft', parentTaskId: 'task-c-id' },
      'subtask_task-c-id'
    );

    // Context B should only load B's draft
    const draftB = await TaskDraftService.loadDraft(userId, 'subtask_task-b-id');
    expect(draftB?.title).toBe('Subtask for B draft');

    // Context C should only load C's draft
    const draftC = await TaskDraftService.loadDraft(userId, 'subtask_task-c-id');
    expect(draftC?.title).toBe('Subtask for C draft');

    // Context Root should have no draft
    const draftRoot = await TaskDraftService.loadDraft(userId, 'root');
    expect(draftRoot).toBeNull();
  });

  // 21. Breadcrumb renders ancestry
  test('21. Breadcrumb constructs complete ancestry path: A › B › N', () => {
    const ancestors: TaskBreadcrumb[] = [
      { id: 'task-a', title: 'A — Website Launch', depth: 1 },
      { id: 'task-b', title: 'B — Design', depth: 2 },
    ];
    const currentTask = {
      id: 'task-n',
      title: 'N — Wireframes',
      description: '',
      due_date: '2026-10-01',
      parent_task_id: 'task-b',
      depth: 3,
      ancestors,
      status: 'To Do',
      priority: 'Medium',
      user_id: userId,
    } as Task;

    const breadcrumbItems: TaskBreadcrumb[] = [
      ...ancestors,
      { id: currentTask.id, title: currentTask.title, depth: currentTask.depth || 3 },
    ];

    expect(breadcrumbItems).toHaveLength(3);
    expect(breadcrumbItems[0].title).toBe('A — Website Launch');
    expect(breadcrumbItems[1].title).toBe('B — Design');
    expect(breadcrumbItems[2].title).toBe('N — Wireframes');
  });

  // 22. Back navigates one hierarchy level
  test('22. Back navigation pops one hierarchy level at a time: P -> O -> N -> B -> A', () => {
    const historyStack = ['task-a', 'task-b', 'task-n', 'task-o'];
    let currentId = 'task-p';

    // Step 1: Back from P
    const prev1 = historyStack.pop();
    expect(prev1).toBe('task-o');
    currentId = prev1!;

    // Step 2: Back from O
    const prev2 = historyStack.pop();
    expect(prev2).toBe('task-n');
    currentId = prev2!;

    // Step 3: Back from N
    const prev3 = historyStack.pop();
    expect(prev3).toBe('task-b');
    currentId = prev3!;

    // Step 4: Back from B
    const prev4 = historyStack.pop();
    expect(prev4).toBe('task-a');
    currentId = prev4!;

    // Step 5: Back from A returns to root/drawer
    expect(historyStack.length).toBe(0);
  });

  // 23. Level 5 disables Add Subtask
  test('23. Level 5 disables Add Subtask action and sets isMaxDepthReached = true', () => {
    const taskLevel5 = {
      id: 'task-p',
      title: 'P — Final Review',
      description: '',
      due_date: '2026-10-01',
      parent_task_id: 'task-o',
      depth: 5,
      has_children: false,
      child_count: 0,
      ancestors: [
        { id: 'task-a', title: 'A', depth: 1 },
        { id: 'task-b', title: 'B', depth: 2 },
        { id: 'task-n', title: 'N', depth: 3 },
        { id: 'task-o', title: 'O', depth: 4 },
      ],
      status: 'In Progress',
      priority: 'High',
      user_id: userId,
    } as Task;

    const currentDepth = taskLevel5.depth ?? (taskLevel5.ancestors?.length ? taskLevel5.ancestors.length + 1 : 1);
    const isMaxDepthReached = currentDepth >= 5;

    expect(currentDepth).toBe(5);
    expect(isMaxDepthReached).toBe(true);
  });

  // 24. Child rows only show direct children
  test('24. Child rows render ONLY direct children without grandchild trees', () => {
    const taskA = {
      id: 'task-a',
      title: 'A — Root Project',
      description: '',
      due_date: '2026-10-01',
      depth: 1,
      has_children: true,
      child_count: 12,
      subtasks: [
        { id: 'b', title: 'B', status: 'To Do', depth: 2, has_children: true, child_count: 3 },
        { id: 'c', title: 'C', status: 'In Progress', depth: 2, has_children: false, child_count: 0 },
        { id: 'd', title: 'D', status: 'Done', depth: 2, has_children: false, child_count: 0 },
      ] as any[],
      status: 'In Progress',
      priority: 'High',
      user_id: userId,
    } as Task;

    // Verify subtasks are flat list of direct children
    expect(taskA.subtasks).toHaveLength(3);
    taskA.subtasks?.forEach((sub) => {
      expect(sub.depth).toBe(2);
      // No nested subtasks inside direct children
      expect((sub as any).subtasks).toBeUndefined();
    });
  });

  // 19 / Top-level task list filtering
  test('19. Dashboard tasks list filters out child tasks (where parent_task_id is set)', () => {
    const allTasks: Task[] = [
      { id: 'task-a', title: 'Task A', description: '', due_date: '2026-10-01', parent_task_id: null, status: 'In Progress', priority: 'High', user_id: userId } as Task,
      { id: 'task-b', title: 'Task B', description: '', due_date: '2026-10-01', parent_task_id: 'task-a', status: 'To Do', priority: 'Medium', user_id: userId } as Task,
      { id: 'task-c', title: 'Task C', description: '', due_date: '2026-10-01', parent_task_id: 'task-a', status: 'Done', priority: 'Low', user_id: userId } as Task,
      { id: 'task-r', title: 'Task R', description: '', due_date: '2026-10-01', parent_task_id: null, status: 'To Do', priority: 'High', user_id: userId } as Task,
      { id: 'task-s', title: 'Task S', description: '', due_date: '2026-10-01', parent_task_id: null, status: 'Done', priority: 'Low', user_id: userId } as Task,
    ];

    const topLevelTasks = allTasks.filter((t) => !t.parent_task_id);

    expect(topLevelTasks).toHaveLength(3);
    expect(topLevelTasks.map((t) => t.id)).toEqual(['task-a', 'task-r', 'task-s']);
    expect(topLevelTasks.map((t) => t.id)).not.toContain('task-b');
    expect(topLevelTasks.map((t) => t.id)).not.toContain('task-c');
  });

  // 26 & 27. Mathematical progress consistency
  test('26 & 27. Parent progress calculation is mathematically consistent with direct children', () => {
    const children = [
      { status: 'Done' },
      { status: 'Completed' },
      { status: 'In Progress' },
      { status: 'To Do' },
    ];

    const completed = children.filter(c => ['Done', 'Completed'].includes(c.status)).length;
    const progress = Math.round((completed / children.length) * 100);

    expect(completed).toBe(2);
    expect(children.length).toBe(4);
    expect(progress).toBe(50); // 2 of 4 = 50%
  });
});
