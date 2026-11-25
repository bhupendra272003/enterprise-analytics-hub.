#!/usr/bin/env python3
import csv
import json
import math
import os
import statistics
import sys
from collections import Counter

def is_number(value):
    try:
        number = float(value)
        return math.isfinite(number)
    except (TypeError, ValueError):
        return False

def profile(rows, headers):
    total = len(rows) * len(headers)
    missing = sum(1 for row in rows for key in headers if not str(row.get(key, "")).strip())
    unique = len({tuple(row.get(key, "") for key in headers) for row in rows})
    numeric_cells = valid_numeric = 0
    for key in headers:
        values = [str(row.get(key, "")).strip() for row in rows if str(row.get(key, "")).strip()]
        if values and sum(is_number(v) for v in values) / len(values) >= 0.5:
            numeric_cells += len(values)
            valid_numeric += sum(is_number(v) for v in values)
    completeness = 100 if total == 0 else (total - missing) / total * 100
    uniqueness = 100 if not rows else unique / len(rows) * 100
    validity = 100 if numeric_cells == 0 else valid_numeric / numeric_cells * 100
    score = round(completeness * 0.5 + uniqueness * 0.3 + validity * 0.2, 2)
    return {"rows": len(rows), "cells": total, "missingCells": missing, "duplicateRows": len(rows) - unique,
            "completeness": round(completeness, 2), "uniqueness": round(uniqueness, 2),
            "validity": round(validity, 2), "qualityScore": score}

def main():
    source, destination, raw_options = sys.argv[1:4]
    options = json.loads(raw_options)
    with open(source, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        if not headers or len(headers) > 200 or any(not h or not h.strip() for h in headers):
            raise ValueError("CSV must contain between 1 and 200 valid column headers.")
        rows = list(reader)
    if not rows:
        raise ValueError("CSV must contain at least one data row.")
    if any(None in row for row in rows):
        raise ValueError("CSV rows have more values than the header. Fix the source structure first.")
    rows = [{key: str(row.get(key, "") or "") for key in headers} for row in rows]
    before = profile(rows, headers)

    if options.get("trimWhitespace", True):
        for row in rows:
            for key in headers:
                row[key] = row[key].strip()

    removed_duplicates = 0
    if options.get("removeDuplicates", True):
        seen = set()
        cleaned = []
        for row in rows:
            signature = tuple(row[key] for key in headers)
            if signature in seen:
                removed_duplicates += 1
                continue
            seen.add(signature)
            cleaned.append(row)
        rows = cleaned

    strategy = options.get("fillMissing", "none")
    if strategy not in ("none", "zero", "mean", "median", "mode"):
        raise ValueError("Unsupported missing-value strategy.")
    filled_cells = 0
    if strategy != "none":
        for key in headers:
            values = [row[key] for row in rows if row[key] != ""]
            if not values:
                continue
            numeric = bool(values) and all(is_number(v) for v in values)
            replacement = ""
            if strategy == "zero":
                replacement = "0"
            elif strategy == "mode":
                replacement = Counter(values).most_common(1)[0][0]
            elif numeric and strategy == "mean":
                replacement = str(round(statistics.mean(float(v) for v in values), 6))
            elif numeric and strategy == "median":
                replacement = str(round(statistics.median(float(v) for v in values), 6))
            for row in rows:
                if row[key] == "" and replacement != "":
                    row[key] = replacement
                    filled_cells += 1

    after = profile(rows, headers)
    numeric_outliers = {}
    for key in headers:
        values = [float(row[key]) for row in rows if is_number(row[key])]
        if len(values) >= 4 and len(values) / max(1, sum(1 for row in rows if row[key].strip())) >= 0.9:
            ordered = sorted(values)
            middle = len(ordered) // 2
            lower = ordered[:middle] if len(ordered) % 2 else ordered[:middle]
            upper = ordered[middle+1:] if len(ordered) % 2 else ordered[middle:]
            q1 = statistics.median(lower)
            q3 = statistics.median(upper)
            spread = q3 - q1
            count = sum(1 for value in values if value < q1 - 1.5 * spread or value > q3 + 1.5 * spread)
            if count:
                numeric_outliers[key] = count

    with open(destination, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    os.chmod(destination, 0o600)

    print(json.dumps({"before": before, "after": after, "removedDuplicates": removed_duplicates,
                      "filledCells": filled_cells, "fillStrategy": strategy,
                      "outliersByColumn": numeric_outliers, "columns": headers,
                      "preview": rows[:10]}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(2)
