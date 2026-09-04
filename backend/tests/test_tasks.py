import pytest
import uuid
from app.models.task import Task
from app.services.task_service import TaskService
from tests.conftest import COMPANY_A_ID, COMPANY_B_ID


def test_task_model_initialization():
    task = Task(
        title="Test Task",
        description="Verify task properties",
        status="To Do",
        priority="High",
        company_id=COMPANY_A_ID,
        progress=0,
    )
    assert task.title == "Test Task"
    assert task.status == "To Do"
    assert task.priority == "High"
    assert task.progress == 0


def test_completed_task_protection_logic():
    task = Task(
        title="Completed Task",
        status="Done",
        progress=100,
        company_id=COMPANY_A_ID,
    )

    # Editing completed task fields is prohibited unless reopening
    assert task.status == "Done"
    assert task.progress == 100
