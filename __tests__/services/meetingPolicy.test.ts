import { MeetingPolicyService } from '../../src/services/meetings/MeetingPolicyService';
import { User, Meeting } from '../../src/types';

describe('MeetingPolicyService - Hierarchy, Approvals, and Cancellation', () => {
  const superAdmin: User = {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'admin@zerotask.internal',
    full_name: 'Super Admin',
    role: 'Super Admin',
  };

  const founderA: User = {
    id: 'aaaaaaaa-0001-0000-0000-000000000000',
    email: 'founder.a@acme.com',
    full_name: 'Founder A',
    role: 'Founder',
    company_id: '11111111-1111-1111-1111-111111111111',
  };

  const dhA: User = {
    id: 'aaaaaaaa-0002-0000-0000-000000000000',
    email: 'dh.a@acme.com',
    full_name: 'DH A',
    role: 'Department Head',
    company_id: '11111111-1111-1111-1111-111111111111',
  };

  const managerA: User = {
    id: 'aaaaaaaa-0003-0000-0000-000000000000',
    email: 'mgr.a@acme.com',
    full_name: 'Manager A',
    role: 'Manager',
    company_id: '11111111-1111-1111-1111-111111111111',
  };

  const employeeA1: User = {
    id: 'aaaaaaaa-0004-0000-0000-000000000000',
    email: 'emp1.a@acme.com',
    full_name: 'Employee A1',
    role: 'Employee',
    company_id: '11111111-1111-1111-1111-111111111111',
  };

  const employeeA2: User = {
    id: 'aaaaaaaa-0005-0000-0000-000000000000',
    email: 'emp2.a@acme.com',
    full_name: 'Employee A2',
    role: 'Employee',
    company_id: '11111111-1111-1111-1111-111111111111',
  };

  const allUsers = [superAdmin, founderA, dhA, managerA, employeeA1, employeeA2];

  test('Super Admin scheduling requires NO approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(superAdmin, [founderA, dhA], allUsers);
    expect(res.requiresApproval).toBe(false);
  });

  test('Founder scheduling with internal members requires NO approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(founderA, [dhA, managerA, employeeA1], allUsers);
    expect(res.requiresApproval).toBe(false);
  });

  test('Founder scheduling with Super Admin REQUIRES approval from Super Admin', () => {
    const res = MeetingPolicyService.determineApprovalChain(founderA, [superAdmin], allUsers);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalSteps.length).toBe(1);
    expect(res.approvalSteps[0].approverId).toBe(superAdmin.id);
  });

  test('DH scheduling with Founder REQUIRES Founder approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(dhA, [founderA], allUsers);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalSteps[0].approverRole).toBe('Founder');
  });

  test('DH scheduling with DH, Manager, Employee requires NO approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(dhA, [managerA, employeeA1], allUsers);
    expect(res.requiresApproval).toBe(false);
  });

  test('Manager scheduling with Founder REQUIRES Founder approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(managerA, [founderA], allUsers);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalSteps[0].approverRole).toBe('Founder');
  });

  test('Manager scheduling with DH REQUIRES DH approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(managerA, [dhA], allUsers);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalSteps[0].approverRole).toBe('Department Head');
  });

  test('Manager scheduling with Manager or Employee requires NO approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(managerA, [employeeA1], allUsers);
    expect(res.requiresApproval).toBe(false);
  });

  test('Employee scheduling with Founder REQUIRES Founder approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(employeeA1, [founderA], allUsers);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalSteps[0].approverRole).toBe('Founder');
  });

  test('Employee scheduling with DH REQUIRES DH approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(employeeA1, [dhA], allUsers);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalSteps[0].approverRole).toBe('Department Head');
  });

  test('Employee scheduling with Manager REQUIRES Manager approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(employeeA1, [managerA], allUsers);
    expect(res.requiresApproval).toBe(true);
    expect(res.approvalSteps[0].approverRole).toBe('Manager');
  });

  test('Employee scheduling with Employee (peer) requires NO approval', () => {
    const res = MeetingPolicyService.determineApprovalChain(employeeA1, [employeeA2], allUsers);
    expect(res.requiresApproval).toBe(false);
  });

  test('Cancellation: Employee cannot cancel senior meeting', () => {
    const seniorMeeting: Meeting = {
      id: 'm1',
      title: 'Founder All Hands',
      start_time: '2026-10-01T10:00:00Z',
      end_time: '2026-10-01T11:00:00Z',
      organizer_id: founderA.id,
      organizer: founderA,
      company_id: founderA.company_id,
      agenda: null,
      participants: [{ user: founderA }, { user: employeeA1 }],
    };

    expect(MeetingPolicyService.canCancelMeeting(employeeA1, seniorMeeting)).toBe(false);
    expect(MeetingPolicyService.canCancelMeeting(founderA, seniorMeeting)).toBe(true);
    expect(MeetingPolicyService.canCancelMeeting(superAdmin, seniorMeeting)).toBe(true);
  });

  test('Cancellation: Employee CAN cancel peer meeting they organized', () => {
    const peerMeeting: Meeting = {
      id: 'm2',
      title: 'Peer Sync',
      start_time: '2026-10-01T10:00:00Z',
      end_time: '2026-10-01T11:00:00Z',
      organizer_id: employeeA1.id,
      organizer: employeeA1,
      company_id: employeeA1.company_id,
      agenda: null,
      participants: [{ user: employeeA1 }, { user: employeeA2 }],
    };

    expect(MeetingPolicyService.canCancelMeeting(employeeA1, peerMeeting)).toBe(true);
  });
});
