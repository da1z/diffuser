FROM oven/bun:1

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Rename the base image's "bun" user (UID 1000) to "agent".
# This keeps UID 1000 so that --userns=keep-id (Podman) and
# --user 1000:1000 (Docker) map to the correct home directory owner.
RUN usermod -d /home/agent -m -l agent bun
USER agent

# Install user-scoped Bun packages under the agent home directory.
ENV HOME="/home/agent" \
  BUN_INSTALL="/home/agent/.bun" \
  BUN_INSTALL_BIN="/home/agent/.bun/bin" \
  PATH="/home/agent/.local/bin:/home/agent/.bun/bin:$PATH"

ARG EFFECT_SOURCE_REPO="Effect-TS/effect-smol"
ARG EFFECT_SOURCE_REF="c5d7373d20e3daf0d9529271f2f632ed68f5b336"
ARG PIERRE_SOURCE_REPO="pierrecomputer/pierre"
ARG PIERRE_SOURCE_REF="aa2768a3183c7780696d32f336f2bbf6c4f31874"

# Install Cursor CLI
RUN curl https://cursor.com/install -fsS | bash

# Install Effect Solutions CLI
RUN bun add -g effect-solutions \
  && effect-solutions --version

# Clone Effect source where Effect Solutions expects local examples.
RUN mkdir -p /home/agent/.local/share/effect-solutions \
  && git clone --depth 1 "https://github.com/${EFFECT_SOURCE_REPO}.git" /home/agent/.local/share/effect-solutions/effect \
  && git -C /home/agent/.local/share/effect-solutions/effect fetch --depth 1 origin "${EFFECT_SOURCE_REF}" \
  && git -C /home/agent/.local/share/effect-solutions/effect checkout --detach "${EFFECT_SOURCE_REF}" \
  && git -C /home/agent/.local/share/effect-solutions/effect rev-parse --short HEAD

# Clone Pierre source for @pierre/diffs development/reference.
RUN mkdir -p /home/agent/.local/share/pierre \
  && git clone --depth 1 "https://github.com/${PIERRE_SOURCE_REPO}.git" /home/agent/.local/share/pierre/pierre \
  && git -C /home/agent/.local/share/pierre/pierre fetch --depth 1 origin "${PIERRE_SOURCE_REF}" \
  && git -C /home/agent/.local/share/pierre/pierre checkout --detach "${PIERRE_SOURCE_REF}" \
  && git -C /home/agent/.local/share/pierre/pierre rev-parse --short HEAD

# Docker runs the container as the host UID/GID, so the home directory must be
# writable even when the host UID is not 1000.
USER root
RUN chmod -R a+rwX /home/agent
USER agent

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
