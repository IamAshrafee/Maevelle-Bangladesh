"""Small read-only GHCR client for published Maevelle staging-ready tags."""

import base64
import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = "ghcr.io/iamashrafee/maevelle-release"
ORIGIN = "https://ghcr.io"
PATH = "/v2/iamashrafee/maevelle-release"
READY = re.compile(r"staging-ready-([0-9]{12})-([a-f0-9]{12})\Z")
DIGEST = re.compile(r"sha256:[a-f0-9]{64}\Z")


def credentials() -> tuple[str, str] | None:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "/run/user/1001")
    paths = [Path(os.environ["REGISTRY_AUTH_FILE"])] if os.environ.get("REGISTRY_AUTH_FILE") else [
        Path(runtime) / "containers/auth.json", Path.home() / ".config/containers/auth.json"
    ]
    for path in paths:
        if not path.is_file() or path.is_symlink():
            continue
        details = path.stat()
        if details.st_uid != os.geteuid() or details.st_mode & 0o077:
            raise RuntimeError("GHCR auth file must be private to maevelle")
        config = json.loads(path.read_text(encoding="utf-8"))
        helper = config.get("credHelpers", {}).get("ghcr.io") or config.get("credsStore")
        if helper:
            if not re.fullmatch(r"[a-zA-Z0-9_-]+", helper):
                raise RuntimeError("Invalid GHCR credential helper")
            result = subprocess.run([f"docker-credential-{helper}", "get"], input="ghcr.io\n", text=True, capture_output=True, timeout=5, check=False)
            if result.returncode:
                raise RuntimeError("GHCR credential helper has no usable login")
            value = json.loads(result.stdout)
            return value["Username"], value["Secret"]
        for key in ("ghcr.io", "https://ghcr.io", "https://ghcr.io/v1/"):
            encoded = config.get("auths", {}).get(key, {}).get("auth")
            if encoded:
                user, token = base64.b64decode(encoded, validate=True).decode().split(":", 1)
                if user and token:
                    return user, token
    return None


class Ghcr:
    def __init__(self, opener=urllib.request.urlopen, credential_provider=credentials):
        self.opener = opener
        self.credential_provider = credential_provider
        self.bearer = None

    def _request(self, url: str, method: str = "GET"):
        headers = {"Accept": "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json"}
        if self.bearer:
            headers["Authorization"] = f"Bearer {self.bearer}"
        request = urllib.request.Request(url, headers=headers, method=method)
        try:
            return self.opener(request, timeout=15)
        except urllib.error.HTTPError as error:
            error.close()
            if error.code != 401 or self.bearer:
                raise RuntimeError(f"GHCR {method} failed (HTTP {error.code})") from None
            challenge = error.headers.get("www-authenticate", "")
            values = dict(re.findall(r'(\w+)="([^"]+)"', challenge))
            realm = urllib.parse.urlparse(values.get("realm", ""))
            if realm.scheme != "https" or realm.hostname != "ghcr.io" or values.get("scope") != "repository:iamashrafee/maevelle-release:pull":
                raise RuntimeError("Unexpected GHCR challenge") from None
            identity = self.credential_provider()
            query = urllib.parse.urlencode({"service": values.get("service", "ghcr.io"), "scope": values["scope"]})
            token_headers = {}
            if identity:
                token_headers["Authorization"] = "Basic " + base64.b64encode(f"{identity[0]}:{identity[1]}".encode()).decode()
            try:
                with self.opener(urllib.request.Request(f"{values['realm']}?{query}", headers=token_headers), timeout=15) as grant:
                    self.bearer = json.load(grant)["token"]
            except urllib.error.HTTPError as grant_error:
                grant_error.close()
                if grant_error.code in (401, 403):
                    raise RuntimeError("GHCR login rejected or lacks read:packages" if identity else "Private GHCR release requires a rootless maevelle login") from None
                raise RuntimeError(f"GHCR token request failed (HTTP {grant_error.code})") from None
            try:
                return self.opener(urllib.request.Request(url, headers={**headers, "Authorization": f"Bearer {self.bearer}"}, method=method), timeout=15)
            except urllib.error.HTTPError as retry_error:
                retry_error.close()
                if retry_error.code in (401, 403):
                    raise RuntimeError("GHCR login rejected or lacks read:packages" if identity else "Private GHCR release requires a rootless maevelle login") from None
                raise RuntimeError(f"GHCR {method} failed (HTTP {retry_error.code})") from None

    def latest(self) -> tuple[int, str, str] | None:
        url = f"{ORIGIN}{PATH}/tags/list?n=100"
        highest = None
        while url:
            with self._request(url) as response:
                data = json.load(response)
                link = response.headers.get("Link")
            for tag in data.get("tags") or []:
                match = READY.fullmatch(tag)
                if match:
                    candidate = (int(match[1]), match[2], tag)
                    if highest is None or candidate[0] > highest[0]:
                        highest = candidate
                    elif candidate[0] == highest[0] and candidate[2] != highest[2]:
                        raise RuntimeError("Conflicting GHCR ready tags for one pipeline")
            if not link:
                break
            match = re.fullmatch(r'<([^>]+)>;\s*rel="next"', link)
            if not match:
                raise RuntimeError("Unexpected GHCR pagination")
            next_url = urllib.parse.urljoin(ORIGIN, match[1])
            parsed = urllib.parse.urlparse(next_url)
            if parsed.scheme != "https" or parsed.netloc != "ghcr.io" or parsed.path != f"{PATH}/tags/list":
                raise RuntimeError("GHCR pagination escaped release repository")
            url = next_url
        if highest is None:
            return None
        sequence, short, tag = highest
        with self._request(f"{ORIGIN}{PATH}/manifests/{tag}", "HEAD") as response:
            digest = response.headers.get("Docker-Content-Digest", "")
        if not DIGEST.fullmatch(digest):
            raise RuntimeError("GHCR ready tag has no valid immutable digest")
        return sequence, short, f"{REPOSITORY}@{digest}"
