from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class MutationItem(BaseModel):
    id: str
    action: str = Field(..., pattern="^(INSERT|UPDATE|DELETE)$")
    table: str
    match_key: Optional[str] = "id"
    match_value: Optional[Any] = None
    payload: Optional[Dict[str, Any]] = None
    timestamp: int


class SyncBatchRequest(BaseModel):
    mutations: List[MutationItem]
    idempotency_key: Optional[str] = None


class MutationResultItem(BaseModel):
    id: str
    status: str  # success, error, skipped
    error: Optional[str] = None


class SyncBatchResponse(BaseModel):
    processed_count: int
    success_count: int
    failed_count: int
    results: List[MutationResultItem]
