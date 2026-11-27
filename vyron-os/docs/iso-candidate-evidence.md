# ISO candidate evidence recorder

Run after a candidate ISO exists, from any directory:

```bash
bash vyron-os/scripts/record-iso-evidence.sh PATH_TO_OUTPUT_ISO EVIDENCE_DIRECTORY [PATH_TO_SOURCE_ISO]
```

The script writes a text record and output checksum file, recording UTC time, the local repository HEAD (or `unknown` if not in a Git checkout), host details, filenames and SHA256 values. The optional source ISO checksum is recorded for traceability.

This is bookkeeping, not a security attestation or release gate. It does not authenticate the source ISO, prove the output is bootable, certify installation or VM behavior, or label an image release-ready. Authenticate source files independently and complete the VM checklist before distributing an image.
