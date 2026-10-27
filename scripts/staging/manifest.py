import json
import hashlib
import re
from pathlib import Path

SERVICES = ("api", "worker", "admin", "storefront")
SHA = re.compile(r"^[a-f0-9]{40}$")
DIGEST = re.compile(r"^sha256:[a-f0-9]{64}$")
BASELINE = "ccd405c1e6fa8c827307977b947a4a3dbce859f5"
BASELINE_NAMES_MD5 = "3bd263cd94c5b618bce254724b854201"


def validate(manifest: dict) -> dict:
    if not isinstance(manifest, dict) or set(manifest) != {
        "formatVersion", "status", "commitSha", "shortSha", "builtAt", "images", "schema"
    }:
        raise ValueError("Release manifest fields are invalid")
    sha = manifest["commitSha"]
    if manifest["formatVersion"] != 1 or manifest["status"] != "published":
        raise ValueError("Unsupported or incomplete release manifest")
    if not isinstance(sha, str) or not SHA.fullmatch(sha) or manifest["shortSha"] != sha[:12]:
        raise ValueError("Release commit identity is invalid")
    if not isinstance(manifest["builtAt"], str) or not re.fullmatch(
        r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z", manifest["builtAt"]
    ):
        raise ValueError("Release build time is invalid")
    images = manifest["images"]
    if not isinstance(images, dict) or set(images) != set(SERVICES):
        raise ValueError("Release must contain exactly four Maevelle application images")
    for service in SERVICES:
        image = images[service]
        repository = f"ghcr.io/iamashrafee/maevelle-{service}"
        if not isinstance(image, dict) or set(image) != {"repository", "digest", "ref"}:
            raise ValueError(f"Invalid {service} image fields")
        digest = image["digest"]
        if image["repository"] != repository or not isinstance(digest, str) or not DIGEST.fullmatch(digest) or image["ref"] != f"{repository}@{digest}":
            raise ValueError(f"Invalid {service} image identity or digest")
    schema = manifest["schema"]
    if not isinstance(schema, dict) or set(schema) != {"baselineRelease", "migrationNames"} or schema["baselineRelease"] != BASELINE:
        raise ValueError("Invalid schema compatibility metadata")
    names = schema["migrationNames"]
    if not isinstance(names, list) or len(names) < 51 or names != sorted(set(names)) or any(
        not isinstance(name, str) or not re.fullmatch(r"\d{4}_[a-z0-9_]+", name) for name in names
    ):
        raise ValueError("Migration names are missing, duplicated or out of order")
    if hashlib.md5("\n".join(names[:51]).encode(), usedforsecurity=False).hexdigest() != BASELINE_NAMES_MD5:
        raise ValueError("Release migration history differs from verified baseline")
    return manifest


def load(path: Path) -> dict:
    return validate(json.loads(path.read_text(encoding="utf-8")))
