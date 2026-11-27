# ISO inspection report path validation

The inspector runs xorriso listing commands for the top-level ISO directory and `/casper`. xorriso's listing output can present entry names relative to the directory being listed, rather than full absolute paths.

Use the path validator only to confirm that a path's expected entry name appears in the report:

```bash
scripts/inspect-base-iso.sh /path/to/source.iso /path/to/inspection.txt
scripts/validate-inspection-paths.sh /path/to/inspection.txt /casper/filesystem.squashfs /casper/vmlinuz /casper/initrd
```

The validator checks report structure and presence of requested entry names. It does **not** prove the entries are at the requested directory, that they are compatible with LiveFS Editor, or that the ISO is bootable. Before defining customization YAML, manually review the actual report and identify the precise image layer and installer structure. A real authenticated Ubuntu Desktop ISO is required for this work; fixture tests are not compatibility evidence.
