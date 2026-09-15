import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def setup():
    conn = psycopg2.connect('postgresql://postgres:root@localhost:5432/postgres')
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    # Check if role exists
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'zerotask_app';")
    if not cur.fetchone():
        cur.execute("CREATE ROLE zerotask_app WITH LOGIN PASSWORD 'zerotask_secure_pass_2026' SUPERUSER CREATEDB;")
        print("Created role zerotask_app")
    else:
        cur.execute("ALTER ROLE zerotask_app WITH PASSWORD 'zerotask_secure_pass_2026' SUPERUSER;")
        print("Updated role zerotask_app")

    # Check if database exists
    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'zerotask';")
    if not cur.fetchone():
        cur.execute("CREATE DATABASE zerotask OWNER zerotask_app;")
        print("Created database zerotask")
    else:
        print("Database zerotask already exists")

    conn.close()

if __name__ == '__main__':
    setup()
