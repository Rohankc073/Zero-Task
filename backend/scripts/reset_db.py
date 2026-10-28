import asyncio
import uuid
import sys
from datetime import datetime, timezone
from sqlalchemy import text

# Add the parent directory to sys.path so we can import 'app'
import os
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import engine, Base, AsyncSessionLocal
from app.models import *  # Import all models to populate Base.metadata
from app.models.user import User, UserCredential
from app.core.security import get_password_hash

async def reset_db():
    print("Connecting to the database...")
    async with engine.begin() as conn:
        tables = [table.name for table in reversed(Base.metadata.sorted_tables) if table.name != "alembic_version"]
        
        if tables:
            # Need to disable triggers temporarily to bypass foreign key constraints, or just use CASCADE
            truncate_query = f"TRUNCATE TABLE {', '.join(tables)} CASCADE;"
            print("Executing:", truncate_query)
            await conn.execute(text(truncate_query))
            print("Successfully truncated tables.")
    
    print("Creating superadmin user...")
    async with AsyncSessionLocal() as session:
        user_id = uuid.uuid4()
        superadmin = User(
            id=user_id,
            email="superadmin@zerotask.com",
            name="Super Admin",
            full_name="Super Admin",
            role="Super Admin",
            is_approved=True,
            is_active=True,
            is_deleted=False,
            onboarding_completed=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        cred = UserCredential(
            user_id=user_id,
            password_hash=get_password_hash("Test@123"),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        session.add(superadmin)
        session.add(cred)
        await session.commit()
        print("Superadmin created successfully.")

if __name__ == "__main__":
    asyncio.run(reset_db())
