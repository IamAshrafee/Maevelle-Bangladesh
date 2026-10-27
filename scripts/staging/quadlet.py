from pathlib import Path


def section_fields(text: str, wanted: str) -> dict[str, list[str]]:
    section = None
    values: dict[str, list[str]] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            section = stripped[1:-1]
        elif section == wanted and stripped and not stripped.startswith(("#", ";")) and "=" in stripped:
            key, value = stripped.split("=", 1)
            values.setdefault(key.strip(), []).append(value.strip())
    return values


def fields(text: str) -> dict[str, list[str]]:
    return section_fields(text, "Container")


def resource_name(directory: Path, reference: str, section: str, key: str) -> str:
    path = directory / reference
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != directory.stat().st_uid:
        raise ValueError(f"Missing or unsafe Quadlet resource: {path}")
    values = section_fields(path.read_text(encoding="utf-8"), section)
    names = values.get(key, [])
    if len(names) != 1 or not names[0]:
        raise ValueError(f"Quadlet resource needs exactly one [{section}] {key}: {path}")
    return names[0]


def validate_network(values: dict[str, list[str]], directory: Path) -> None:
    networks = values.get("Network", [])
    if len(networks) != 1:
        raise ValueError("Quadlet must declare exactly one Maevelle staging network")
    network = networks[0]
    if network == "maevelle-staging":
        return
    if network != "maevelle.network" or resource_name(directory, network, "Network", "NetworkName") != "maevelle-staging":
        raise ValueError("Quadlet network does not resolve to Maevelle staging")


def has_volume(values: dict[str, list[str]], directory: Path, expected: str, references: tuple[str, ...]) -> bool:
    matches = 0
    for declaration in values.get("Volume", []):
        parts = declaration.split(":")
        if len(parts) not in (2, 3) or not parts[0] or not parts[1].startswith("/"):
            raise ValueError("Malformed Quadlet Volume declaration")
        source = parts[0]
        if source == expected:
            matches += 1
        if source in references and resource_name(directory, source, "Volume", "VolumeName") == expected:
            matches += 1
    if matches > 1:
        raise ValueError(f"Multiple Quadlet mounts resolve to {expected}")
    return matches == 1


def inspect(path: Path, expected_container: str) -> tuple[str, str]:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected regular Quadlet file: {path}")
    text = path.read_text(encoding="utf-8")
    values = fields(text)
    if values.get("ContainerName") != [expected_container]:
        raise ValueError(f"Quadlet container identity mismatch: {path}")
    if len(values.get("Image", [])) != 1:
        raise ValueError(f"Quadlet must contain one [Container] Image: {path}")
    validate_network(values, path.parent)
    return text, values["Image"][0]


def replace_image(text: str, old: str, new: str) -> str:
    section = None
    count = 0
    result = []
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            section = stripped[1:-1]
        if section == "Container" and stripped.startswith("Image="):
            if stripped != f"Image={old}":
                raise ValueError("Quadlet changed since planning")
            ending = "\r\n" if line.endswith("\r\n") else "\n" if line.endswith("\n") else ""
            line = f"Image={new}{ending}"
            count += 1
        result.append(line)
    if count != 1:
        raise ValueError("Expected exactly one Image line")
    return "".join(result)
