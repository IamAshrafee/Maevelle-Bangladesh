from dataclasses import dataclass

from .host import CONTAINERS, SERVICES, Host
from .manifest import validate


@dataclass(frozen=True)
class Plan:
    target_sha: str
    pending: tuple[str, ...]
    changed: tuple[str, ...]
    selected: tuple[str, ...]
    old_refs: dict[str, str]
    new_refs: dict[str, str]
    applied: tuple[str, ...]
    states: dict[str, str]

    def as_dict(self, host: Host) -> dict:
        return {
            "targetCommit": self.target_sha,
            "appliedMigrations": len(self.applied),
            "pendingMigrations": list(self.pending),
            "changedImages": list(self.changed),
            "selectedServices": list(self.selected),
            "restartOrder": (["stop worker", "restart api", "restart admin", "restart storefront", "start worker"] if "worker" in self.selected else [f"restart {name}" for name in self.selected]),
            "quadletFilesToChange": [str(host.quadlets[name]) for name in self.changed],
            "oldImageRefs": {name: self.old_refs[name] for name in self.changed},
            "newImageRefs": {name: self.new_refs[name] for name in self.changed},
            "reloadUserSystemd": bool(self.changed),
            "blockedByMigration": bool(self.pending),
            "compatibilityAssumption": "UI-only digest changes are selective; an API or Worker change coordinates all four application services. File changes alone do not prove runtime compatibility.",
            "untouched": ["maevelle-postgres.service", "maevelle-caddy.service", "maevelle-staging-postgres", "maevelle-staging-media", "shared Nginx"],
        }


def build_plan(manifest: dict, host: Host, current_record: dict | None = None) -> Plan:
    validate(manifest)
    host.verify_identity()
    states = host.service_states()
    if any(states.get(name) != "active" for name in CONTAINERS):
        raise RuntimeError("All six Maevelle units must be active before deployment; inspect status first")
    old_refs = host.quadlet_refs()
    running_refs = host.container_refs()
    for name in SERVICES:
        if running_refs[name] != old_refs[name]:
            raise RuntimeError(f"Running {name} image differs from its Quadlet Image; reconcile before deployment")
    applied = host.ledger()
    expected = manifest["schema"]["migrationNames"]
    if applied != expected[:len(applied)]:
        raise RuntimeError("Staging migration ledger is not a prefix of target release history")
    if current_record is not None:
        current_manifest = validate(current_record["manifest"])
        if current_record.get("outcome") != "verified" or any(old_refs[name] != current_manifest["images"][name]["ref"] for name in SERVICES):
            raise RuntimeError("Recorded release and running Quadlet image refs disagree; manual reconciliation required")
    pending = tuple(expected[len(applied):])
    new_refs = {name: manifest["images"][name]["ref"] for name in SERVICES}
    changed = tuple(name for name in SERVICES if old_refs[name] != new_refs[name])
    if any(name in changed for name in ("api", "worker")):
        selected = ("api", "admin", "storefront", "worker")
    else:
        selected = tuple(name for name in ("admin", "storefront") if name in changed)
    return Plan(manifest["commitSha"], pending, changed, selected, old_refs, new_refs, tuple(applied), states)
