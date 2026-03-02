FROM quay.io/fedora/fedora-bootc:42

# System packages (replaces nazar-rpm-layer.service)
RUN dnf install -y \
      yq jq git-core nodejs22 tailscale vim-minimal htop tmux \
    && dnf clean all

# Pi coding agent (replaces npm install in nazar-setup.service)
RUN npm install -g @mariozechner/pi-coding-agent

# System user + directory definitions (systemd creates at boot)
COPY sysconfig/sysusers.d/nazar.conf /usr/lib/sysusers.d/nazar.conf
COPY sysconfig/tmpfiles.d/nazar.conf /usr/lib/tmpfiles.d/nazar.conf

# Hostname
RUN echo "nazar-box" > /etc/hostname

# Sudoers
COPY sysconfig/sudoers.d/core-wheel /etc/sudoers.d/core-wheel
COPY sysconfig/sudoers.d/nazar-evolve /etc/sudoers.d/nazar-evolve
RUN chmod 0440 /etc/sudoers.d/core-wheel /etc/sudoers.d/nazar-evolve

# Tailscale login prompt
COPY sysconfig/profile.d/tailscale-login.sh /etc/profile.d/tailscale-login.sh

# CLI scripts
COPY scripts/nazar /usr/local/bin/nazar
COPY scripts/nazar-setup.sh /usr/local/bin/nazar-setup
COPY scripts/nazar-object.sh /usr/local/bin/nazar-object
COPY scripts/nazar-evolve.sh /usr/local/bin/nazar-evolve
COPY scripts/nazar-vm.sh /usr/local/bin/nazar-vm
COPY scripts/nazar-deploy.sh /usr/local/bin/nazar-deploy
RUN chmod 0755 /usr/local/bin/nazar /usr/local/bin/nazar-setup \
      /usr/local/bin/nazar-object /usr/local/bin/nazar-evolve \
      /usr/local/bin/nazar-vm /usr/local/bin/nazar-deploy

# Default config (/etc is mutable — user edits persist across updates)
RUN mkdir -p /etc/nazar
COPY sysconfig/nazar.yaml.default /etc/nazar/nazar.yaml

# System documentation
RUN mkdir -p /usr/local/share/nazar
COPY sysconfig/SYSTEM.md /usr/local/share/nazar/SYSTEM.md

# Persona files
RUN mkdir -p /usr/local/share/nazar/persona
COPY persona/SOUL.md /usr/local/share/nazar/persona/SOUL.md
COPY persona/BODY.md /usr/local/share/nazar/persona/BODY.md
COPY persona/FACULTY.md /usr/local/share/nazar/persona/FACULTY.md
COPY persona/SKILL.md /usr/local/share/nazar/persona/SKILL.md

# Skills
RUN mkdir -p /usr/local/share/nazar/skills
COPY skills/ /usr/local/share/nazar/skills/

# Enable services
RUN systemctl enable tailscaled.service
COPY sysconfig/systemd/nazar-setup.service /usr/lib/systemd/system/nazar-setup.service
RUN systemctl enable nazar-setup.service

# Validate
RUN bootc container lint
