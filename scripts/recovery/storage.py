"""Provider-neutral immutable set storage; mounted remote adapter is opt-in."""

import hashlib
import os
import shutil
import uuid
from pathlib import Path
from typing import Protocol

from recovery.contract import SET_ID

ALLOWED_FILES = {"database.dump.age", "media.tar.age", "quiescence.json", "capture-manifest.json", "verified-manifest.json"}
REMOTE_TYPES = {"nfs", "nfs4", "cifs", "fuse.sshfs", "fuse.rclone", "fuse.s3fs", "fuse.goofys"}


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def _safe_child(root: Path, name: str) -> Path:
    if not SET_ID.fullmatch(name) or root.is_symlink():
        raise ValueError("Unsafe recovery-set storage target")
    path = root / name
    if path.is_symlink():
        raise ValueError("Symlinked recovery-set storage target")
    return path


class StoragePort(Protocol):
    provider: str

    def put_immutable(self, set_id: str, files: dict[str, Path]) -> str: ...
    def readback_sha256(self, set_id: str, name: str) -> str: ...
    def delete_exact(self, set_id: str, names: set[str]) -> None: ...


class MountedStorage:
    """Remote mount supplies transport/credentials; this adapter never knows them."""

    provider = "mounted-filesystem"

    def __init__(self, root: Path, *, require_remote: bool = True):
        if not root.is_absolute() or ".." in root.parts or root.is_symlink() or not root.is_dir():
            raise ValueError("Unsafe mounted storage root")
        if require_remote:
            if str(root) != "/mnt/maevelle-staging-backups" or not os.path.ismount(root):
                raise ValueError("Approved off-host mount is unavailable")
            mount_lines = Path("/proc/self/mountinfo").read_text(encoding="utf-8").splitlines()
            types = [line.split(" - ", 1)[1].split()[0] for line in mount_lines if " - " in line and line.split()[4].replace("\\040", " ") == str(root)]
            if len(types) != 1 or types[0] not in REMOTE_TYPES:
                raise ValueError("Off-host mount type is not recognized")
        self.root = root
        self.require_remote = require_remote
        self.mount_identity = (root.stat().st_dev, root.stat().st_ino)

    def _assert_mount(self) -> None:
        if self.root.is_symlink() or not self.root.is_dir() or (self.root.stat().st_dev, self.root.stat().st_ino) != self.mount_identity:
            raise ValueError("Off-host mount identity changed")
        if self.require_remote and not os.path.ismount(self.root):
            raise ValueError("Off-host mount disappeared")

    def put_immutable(self, set_id: str, files: dict[str, Path]) -> str:
        self._assert_mount()
        if not files or not set(files) <= ALLOWED_FILES:
            raise ValueError("Unexpected recovery artifact names")
        target = _safe_child(self.root, set_id)
        if target.exists():
            if not target.is_dir() or any(item.is_symlink() or not item.is_file() or item.name not in ALLOWED_FILES for item in target.iterdir()):
                raise ValueError("Unsafe existing off-host recovery set")
            for name, source in files.items():
                if source.is_symlink() or not source.is_file():
                    raise ValueError("Unsafe local recovery artifact")
                destination = target / name
                if destination.exists() or destination.is_symlink():
                    if destination.is_symlink() or not destination.is_file() or digest(destination) != digest(source):
                        raise ValueError("Existing off-host object differs from immutable source")
                    continue
                temporary_file = target / f".upload-{uuid.uuid4().hex}"
                try:
                    with source.open("rb") as src, temporary_file.open("xb") as dst:
                        os.fchmod(dst.fileno(), 0o600)
                        shutil.copyfileobj(src, dst, 1024 * 1024)
                        dst.flush()
                        os.fsync(dst.fileno())
                    if digest(temporary_file) != digest(source):
                        raise ValueError("Interrupted off-host upload")
                    os.link(temporary_file, destination)
                except FileExistsError:
                    if destination.is_symlink() or digest(destination) != digest(source):
                        raise ValueError("Existing off-host object differs from immutable source") from None
                finally:
                    temporary_file.unlink(missing_ok=True)
            self._assert_mount()
            return f"maevelle/staging/{set_id}/set"
        temporary = self.root / f".upload-{set_id}-{uuid.uuid4().hex}"
        temporary.mkdir(mode=0o700)
        try:
            for name, source in files.items():
                if source.is_symlink() or not source.is_file():
                    raise ValueError("Unsafe local recovery artifact")
                destination = temporary / name
                with source.open("rb") as src, destination.open("xb") as dst:
                    os.fchmod(dst.fileno(), 0o600)
                    shutil.copyfileobj(src, dst, 1024 * 1024)
                    dst.flush()
                    os.fsync(dst.fileno())
                if digest(destination) != digest(source):
                    raise ValueError("Interrupted or corrupt off-host upload")
            directory_fd = os.open(temporary, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            temporary.rename(target)
            self._assert_mount()
            return f"maevelle/staging/{set_id}/set"
        finally:
            if temporary.exists():
                for child in temporary.iterdir():
                    if child.is_symlink() or not child.is_file() or child.name not in ALLOWED_FILES:
                        raise ValueError("Unsafe interrupted upload requires operator review")
                    child.unlink()
                temporary.rmdir()

    def readback_sha256(self, set_id: str, name: str) -> str:
        self._assert_mount()
        if name not in ALLOWED_FILES:
            raise ValueError("Unexpected off-host object name")
        target = _safe_child(self.root, set_id) / name
        if target.is_symlink() or not target.is_file():
            raise ValueError("Off-host object missing or unsafe")
        result = digest(target)
        self._assert_mount()
        return result

    def delete_exact(self, set_id: str, names: set[str]) -> None:
        self._assert_mount()
        if not names or not names <= ALLOWED_FILES:
            raise ValueError("Unsafe off-host deletion selection")
        target = _safe_child(self.root, set_id)
        if not target.is_dir():
            raise ValueError("Off-host set missing")
        actual = {entry.name for entry in target.iterdir()}
        if actual != names or any(entry.is_symlink() or not entry.is_file() for entry in target.iterdir()):
            raise ValueError("Off-host set contents differ from retention plan")
        for name in sorted(names):
            self._assert_mount()
            (target / name).unlink()
        target.rmdir()
        self._assert_mount()
