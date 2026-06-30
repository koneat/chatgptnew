FROM kalilinux/kali-rolling

ARG HEXSTRIKE_REPO=https://github.com/0x4m4/hexstrike-ai.git
ARG HEXSTRIKE_REF=master
ARG INSTALL_GO_TOOLS=true
ARG INSTALL_PY_TOOLS=true

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUNBUFFERED=1 \
    GOBIN=/usr/local/bin \
    GOPATH=/opt/go \
    PATH=/opt/hexstrike/venv/bin:/root/.local/bin:/usr/local/go/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    HEXSTRIKE_HOST=0.0.0.0 \
    HEXSTRIKE_PORT=8888 \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver

WORKDIR /opt

COPY docker/install-tools.sh /tmp/install-tools.sh
RUN chmod +x /tmp/install-tools.sh && \
    INSTALL_GO_TOOLS=${INSTALL_GO_TOOLS} INSTALL_PY_TOOLS=${INSTALL_PY_TOOLS} /tmp/install-tools.sh

RUN git clone --depth 1 --branch "${HEXSTRIKE_REF}" "${HEXSTRIKE_REPO}" /opt/hexstrike

WORKDIR /opt/hexstrike

COPY docker/patch_hexstrike.py /usr/local/bin/patch_hexstrike.py
RUN python3 -m venv /opt/hexstrike/venv && \
    /opt/hexstrike/venv/bin/python -m pip install --upgrade pip setuptools wheel && \
    /opt/hexstrike/venv/bin/pip install -r requirements.txt && \
    python3 /usr/local/bin/patch_hexstrike.py /opt/hexstrike && \
    chmod +x /opt/hexstrike/hexstrike_server.py /opt/hexstrike/hexstrike_mcp.py

COPY docker/entrypoint.sh /entrypoint.sh
COPY scripts/healthcheck.sh /usr/local/bin/hexstrike-healthcheck

RUN chmod +x /entrypoint.sh /usr/local/bin/hexstrike-healthcheck && \
    mkdir -p /workspace /reports /data /root/.config/hexstrike /root/.cache && \
    ln -sf /opt/hexstrike/venv/bin/python /usr/local/bin/hexstrike-python

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=60s \
  CMD /usr/local/bin/hexstrike-healthcheck

ENTRYPOINT ["/entrypoint.sh"]
CMD ["server"]
