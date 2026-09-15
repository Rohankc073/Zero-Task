import asyncio
from app.core.database import engine
from sqlalchemy import text


async def inspect_tables():
    async with engine.connect() as conn:
        res = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name;"
            )
        )
        tables = [r[0] for r in res.fetchall()]
        print(f"TOTAL_PUBLIC_TABLES_COUNT={len(tables)}")
        app_tables = [t for t in tables if t != "alembic_version"]
        print(f"APPLICATION_TABLES_COUNT={len(app_tables)}")
        
        print("\n--- DETAILED CANONICAL INVENTORY ---")
        for i, t in enumerate(tables, 1):
            cnt = (await conn.execute(text(f'SELECT count(*) FROM "{t}"'))).scalar()
            col_res = await conn.execute(
                text(
                    "SELECT column_name, data_type, is_nullable "
                    "FROM information_schema.columns "
                    f"WHERE table_schema = 'public' AND table_name = '{t}' "
                    "ORDER BY ordinal_position;"
                )
            )
            cols = col_res.fetchall()
            col_summary = ", ".join([f"{c[0]} ({c[1]})" for c in cols[:4]])
            if len(cols) > 4:
                col_summary += f", ... (+{len(cols)-4} more cols)"
            print(f"{i:2d}. {t} (rows: {cnt}, cols: {len(cols)}) -> [{col_summary}]")


if __name__ == "__main__":
    asyncio.run(inspect_tables())
