import os
from pathlib import Path
import shutil
import subprocess


def test_launcher_updates_existing_installation_from_lockfiles(tmp_path):
    source = Path(__file__).resolve().parents[1] / "run.sh"
    shutil.copyfile(source, tmp_path / "run.sh")
    (tmp_path / "node_modules").mkdir()
    binaries = tmp_path / "bin"
    binaries.mkdir()
    python = tmp_path / ".venv" / "bin" / "python"
    python.parent.mkdir(parents=True)
    for name, path in [("node", binaries / "node"), ("npm", binaries / "npm"), ("python", python)]:
        path.write_text(f'#!/bin/sh\nprintf "%s\\n" "{name} $*" >> "$LAUNCH_LOG"\n')
        path.chmod(0o755)
    log = tmp_path / "launch.log"
    environment = os.environ | {"PATH": str(binaries) + os.pathsep + os.environ["PATH"], "LAUNCH_LOG": str(log)}
    subprocess.run(["bash", str(tmp_path / "run.sh")], env=environment, check=True)
    steps = log.read_text().splitlines()
    assert "npm ci" in steps
    assert steps.index("npm ci") < steps.index("npm run build")
    assert "python -m pip install --require-hashes -r requirements.lock" in steps
