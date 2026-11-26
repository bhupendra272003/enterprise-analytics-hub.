# Package source audit (Ubuntu 24.04 Noble)

## Current manifest policy
`config/packages.list` is intended for packages available from Ubuntu repositories. Vendor-specific tools must be handled in a separate, reviewed provisioning step rather than assumed to exist in Noble's package index.

## Workbench exception
MySQL Workbench is intentionally excluded from the Ubuntu-only manifest. Ubuntu package search currently does not list `mysql-workbench` for Noble. Vendor repository availability, architecture support, licensing, and unattended-install behavior must be evaluated separately before inclusion. MySQL server/client remain in the base package list.

## Validation limits
- A host's `apt-cache` result is advisory and reflects that host's configured sources.
- CI manifest syntax checks are not package-resolution tests.
- A full dependency-resolution test must use an isolated Ubuntu 24.04 environment with the intended repositories enabled.
- Do not add third-party repositories or vendor binaries without recording source, checksum/signature verification, update behavior and licensing.

## Source notes
- Ubuntu package index searches for MySQL Workbench and Noble database packages were reviewed during this audit.
- No package installation or ISO build was performed during this review.
