# The web relay on a server (a NAS, a Raspberry Pi, a VPS): Chromium and the Linux zinc in one image. Built by ./build (README.md).
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*
COPY zinc.tar.gz /tmp/zinc.tar.gz
RUN mkdir /opt/zinc && tar xzf /tmp/zinc.tar.gz -C /opt/zinc --strip-components 1 && rm /tmp/zinc.tar.gz
COPY web-relay /opt/web-relay
RUN useradd -m relay && mkdir /data && chown relay /data
USER relay
VOLUME /data
EXPOSE 8790
# --no-sandbox: a container is the sandbox (Chromium's own needs privileges a container does not give); --block-private: see README.md
ENTRYPOINT ["/opt/zinc/bin/zinc", "run", "/opt/web-relay", "--", "--port", "8790", "--data", "/data", "--no-open", "--no-sandbox", "--block-private"]
