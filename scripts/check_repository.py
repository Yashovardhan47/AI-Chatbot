"""Fail CI if local configuration or generated environments enter Git again."""
import subprocess
from pathlib import PurePosixPath

paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
blocked = []
for name in filter(None, paths):
    path = PurePosixPath(name)
    if path.name == ".env" or any(part in {"node_modules", ".ven", ".venv", "venv", "__pycache__"} for part in path.parts) or path.suffix in {".pyc", ".pyo"}:
        blocked.append(name)
if blocked:
    raise SystemExit("Remove generated/local files from Git: " + ", ".join(blocked[:10]))
print("Repository hygiene passed")
