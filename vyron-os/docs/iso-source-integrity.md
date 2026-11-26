# ISO source integrity workflow

1. Download the Ubuntu 24.04 Desktop ISO, SHA256SUMS and SHA256SUMS.gpg from the official release directory.
2. Authenticate the checksum file using the official Ubuntu signing key and signature. Do not rely on an unauthenticated checksum.
3. Run `bash scripts/verify-iso-checksum.sh /path/to/ubuntu.iso /path/to/SHA256SUMS`.
4. Only proceed to remastering after authentication and checksum match. Keep source media untouched.

The helper verifies the ISO's hash entry against the supplied checksum file; it does **not** authenticate the checksum file/signature and is not a substitute for step 2.
