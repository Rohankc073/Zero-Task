from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserNote

router = APIRouter()


class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class NoteResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    content: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_model(cls, model: UserNote) -> "NoteResponse":
        return cls(
            id=model.id,
            user_id=model.user_id,
            title=model.title,
            content=model.content,
            created_at=model.created_at.isoformat() if model.created_at else None,
            updated_at=model.updated_at.isoformat() if model.updated_at else None,
        )


@router.get("", response_model=List[NoteResponse])
async def list_notes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(UserNote)
        .where(UserNote.user_id == current_user.id)
        .order_by(UserNote.created_at.desc())
    )
    res = await db.execute(stmt)
    notes = res.scalars().all()
    return [NoteResponse.from_orm_model(n) for n in notes]


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = UserNote(
        user_id=current_user.id,
        title=data.title,
        content=data.content,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteResponse.from_orm_model(note)


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: UUID,
    data: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(UserNote).where(UserNote.id == note_id, UserNote.user_id == current_user.id)
    res = await db.execute(stmt)
    note = res.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    if data.title is not None:
        note.title = data.title
    if data.content is not None:
        note.content = data.content

    await db.commit()
    await db.refresh(note)
    return NoteResponse.from_orm_model(note)


@router.delete("/{note_id}", status_code=status.HTTP_200_OK)
async def delete_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(UserNote).where(UserNote.id == note_id, UserNote.user_id == current_user.id)
    res = await db.execute(stmt)
    note = res.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    await db.delete(note)
    await db.commit()
    return {"status": "success", "deleted_id": str(note_id)}
