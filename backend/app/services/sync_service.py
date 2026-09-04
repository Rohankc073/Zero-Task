from typing import Dict, Any, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.models.user import User
from app.schemas.sync import SyncBatchRequest, SyncBatchResponse, MutationResultItem
from app.core.logging import logger

ALLOWED_SYNC_TABLES = {"tasks", "comments", "user_notes", "execution_activity"}


class SyncService:
    @staticmethod
    async def process_batch(
        db: AsyncSession, current_user: User, batch: SyncBatchRequest
    ) -> SyncBatchResponse:
        results: List[MutationResultItem] = []
        success_count = 0
        failed_count = 0

        for mutation in batch.mutations:
            table = mutation.table
            action = mutation.action

            # Security Guardrail: Only authorized tables can be synced offline
            if table not in ALLOWED_SYNC_TABLES:
                results.append(
                    MutationResultItem(
                        id=mutation.id,
                        status="error",
                        error=f"Table {table} is not permitted for offline mutation replay",
                    )
                )
                failed_count += 1
                continue

            try:
                if action == "UPDATE" and mutation.match_value and mutation.payload:
                    match_col = mutation.match_key or "id"
                    set_clauses = ", ".join([f"{k} = :{k}" for k in mutation.payload.keys()])
                    params = dict(mutation.payload)
                    params["match_val"] = str(mutation.match_value)

                    if table == "user_notes":
                        params["current_user_id"] = str(current_user.id)
                        query = f"UPDATE public.{table} SET {set_clauses} WHERE {match_col} = :match_val AND user_id = :current_user_id"
                    elif table == "tasks":
                        params["user_company_id"] = str(current_user.company_id)
                        query = f"UPDATE public.{table} SET {set_clauses} WHERE {match_col} = :match_val AND company_id = :user_company_id"
                    else:
                        query = f"UPDATE public.{table} SET {set_clauses} WHERE {match_col} = :match_val"

                    if current_user.role == "Super Admin":
                        query = f"UPDATE public.{table} SET {set_clauses} WHERE {match_col} = :match_val"

                    await db.execute(text(query), params)
                    results.append(MutationResultItem(id=mutation.id, status="success"))
                    success_count += 1

                elif action == "INSERT" and mutation.payload:
                    payload = dict(mutation.payload)
                    if table == "user_notes":
                        payload["user_id"] = str(current_user.id)
                    elif table == "comments":
                        payload["user_id"] = str(current_user.id)
                    elif table == "tasks":
                        if "company_id" not in payload or current_user.role != "Super Admin":
                            payload["company_id"] = str(current_user.company_id)
                        if "created_by" not in payload:
                            payload["created_by"] = str(current_user.id)
                    elif table == "execution_activity":
                        payload["user_id"] = str(current_user.id)

                    cols = ", ".join(payload.keys())
                    vals = ", ".join([f":{k}" for k in payload.keys()])
                    query = f"INSERT INTO public.{table} ({cols}) VALUES ({vals})"

                    await db.execute(text(query), payload)
                    results.append(MutationResultItem(id=mutation.id, status="success"))
                    success_count += 1

                elif action == "DELETE" and mutation.match_value:
                    match_col = mutation.match_key or "id"
                    params = {"match_val": str(mutation.match_value)}

                    if table == "user_notes":
                        params["current_user_id"] = str(current_user.id)
                        query = f"DELETE FROM public.{table} WHERE {match_col} = :match_val AND user_id = :current_user_id"
                    elif table == "tasks":
                        params["user_company_id"] = str(current_user.company_id)
                        query = f"DELETE FROM public.{table} WHERE {match_col} = :match_val AND company_id = :user_company_id"
                    else:
                        query = f"DELETE FROM public.{table} WHERE {match_col} = :match_val"

                    if current_user.role == "Super Admin":
                        query = f"DELETE FROM public.{table} WHERE {match_col} = :match_val"

                    await db.execute(text(query), params)
                    results.append(MutationResultItem(id=mutation.id, status="success"))
                    success_count += 1

                else:
                    results.append(MutationResultItem(id=mutation.id, status="skipped", error="Malformed payload"))
                    failed_count += 1

            except Exception as e:
                logger.error(f"Failed processing offline mutation {mutation.id}: {e}")
                results.append(MutationResultItem(id=mutation.id, status="error", error=str(e)))
                failed_count += 1

        await db.commit()

        return SyncBatchResponse(
            processed_count=len(batch.mutations),
            success_count=success_count,
            failed_count=failed_count,
            results=results,
        )


sync_service = SyncService()
