#!/usr/bin/env python3
"""Build the allowlisted, relocatable Maevelle VPS tooling archive."""

import gzip
import hashlib
import io
import os
import stat
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path("/tmp/maevelle-phase03-tooling.tar.gz")
FILES = (
    "staging-deploy.py",
    "staging-migrate.sh",
    "staging/__init__.py",
    "staging/execute.py",
    "staging/host.py",
    "staging/manifest.py",
    "staging/plan.py",
    "staging/quadlet.py",
)


def source_bytes(member: str) -> bytes:
    relative = PurePosixPath(member)
    if relative.is_absolute() or ".." in relative.parts or not relative.parts:
        raise ValueError(f"Unsafe archive member: {member}")
    source = ROOT / "scripts" / member
    if source.is_symlink() or not source.is_file() or not stat.S_ISREG(source.stat().st_mode):
        raise ValueError(f"Expected regular, non-symlink source: {source}")
    return source.read_bytes()


def build() -> None:
    # Check the entire allowlist before creating an output file.
    contents = {member: source_bytes(member) for member in FILES}
    with tempfile.NamedTemporaryFile(dir=OUTPUT.parent, prefix=".maevelle-tooling-", suffix=".tar.gz", delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with temporary_path.open("wb") as raw:
            with gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode="w") as archive:
                    directory = tarfile.TarInfo("staging")
                    directory.type = tarfile.DIRTYPE
                    directory.mode = 0o755
                    directory.mtime = 0
                    archive.addfile(directory)
                    for member, content in contents.items():
                        info = tarfile.TarInfo(member)
                        info.size = len(content)
                        info.mode = 0o755 if member in ("staging-deploy.py", "staging-migrate.sh") else 0o644
                        info.mtime = 0
                        archive.addfile(info, io.BytesIO(content))
        os.chmod(temporary_path, 0o600)
        temporary_path.replace(OUTPUT)
    finally:
        temporary_path.unlink(missing_ok=True)
    with tarfile.open(OUTPUT, "r:gz") as archive:
        actual = [member.name for member in archive.getmembers() if member.isfile()]
        if actual != list(FILES) or any(member.issym() or member.islnk() or member.name.startswith("/") or ".." in PurePosixPath(member.name).parts for member in archive.getmembers()):
            OUTPUT.unlink(missing_ok=True)
            raise ValueError("Archive content verification failed")
    digest = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    checksum_file = OUTPUT.with_name(f"{OUTPUT.name}.sha256")
    checksum_file.write_text(f"{digest}  {OUTPUT.name}\n", encoding="ascii")
    os.chmod(checksum_file, 0o600)
    print(f"{OUTPUT}  sha256:{digest}")
    for member in actual:
        print(member)


if __name__ == "__main__":
    build()
