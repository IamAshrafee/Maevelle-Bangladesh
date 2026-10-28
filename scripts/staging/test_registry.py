import io
import json
import unittest
import urllib.error
from email.message import Message
from types import SimpleNamespace

from staging.registry import Ghcr


class Response(io.BytesIO):
    def __init__(self, data=None, headers=None):
        super().__init__(json.dumps(data or {}).encode())
        self.headers = headers or {}


class RegistryTests(unittest.TestCase):
    def test_selects_highest_ready_pipeline_not_unfinished_image(self):
        client = Ghcr()
        calls = []
        def request(url, method="GET"):
            calls.append((url, method))
            if method == "HEAD":
                return Response(headers={"Docker-Content-Digest": "sha256:" + "a" * 64})
            return Response({"tags": ["staging-" + "f" * 12,
                "staging-ready-000000000012-" + "b" * 12,
                "staging-ready-000000000011-" + "c" * 12]})
        client._request = request
        self.assertEqual(client.latest(), (12, "b" * 12, "ghcr.io/iamashrafee/maevelle-release@sha256:" + "a" * 64))
        self.assertIn("staging-ready-000000000012-", calls[-1][0])

    def test_no_published_ready_release(self):
        client = Ghcr()
        client._request = lambda *_: Response({"tags": ["staging-" + "a" * 12]})
        self.assertIsNone(client.latest())

    def test_wrong_digest_refused(self):
        client = Ghcr()
        client._request = lambda url, method="GET": Response(headers={"Docker-Content-Digest": "wrong"}) if method == "HEAD" else Response({"tags": ["staging-ready-000000000012-" + "b" * 12]})
        with self.assertRaisesRegex(RuntimeError, "valid immutable digest"):
            client.latest()

    def test_private_ghcr_authentication_failure_is_sanitized(self):
        challenge = Message()
        challenge["www-authenticate"] = 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:iamashrafee/maevelle-release:pull"'
        def opener(request, timeout):
            if request.full_url.startswith("https://ghcr.io/token"):
                raise urllib.error.HTTPError(request.full_url, 401, "denied", Message(), None)
            raise urllib.error.HTTPError(request.full_url, 401, "challenge", challenge, None)
        client = Ghcr(opener=opener, credential_provider=lambda: ("operator", "synthetic-secret"))
        with self.assertRaisesRegex(RuntimeError, "login rejected") as caught:
            client.latest()
        self.assertNotIn("synthetic-secret", str(caught.exception))
