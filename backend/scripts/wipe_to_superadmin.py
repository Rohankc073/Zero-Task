"""
Script to wipe all companies, non-superadmin users, tasks, projects, meetings,
chats, attachments, audio, and all related records from ZeroTask.
Preserves ONLY superadmin@zerotask.com with credentials intact.
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio
import boto3
from botocore.config import Config
from sqlalchemy import text
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import verify_password
from app.models.user import User, UserCredential
from sqlalchemy import select


async def wipe_database():
    print("\n--- 1. PURGING POSTGRESQL TABLES ---")
    async with AsyncSessionLocal() as session:
        # Step 1: Detach superadmins from any company, dept, designation
        print("Detaching superadmins from company, department, and designation...")
        await session.execute(
            text(
                """
                UPDATE users 
                SET company_id = NULL, department_id = NULL, designation_id = NULL 
                WHERE role = 'Super Admin' OR email = 'superadmin@zerotask.com';
            """
            )
        )

        # Tables to empty completely
        tables_to_empty = [
            "task_voice_notes",
            "task_files",
            "task_attachments",
            "task_assignees",
            "task_milestones",
            "activity_comments",
            "comments",
            "execution_activity",
            "tasks",
            "project_milestones",
            "project_members",
            "projects",
            "meeting_files",
            "meeting_attachments",
            "meeting_participants",
            "meeting_approvals",
            "meeting_requests",
            "meetings",
            "chat_messages",
            "chat_channels",
            "notifications",
            "in_app_notifications",
            "system_alerts",
            "approvals",
            "registration_requests",
            "password_resets",
            "phone_change_requests",
            "user_push_tokens",
            "user_integrations",
            "user_notes",
            "user_refresh_tokens",
            "activity_logs",
            "audit_logs",
            "department_milestones",
        ]

        for table in tables_to_empty:
            res = await session.execute(text(f"DELETE FROM {table};"))
            print(f"Cleared {table}")

        # Delete non-superadmin credentials and users
        print("Purging non-superadmin user credentials...")
        await session.execute(
            text(
                """
                DELETE FROM user_credentials 
                WHERE user_id NOT IN (
                    SELECT id FROM users WHERE role = 'Super Admin' OR email = 'superadmin@zerotask.com'
                );
            """
            )
        )

        print("Purging non-superadmin users...")
        await session.execute(
            text(
                """
                DELETE FROM users 
                WHERE role != 'Super Admin' AND email != 'superadmin@zerotask.com';
            """
            )
        )

        # Now clear designations, departments, companies
        print("Purging designations, departments, companies...")
        await session.execute(text("DELETE FROM designations;"))
        await session.execute(text("DELETE FROM departments;"))
        await session.execute(text("DELETE FROM companies;"))

        await session.commit()
        print("Database purge committed successfully.")


def wipe_minio():
    print("\n--- 2. PURGING MINIO STORAGE OBJECTS ---")
    try:
        endpoint = f"{'https' if settings.MINIO_USE_SSL else 'http'}://{settings.MINIO_ENDPOINT}"
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4", connect_timeout=3, retries={"max_attempts": 1}),
            region_name=settings.MINIO_REGION,
        )

        buckets_resp = s3.list_buckets()
        buckets = [b["Name"] for b in buckets_resp.get("Buckets", [])]
        print(f"Found MinIO buckets: {buckets}")

        for bucket in buckets:
            paginator = s3.get_paginator("list_objects_v2")
            deleted_count = 0
            for page in paginator.paginate(Bucket=bucket):
                contents = page.get("Contents", [])
                for obj in contents:
                    s3.delete_object(Bucket=bucket, Key=obj["Key"])
                    deleted_count += 1
            print(f"Bucket '{bucket}': Deleted {deleted_count} object(s).")
    except Exception as e:
        print(f"MinIO storage purge skipped (service not reachable): {e}")


async def verify_state():
    print("\n--- 3. VERIFYING SYSTEM STATE ---")
    async with AsyncSessionLocal() as session:
        # Check users
        users_res = await session.execute(
            text("SELECT id, email, role, company_id, department_id, is_active FROM users;")
        )
        users = users_res.fetchall()
        print(f"Users remaining ({len(users)}):")
        for u in users:
            print(f"  - ID: {u[0]}, Email: {u[1]}, Role: {u[2]}, Company: {u[3]}, Dept: {u[4]}, Active: {u[5]}")

        # Check credentials
        creds_res = await session.execute(
            text("SELECT user_id, length(password_hash) FROM user_credentials;")
        )
        creds = creds_res.fetchall()
        print(f"Credentials remaining ({len(creds)}):")
        for c in creds:
            print(f"  - UserID: {c[0]}, HashLength: {c[1]}")

        # Check superadmin password verification
        res = await session.execute(select(User).where(User.email == "superadmin@zerotask.com"))
        superadmin = res.scalar_one_or_none()
        if superadmin:
            res_cred = await session.execute(
                select(UserCredential).where(UserCredential.user_id == superadmin.id)
            )
            cred = res_cred.scalar_one_or_none()
            is_valid = verify_password("Test@123", cred.password_hash) if cred else False
            print(f"Superadmin 'Test@123' password check: {'VALID' if is_valid else 'INVALID'}")
        else:
            print("ERROR: Superadmin was deleted!")

        # Check key table row counts
        tables_to_check = [
            "companies",
            "departments",
            "designations",
            "tasks",
            "task_assignees",
            "task_attachments",
            "task_files",
            "task_voice_notes",
            "projects",
            "meetings",
            "chat_channels",
            "chat_messages",
            "approvals",
            "notifications",
            "in_app_notifications",
            "audit_logs",
        ]

        print("\nTable row counts:")
        all_zero = True
        for tbl in tables_to_check:
            cnt_res = await session.execute(text(f"SELECT count(*) FROM {tbl};"))
            cnt = cnt_res.scalar()
            print(f"  - {tbl}: {cnt}")
            if cnt != 0:
                all_zero = False

        if all_zero and len(users) == 1 and users[0][1] == "superadmin@zerotask.com":
            print("\n>>> ALL CHECKS PASSED: SYSTEM CLEAN WITH ONLY SUPERADMIN PRESERVED! <<<")
        else:
            print("\n>>> WARNING: SOME TABLES ARE NOT EMPTY OR USERS COUNT IS NOT 1 <<<")


async def main():
    await wipe_database()
    wipe_minio()
    await verify_state()


if __name__ == "__main__":
    asyncio.run(main())
