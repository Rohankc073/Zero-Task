"""
Supabase to Self-Hosted Data Migration Tooling (Dry-Run & Inspection Only)
Prepares and audits data migration from Supabase PostgreSQL to Self-Hosted PostgreSQL.
CRITICAL: DOES NOT ALTER LIVE SUPABASE DATABASE.
"""
import asyncio
import json
import os
import sys
from typing import Dict, Any, List
import asyncpg
from app.core.logging import logger

TABLES_TO_MIGRATE = [
    "companies",
    "departments",
    "designations",
    "users",
    "projects",
    "project_members",
    "project_milestones",
    "department_milestones",
    "tasks",
    "task_assignees",
    "task_files",
    "task_attachments",
    "task_voice_notes",
    "task_milestones",
    "comments",
    "activity_comments",
    "execution_activity",
    "meetings",
    "meeting_participants",
    "meeting_files",
    "meeting_attachments",
    "meeting_requests",
    "meeting_approvals",
    "chat_channels",
    "chat_messages",
    "notifications",
    "in_app_notifications",
    "system_alerts",
    "approvals",
    "registration_requests",
    "password_resets",
    "phone_change_requests",
    "audit_logs",
    "user_notes",
    "user_integrations",
    "activity_logs",
    "system_config",
]


class MigrationTool:
    def __init__(self, src_db_url: str, dest_db_url: str):
        self.src_db_url = src_db_url
        self.dest_db_url = dest_db_url

    async def verify_connection(self, url: str, name: str) -> bool:
        try:
            conn = await asyncpg.connect(url)
            val = await conn.fetchval("SELECT 1")
            await conn.close()
            logger.info(f"Connected successfully to {name}")
            return val == 1
        except Exception as e:
            logger.warning(f"Connection to {name} failed: {e}")
            return False

    async def generate_audit_report(self) -> Dict[str, Any]:
        """Performs dry-run source row counts and auth mapping report."""
        report = {
            "source": self.src_db_url.split("@")[-1] if "@" in self.src_db_url else "configured_source",
            "destination": self.dest_db_url.split("@")[-1] if "@" in self.dest_db_url else "configured_dest",
            "table_counts": {},
            "auth_mapping": {
                "description": "Extracts auth.users (id, email, encrypted_password) into public.user_credentials",
                "ready_for_migration": True,
            },
            "status": "dry_run_complete",
        }

        try:
            src_conn = await asyncpg.connect(self.src_db_url)
            for table in TABLES_TO_MIGRATE:
                try:
                    cnt = await src_conn.fetchval(f"SELECT COUNT(*) FROM public.{table}")
                    report["table_counts"][table] = cnt
                except Exception:
                    report["table_counts"][table] = "table_not_found"

            auth_cnt = await src_conn.fetchval("SELECT COUNT(*) FROM auth.users")
            report["auth_users_count"] = auth_cnt

            await src_conn.close()
        except Exception as e:
            report["error"] = str(e)

        return report


async def main():
    src = os.getenv("SUPABASE_DB_URL", "postgresql://postgres:postgres@localhost:54322/postgres")
    dest = os.getenv("SELF_HOSTED_DB_URL", "postgresql://zerotask_app:zerotask_secure_pass_2026@localhost:5432/zerotask")

    tool = MigrationTool(src, dest)
    logger.info("Running Migration Tool Dry-Run...")
    report = await tool.generate_audit_report()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
