import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asyncio
from app.core.database import AsyncSessionLocal
from app.models.task import Task
from app.models.user import User
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as s:
        users = (await s.execute(select(User))).scalars().all()
        tasks = (await s.execute(select(Task))).scalars().all()
        print(f"Total users: {len(users)}")
        for u in users:
            print(f"User: {u.id}, email={u.email}, role={u.role}, comp={u.company_id}")
        print(f"Total tasks: {len(tasks)}")
        for t in tasks:
            print(f"Task: {t.id}, title='{t.title}', status={t.status}, user_id={t.user_id}, created_by={t.created_by}, comp={t.company_id}, parent={t.parent_task_id}")

if __name__ == "__main__":
    asyncio.run(main())
