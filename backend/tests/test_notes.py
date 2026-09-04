import pytest
import uuid
from app.models.user import UserNote
from app.api.v1.notes import NoteCreate, NoteUpdate, NoteResponse

def test_note_model_initialization():
    user_id = uuid.uuid4()
    note = UserNote(
        user_id=user_id,
        title="Architecture Meeting Notes",
        content="Migrating to self-hosted FastAPI and MinIO.",
    )
    assert note.title == "Architecture Meeting Notes"
    assert note.content == "Migrating to self-hosted FastAPI and MinIO."
    assert note.user_id == user_id


def test_note_schemas():
    create_schema = NoteCreate(title="Sprint Plan", content="Complete Phase 3 adapter")
    assert create_schema.title == "Sprint Plan"
    assert create_schema.content == "Complete Phase 3 adapter"

    update_schema = NoteUpdate(title="Updated Sprint Plan")
    assert update_schema.title == "Updated Sprint Plan"
    assert update_schema.content is None

    note_id = uuid.uuid4()
    user_id = uuid.uuid4()
    response_schema = NoteResponse(
        id=note_id,
        user_id=user_id,
        title="Sprint Plan",
        content="Testing schema",
        created_at="2026-09-04T00:00:00Z",
        updated_at="2026-09-04T00:00:00Z",
    )
    assert response_schema.id == note_id
    assert response_schema.user_id == user_id
