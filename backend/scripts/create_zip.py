import os
import zipfile

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ZIP_PATH = os.path.join(ROOT_DIR, "zerotask-updated-files.zip")
CHANGED_FILES_PATH = os.path.join(ROOT_DIR, "CHANGED_FILES.txt")

print(f"Creating zip at {ZIP_PATH} from {ROOT_DIR}...")
if os.path.exists(ZIP_PATH):
    try:
        os.remove(ZIP_PATH)
    except Exception:
        pass

# Read list of files to include
files_to_zip = []
if os.path.exists(CHANGED_FILES_PATH):
    with open(CHANGED_FILES_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                files_to_zip.append(line)

print(f"Found {len(files_to_zip)} files listed in CHANGED_FILES.txt")

added_count = 0
with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zipf:
    for rel_path in files_to_zip:
        full_path = os.path.join(ROOT_DIR, rel_path.replace("/", os.sep))
        if os.path.exists(full_path) and os.path.isfile(full_path):
            zipf.write(full_path, arcname=rel_path)
            print(f"  + Added: {rel_path}")
            added_count += 1
        else:
            print(f"  ! Skipped (not found): {rel_path} ({full_path})")

print(f"\nSuccessfully packaged {added_count} files into {ZIP_PATH} (size: {os.path.getsize(ZIP_PATH)} bytes)")
