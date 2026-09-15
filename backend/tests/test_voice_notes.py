import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException
from app.models.user import User
from app.models.task import Task, TaskVoiceNote
from app.schemas.task import TaskVoiceNoteCreate
from app.services.storage_service import ALLOWED_BUCKETS
from app.api.v1.tasks import list_task_voice_notes, create_task_voice_note, delete_task_voice_note
from tests.conftest import (
    COMPANY_A_ID,
    COMPANY_B_ID,
    USER_FOUNDER_A_ID,
    USER_EMPLOYEE_A_ID,
    USER_EMPLOYEE_B_ID,
    make_user,
)


@pytest.fixture
def founder_a():
    return make_user(USER_FOUNDER_A_ID, "founder@acme.com", "Founder", COMPANY_A_ID)


@pytest.fixture
def employee_a():
    return make_user(USER_EMPLOYEE_A_ID, "employee@acme.com", "Employee", COMPANY_A_ID)


@pytest.fixture
def employee_b():
    return make_user(USER_EMPLOYEE_B_ID, "employee@beta.com", "Employee", COMPANY_B_ID)


@pytest.fixture
def sample_task():
    return Task(
        id=uuid.UUID("11111111-2222-3333-4444-555555555555"),
        title="Voice Note Test Task",
        company_id=COMPANY_A_ID,
        created_by=USER_FOUNDER_A_ID,
        user_id=USER_EMPLOYEE_A_ID,
        status="To Do",
        priority="High",
        progress=0,
    )


@pytest.fixture
def sample_voice_note(sample_task):
    return TaskVoiceNote(
        id=uuid.UUID("66666666-7777-8888-9999-000000000000"),
        task_id=sample_task.id,
        creator_id=USER_FOUNDER_A_ID,
        storage_path=f"voice-notes/{sample_task.id}/note_1.m4a",
        display_name="Voice Note 1",
        note_number=1,
        duration_seconds=15,
        mime_type="audio/mp4",
        file_size=32768,
    )


def test_task_audio_bucket_security():
    """Verify task-audio bucket is strictly private and enforces 20MB limit."""
    assert "task-audio" in ALLOWED_BUCKETS
    bucket_cfg = ALLOWED_BUCKETS["task-audio"]
    assert bucket_cfg["public"] is False
    assert bucket_cfg["max_size"] == 20 * 1024 * 1024


@pytest.mark.asyncio
async def test_list_voice_notes_authorized_creator(founder_a, sample_task, sample_voice_note):
    """Task creator can retrieve voice notes attached to task."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [sample_voice_note]
    mock_db.execute.return_value = mock_result

    with patch("app.services.task_service.task_service.get_task_by_id", return_value=sample_task):
        notes = await list_task_voice_notes(sample_task.id, founder_a, mock_db)
        assert len(notes) == 1
        assert notes[0].display_name == "Voice Note 1"
        assert notes[0].duration_seconds == 15


@pytest.mark.asyncio
async def test_list_voice_notes_authorized_assignee(employee_a, sample_task, sample_voice_note):
    """Assigned user can access and view the same voice note."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [sample_voice_note]
    mock_db.execute.return_value = mock_result

    with patch("app.services.task_service.task_service.get_task_by_id", return_value=sample_task):
        notes = await list_task_voice_notes(sample_task.id, employee_a, mock_db)
        assert len(notes) == 1
        assert notes[0].storage_path == sample_voice_note.storage_path


@pytest.mark.asyncio
async def test_list_voice_notes_cross_company_isolation(employee_b, sample_task):
    """User from Company B cannot access Task A voice notes (404/isolation)."""
    mock_db = AsyncMock()
    # Task service returns None for cross-company user
    with patch("app.services.task_service.task_service.get_task_by_id", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            await list_task_voice_notes(sample_task.id, employee_b, mock_db)
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_voice_note_persists(founder_a, sample_task):
    """Creating a voice note attaches row to DB and links to task."""
    mock_db = AsyncMock()
    payload = TaskVoiceNoteCreate(
        task_id=sample_task.id,
        creator_id=founder_a.id,
        storage_path=f"voice-notes/{sample_task.id}/note_1.m4a",
        display_name="Voice Note 1",
        note_number=1,
        duration_seconds=22,
        mime_type="audio/mp4",
        file_size=45000,
    )

    with patch("app.services.task_service.task_service.get_task_by_id", return_value=sample_task):
        res = await create_task_voice_note(sample_task.id, payload, founder_a, mock_db)
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        assert res.task_id == sample_task.id
        assert res.duration_seconds == 22


@pytest.mark.asyncio
async def test_delete_voice_note_authorization(employee_a, founder_a, sample_task, sample_voice_note):
    """Unauthorized employee cannot delete creator's voice note (403 Forbidden)."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = sample_voice_note
    mock_db.execute.return_value = mock_result

    with patch("app.services.task_service.task_service.get_task_by_id", return_value=sample_task):
        with pytest.raises(HTTPException) as exc_info:
            await delete_task_voice_note(sample_voice_note.id, employee_a, mock_db)
        assert exc_info.value.status_code == 403

    # But Founder can delete
    with patch("app.services.task_service.task_service.get_task_by_id", return_value=sample_task):
        del_res = await delete_task_voice_note(sample_voice_note.id, founder_a, mock_db)
        assert del_res["message"] == "Task voice note deleted"
        mock_db.delete.assert_called_once_with(sample_voice_note)
