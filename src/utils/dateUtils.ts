export function isTaskOverdue(dateStr?: string | null, isDone?: boolean): boolean {
  if (!dateStr || isDone) return false;
  
  const due = new Date(dateStr);
  if (isNaN(due.getTime())) return false;
  
  // Set both to the start of their respective local days
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // It is only overdue if the due date is strictly BEFORE today
  return due.getTime() < today.getTime();
}

export function getDaysOverdue(dateStr?: string | null, isDone?: boolean): number {
  if (!isTaskOverdue(dateStr, isDone)) return 0;
  if (!dateStr) return 0;
  
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

export function getDaysLeft(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
