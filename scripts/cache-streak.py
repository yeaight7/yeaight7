"""Refresh the optional streak card without discarding the last good copy."""

import os
from http.client import HTTPException
from pathlib import Path
import sys
import tempfile
import time
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


def main(url, destination):
    destination = Path(destination)
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "github-profile-streak-cache"})
            with urlopen(request, timeout=10) as response:
                data = response.read(2_000_001)
            if len(data) > 2_000_000:
                raise ValueError("response is too large")
            root = ET.fromstring(data)
            if root.tag != "{http://www.w3.org/2000/svg}svg":
                raise ValueError("response is not an SVG")
        except (OSError, HTTPException, ValueError, ET.ParseError) as error:
            if attempt < 2:
                time.sleep(float(os.environ.get("STREAK_RETRY_DELAY", "2")))
            else:
                print(f"::warning::Streak card unavailable; keeping the previous card: {error}", file=sys.stderr)
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as temporary:
            temp_path = Path(temporary.name)
            try:
                temporary.write(data)
            except BaseException:
                temp_path.unlink(missing_ok=True)
                raise
        try:
            temp_path.replace(destination)
        finally:
            temp_path.unlink(missing_ok=True)
        return


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
