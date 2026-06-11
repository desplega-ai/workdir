# workdir base curated image (spec §10.2).
# Built into an ext4 rootfs by deploy/build-image.sh.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash coreutils curl wget ca-certificates git socat iproute2 iputils-ping \
      python3 python3-pip python3-venv nodejs npm build-essential \
    && rm -rf /var/lib/apt/lists/*
# The guest agent (built for Linux) is copied in by build-image.sh.
COPY sandbox-guest-agent /usr/local/bin/sandbox-guest-agent
COPY sandbox-init /sbin/sandbox-init
RUN chmod +x /usr/local/bin/sandbox-guest-agent /sbin/sandbox-init && mkdir -p /workspace
