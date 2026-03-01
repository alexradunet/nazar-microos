#!/bin/bash
# KIWI post-install configuration script for Nazar MicroOS image.
# Runs inside the image chroot during build.

set -euo pipefail

#======================================
# Enable services
#--------------------------------------
systemctl enable sshd.service
systemctl enable podman.socket
systemctl enable nazar-setup.service
systemctl enable tailscaled.service
systemctl enable nazar-evolve-resume.service

#======================================
# Create nazar data directories
#--------------------------------------
mkdir -p /var/lib/nazar/objects
mkdir -p /var/lib/nazar/conduit
mkdir -p /var/lib/nazar/matrix-storage
mkdir -p /var/lib/nazar/evolution
chown -R nazar-agent:nazar-agent /var/lib/nazar

#======================================
# Install nazar scripts
#--------------------------------------
install -m 0755 /usr/share/nazar/scripts/nazar-object.sh /usr/local/bin/nazar-object
install -m 0755 /usr/share/nazar/scripts/nazar-setup.sh /usr/local/bin/nazar-setup
install -m 0755 /usr/share/nazar/scripts/nazar-evolve.sh /usr/local/bin/nazar-evolve

#======================================
# Install sudoers for nazar-evolve
#--------------------------------------
install -m 0440 /etc/sudoers.d/nazar-evolve /etc/sudoers.d/nazar-evolve

#======================================
# Seed default config if not present
#--------------------------------------
if [[ ! -f /etc/nazar/nazar.yaml ]]; then
  cp /etc/nazar/nazar.yaml.default /etc/nazar/nazar.yaml
fi

#======================================
# Set default firewall (firewalld)
#--------------------------------------
if command -v firewall-offline-cmd >/dev/null 2>&1; then
  firewall-offline-cmd --set-default-zone=drop
  firewall-offline-cmd --zone=drop --add-service=ssh
fi
