#!/usr/bin/env python3
"""Check pinned direct versions against official registries and Backstage peers."""
import concurrent.futures
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent


def registry(url):
    with urlopen(url, timeout=30) as response:
        return json.load(response)


def version_tuple(value):
    return tuple(int(part) for part in value.split("."))


def main():
    package = json.loads((ROOT / "package.json").read_text())
    direct = package["dependencies"] | package["devDependencies"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        metadata = dict(pool.map(
            lambda name: (name, registry("https://registry.npmjs.org/" + quote(name, safe=""))),
            direct,
        ))
    backstage = metadata["@backstage/frontend-defaults"]
    peers = backstage["versions"][backstage["dist-tags"]["latest"]]["peerDependencies"]
    failures = []
    print("Package | Selected | Registry latest | Expected policy")
    for name, selected in direct.items():
        data = metadata[name]
        latest = data["dist-tags"]["latest"]
        expected, policy = latest, "latest stable"
        if name in {"react", "react-dom", "@types/react", "@types/react-dom", "react-router-dom"}:
            peer_name = "@types/react" if name == "@types/react-dom" else name
            allowed = {int(value) for value in re.findall(r"\^(\d+)\.", peers[peer_name])}
            compatible = [value for value in data["versions"] if re.fullmatch(r"\d+\.\d+\.\d+", value) and int(value.split(".")[0]) in allowed]
            expected = max(compatible, key=version_tuple)
            policy = "latest compatible with Backstage stable"
        print(f"{name} | {selected} | {latest} | {policy}")
        if selected != expected:
            failures.append(f"{name}: expected {expected}, selected {selected}")
    for line in (ROOT / "requirements.txt").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        name, selected = line.split("==")
        latest = registry(f"https://pypi.org/pypi/{name}/json")["info"]["version"]
        print(f"{name} | {selected} | {latest} | latest stable")
        if selected != latest:
            failures.append(f"{name}: expected {latest}, selected {selected}")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print("All direct dependencies match their official stable/compatibility policy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
