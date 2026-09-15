import React from "react";
import TaskWorkspaceModal, { TaskWorkspaceModalProps } from "./tasks/TaskWorkspaceModal";

export const TaskDetailModal: React.FC<TaskWorkspaceModalProps> = (props) => {
  return <TaskWorkspaceModal {...props} />;
};

export default TaskDetailModal;
