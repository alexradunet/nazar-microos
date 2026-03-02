FROM quay.io/fedora/fedora-bootc:42

# System packages
RUN dnf install -y \
      git-core nodejs22 tailscale vim-minimal htop tmux \
    && dnf clean all

# Pi coding agent
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

# nazar-core TypeScript CLI (replaces nazar-setup.sh, nazar-object.sh, nazar-evolve.sh)
COPY packages/nazar-core/package.json /usr/local/lib/nazar-core/package.json
COPY packages/nazar-core/dist/ /usr/local/lib/nazar-core/dist/
RUN cd /usr/local/lib/nazar-core && npm install --omit=dev
RUN ln -s /usr/local/lib/nazar-core/dist/cli.js /usr/local/bin/nazar-core \
    && chmod +x /usr/local/lib/nazar-core/dist/cli.js

# Compatibility shims (Pi skills may call nazar-object directly)
RUN printf '#!/usr/bin/env bash\nexec nazar-core object "$@"\n' > /usr/local/bin/nazar-object \
    && chmod +x /usr/local/bin/nazar-object
RUN printf '#!/usr/bin/env bash\nexec nazar-core setup "$@"\n' > /usr/local/bin/nazar-setup \
    && chmod +x /usr/local/bin/nazar-setup
RUN printf '#!/usr/bin/env bash\nexec nazar-core evolve "$@"\n' > /usr/local/bin/nazar-evolve \
    && chmod +x /usr/local/bin/nazar-evolve

# CLI scripts
COPY scripts/nazar /usr/local/bin/nazar
COPY scripts/nazar-vm.sh /usr/local/bin/nazar-vm
COPY scripts/nazar-deploy.sh /usr/local/bin/nazar-deploy
RUN chmod 0755 /usr/local/bin/nazar \
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
