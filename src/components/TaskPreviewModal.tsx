import React from "react";
import TaskWorkspaceModal, { TaskWorkspaceModalProps } from "./tasks/TaskWorkspaceModal";

export const TaskPreviewModal: React.FC<TaskWorkspaceModalProps> = (props) => {
  return <TaskWorkspaceModal {...props} />;
};

export default TaskPreviewModal;
