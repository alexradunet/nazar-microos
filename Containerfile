FROM quay.io/fedora/fedora-bootc:42

# System packages
RUN dnf install -y \
      git-core nodejs22 tailscale vim-minimal htop tmux \
    && dnf clean all

# Pi coding agent
RUN HOME=/tmp npm install -g @mariozechner/pi-coding-agent

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

# nazar-core TypeScript CLI
COPY packages/nazar-core/package.json /usr/local/lib/nazar-core/package.json
COPY packages/nazar-core/dist/ /usr/local/lib/nazar-core/dist/
RUN cd /usr/local/lib/nazar-core && HOME=/tmp npm install --omit=dev
RUN ln -s /usr/local/lib/nazar-core/dist/cli.js /usr/local/bin/nazar-core \
    && chmod +x /usr/local/lib/nazar-core/dist/cli.js \
    && printf '#!/usr/bin/env bash\nexec nazar-core object "$@"\n' > /usr/local/bin/nazar-object \
    && printf '#!/usr/bin/env bash\nexec nazar-core setup "$@"\n' > /usr/local/bin/nazar-setup \
    && printf '#!/usr/bin/env bash\nexec nazar-core evolve "$@"\n' > /usr/local/bin/nazar-evolve \
    && chmod +x /usr/local/bin/nazar-object /usr/local/bin/nazar-setup /usr/local/bin/nazar-evolve

# CLI scripts
COPY scripts/nazar /usr/local/bin/nazar
COPY scripts/nazar-vm.sh /usr/local/bin/nazar-vm
COPY scripts/nazar-deploy.sh /usr/local/bin/nazar-deploy
RUN chmod 0755 /usr/local/bin/nazar /usr/local/bin/nazar-vm /usr/local/bin/nazar-deploy \
    && mkdir -p /etc/nazar /usr/local/share/nazar/persona /usr/local/share/nazar/skills

# Config, docs, persona, skills
COPY sysconfig/nazar.yaml.default /etc/nazar/nazar.yaml
COPY sysconfig/SYSTEM.md /usr/local/share/nazar/SYSTEM.md
COPY persona/ /usr/local/share/nazar/persona/
COPY skills/ /usr/local/share/nazar/skills/

# Enable services
COPY sysconfig/systemd/nazar-setup.service /usr/lib/systemd/system/nazar-setup.service
RUN systemctl enable tailscaled.service nazar-setup.service

# Validate
RUN bootc container lint
