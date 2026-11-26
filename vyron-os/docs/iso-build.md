# Bhupendra VyronOS ISO build (prototype)

## Host prerequisites
Use a dedicated Ubuntu 24.04 machine or VM with sufficient disk space and RAM. The repository scripts are scaffolding and the resulting image is not yet a complete customized OS.

1. Clone this repository and check out `vyron-os-foundation`.
2. From the repository root, prepare packages on the Ubuntu build host:
   `sudo bash vyron-os/scripts/prepare-host.sh`
3. Run the preflight checks: `bash vyron-os/scripts/preflight.sh` (this checks against your host apt cache, not a guaranteed Noble repository mirror).
4. Review the package list and live-build options. Build script runs live-build in a new build directory:
   `bash vyron-os/scripts/build-iso.sh`

## Status and caveats
- This initial script attempts to produce an ISO using live-build and the configured package list. It has not been tested on an Ubuntu host.
- The current configuration does not yet fully install desktop branding, custom login manager artwork, portal services, role-enforcement controls, or app-specific security rules in the image.
- ISO build dependencies and package availability must be checked on the target host; build may fail and require revisions.
- Test in VirtualBox/QEMU before installing to hardware. Do not install an untested image on your main computer.

## Automated checks
The branch includes a GitHub Actions structural-validation workflow. It checks shell syntax, hooks, SVG parsing, preflight structure, and emits an advisory package availability audit against the runner's apt metadata. This audit is informational; it is not a full Noble live-build test or a boot test.
